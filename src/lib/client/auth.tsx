"use client";
// Sign-in for NEAR wallets (NEP-413 signMessage) and EVM wallets (personal_sign), plus basket-key setup.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { b64ToBytes, NEP413_RECIPIENT } from "@/lib/auth/messages";
import { UNLOCK_MESSAGE_V1, UNLOCK_NONCE_V1 } from "@/lib/intents/keys";
import { hexToBytes, type BasketKey } from "@/lib/intents/keys";
import type { Intent } from "@/lib/intents/payload";
import { erc191Payload, erc191Signed, nep413Request, nep413Signed, type SignedErc191, type SignedNep413 } from "@/lib/intents/wallet-sign";
import { nearSignIn, nearSignMessage, nearSignOut } from "./near";
import { basketKey, confirmDeviceKey, hasSeed, pendingDeviceKey, restoreDerived, setupKeys, type KeyMode } from "./keystore";

export interface User {
  id: number;
  chain: "near" | "evm";
  address: string;
  walletPubkey: string | null;
  handle: string | null;
  keyMode: KeyMode | null;
  isAdmin: boolean;
}

interface AuthValue {
  user: User | null;
  loading: boolean;
  busy: string | null; // what we're waiting on, shown in the UI
  error: string | null;
  signInNear: () => Promise<void>;
  signInEvm: (connectorId?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Make sure basket keys are usable in this browser. Returns the key mode. */
  ensureKeys: () => Promise<KeyMode>;
  /**
   * The key that signs for this basket in this browser. On a new device (device mode) the wallet first approves
   * a new browser key for the existing basket account, once.
   */
  keyForBasket: (basketId: number) => Promise<{ k: BasketKey; mode: KeyMode }>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const evm = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/api/auth/me").then((r) => r.user), staleTime: 60_000 });
  const user = me.data ?? null;
  const loading = me.isLoading;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);

  // NEAR sign-in: the server's nonce first, then pick a wallet and sign in one step (NEP-413).
  const signInNear = useCallback(async () => {
    setError(null);
    setBusy("Pick a wallet and approve the sign-in message…");
    try {
      const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/nonce", { method: "POST" });
      const signed = await nearSignIn({ message, recipient: NEP413_RECIPIENT, nonce: b64ToBytes(nonce) });
      await api("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ chain: "near", nonce, accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const signInEvm = useCallback(
    async (connectorId?: string) => {
      setError(null);
      try {
        let address = evm.address;
        if (!address) {
          setBusy("Connect your wallet…");
          const connector = connectors.find((c) => c.id === connectorId) ?? connectors[0];
          const res = await connectAsync({ connector });
          address = res.accounts[0];
        }
        setBusy("Approve the sign-in message in your wallet…");
        const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/nonce", { method: "POST" });
        const signature = await signMessageAsync({ message });
        await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ chain: "evm", nonce, address, signature }) });
        await refresh();
      } catch (e) {
        setError((e as Error).message.split("\n")[0]);
      } finally {
        setBusy(null);
      }
    },
    [evm.address, connectors, connectAsync, signMessageAsync, refresh],
  );

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    if (user?.chain === "near") await nearSignOut().catch(() => {});
    if (user?.chain === "evm") await disconnectAsync().catch(() => {});
    qc.setQueryData(["me"], null);
  }, [user, disconnectAsync, qc]);

  const signUnlock = useCallback(async (): Promise<Uint8Array> => {
    if (!user) throw new Error("Sign in first.");
    if (user.chain === "near") {
      const s = await nearSignMessage(user.address, { message: UNLOCK_MESSAGE_V1, recipient: "stonkbag-keys", nonce: Uint8Array.from(UNLOCK_NONCE_V1) });
      return b64ToBytes(s.signature);
    }
    return hexToBytes(await signMessageAsync({ message: UNLOCK_MESSAGE_V1 }));
  }, [user, signMessageAsync]);

  const ensureKeys = useCallback(async (): Promise<KeyMode> => {
    if (!user) throw new Error("Sign in first.");
    if (user.keyMode === "device") return "device";
    if (user.keyMode === "derived") {
      if (!(await hasSeed(user.address))) {
        setBusy("Sign once to unlock your basket keys on this device…");
        try {
          await restoreDerived(user.address, signUnlock);
        } finally {
          setBusy(null);
        }
      }
      return "derived";
    }
    const near1 = user.chain === "near";
    setBusy(near1 ? "Sign the key message in your wallet. This sets up your basket keys…" : "Sign the key message twice. This sets up your basket keys…");
    try {
      const mode = await setupKeys(user.address, signUnlock, { deterministic: near1 });
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ keyMode: mode }) });
      await refresh();
      return mode;
    } finally {
      setBusy(null);
    }
  }, [user, signUnlock, refresh]);

  const keyForBasket = useCallback(
    async (basketId: number): Promise<{ k: BasketKey; mode: KeyMode }> => {
      if (!user) throw new Error("Sign in first.");
      const mode = await ensureKeys();
      const { positions } = await api<{ positions: { basketId: number; accountId: string }[] }>("/api/positions");
      const accountId = positions.find((p) => p.basketId === basketId)?.accountId;
      const k = await basketKey(user.address, mode, basketId, accountId);
      if (k) {
        if (accountId && k.accountId !== accountId) throw new Error("This basket account was made with a different key setup. Sign in with the wallet you used to buy it.");
        return { k, mode };
      }
      if (mode === "derived" || !accountId) throw new Error("Couldn't unlock this basket's key.");

      // New browser, device mode: the wallet (a recovery key on the account) approves a new browser key.
      setBusy("New browser: approve once in your wallet to use this basket here…");
      try {
        const nk = await pendingDeviceKey(user.address, basketId, accountId);
        const intents: Intent[] = [{ intent: "add_public_key", public_key: nk.publicKeyStr }];
        let signed: SignedErc191 | SignedNep413;
        if (user.chain === "evm") {
          const payload = erc191Payload(accountId, intents);
          signed = erc191Signed(payload, await signMessageAsync({ message: payload }));
        } else {
          const req = nep413Request(accountId, intents);
          const s = await nearSignMessage(user.address, { message: req.message, recipient: req.recipient, nonce: req.nonce });
          signed = nep413Signed(req, s.publicKey, s.signature);
        }
        await api("/api/relay/authorize-device", { method: "POST", body: JSON.stringify({ signed }) });
        await confirmDeviceKey(user.address, basketId);
        return { k: nk, mode };
      } finally {
        setBusy(null);
      }
    },
    [user, ensureKeys, signMessageAsync],
  );

  const value = useMemo(
    () => ({ user, loading, busy, error, signInNear, signInEvm, signOut, ensureKeys, keyForBasket, refresh }),
    [user, loading, busy, error, signInNear, signInEvm, signOut, ensureKeys, keyForBasket, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
