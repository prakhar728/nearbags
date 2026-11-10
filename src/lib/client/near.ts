"use client";
// NEAR wallets through HOT Connect (@hot-labs/near-connect). Each wallet's connector code runs in a sandboxed iframe
// and is loaded from the wallet list HOT Connect publishes, so wallets update without a redeploy here.
//
// Our session is the server cookie, not the wallet connection. The wallet is only needed to sign: at sign-in, to
// unlock basket keys, to approve a new browser key, and to pay from a NEAR wallet. When nothing is connected (another
// device, cleared storage), the wallet picker opens first.
import type { NearConnector, NearWalletBase, ConnectorAction, SignMessageParams } from "@hot-labs/near-connect";
import { base58 } from "@/lib/intents/keys";

export interface NearSigned {
  accountId: string;
  publicKey: string; // "ed25519:…"
  signature: string; // base64 of the 64-byte ed25519 signature
}

let connectorP: Promise<NearConnector> | null = null;

/** The one connector for this tab. Created on first use, client only. */
export function nearConnector(): Promise<NearConnector> {
  if (typeof window === "undefined") return Promise.reject(new Error("NEAR wallets only work in the browser."));
  connectorP ??= import("@hot-labs/near-connect").then(({ NearConnector }) => {
    const c = new NearConnector({
      network: "mainnet",
      // Sign-in needs signMessage, paying needs signAndSendTransactions. Wallets without both are hidden.
      features: { signMessage: true, signAndSendTransactions: true },
      excludedWallets: ["near-cli"],
    });
    return c.whenManifestLoaded.then(() => c);
  });
  return connectorP;
}

/** Load the wallet list in the background so the picker opens at once on the first tap. */
export function prewarmNear() {
  if (typeof window === "undefined") return;
  const go = () => void nearConnector().catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 1500);
}

// Wallets return the signature as base64 (the NEP-413 convention) or, in some, base58 with or without "ed25519:".
const B58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export function signatureToB64(sig: string): string {
  let raw: Uint8Array | null = null;
  if (sig.startsWith("ed25519:")) raw = base58.decode(sig.slice(8));
  else if (!B58.test(sig)) raw = fromB64(sig); // has base64-only characters (+ / = 0 O I l)
  else {
    try {
      raw = fromB64(sig);
    } catch {}
    if (raw?.length !== 64) raw = base58.decode(sig);
  }
  if (raw.length !== 64) throw new Error("The wallet returned a signature in a format we can't read.");
  return toB64(raw);
}

const normal = (s: { accountId: string; publicKey: string; signature: string }, fallbackAccount: string): NearSigned => ({
  accountId: s.accountId || fallbackAccount,
  publicKey: s.publicKey.startsWith("ed25519:") ? s.publicKey : `ed25519:${s.publicKey}`,
  signature: signatureToB64(s.signature),
});

const rejected = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  return /reject|cancel|closed|denied/i.test(m) ? new Error("Cancelled in the wallet.") : (e as Error);
};

/** The connected wallet and its account, or null when none is connected in this browser. */
async function connected(): Promise<{ wallet: NearWalletBase; accountId: string } | null> {
  const c = await nearConnector();
  try {
    const { wallet, accounts } = await c.getConnectedWallet();
    return accounts[0] ? { wallet, accountId: accounts[0].accountId } : null;
  } catch {
    return null;
  }
}

/**
 * Sign in: pick a wallet and sign the sign-in message, in one step where the wallet supports it.
 * An already connected wallet just signs.
 */
export async function nearSignIn(msg: Omit<SignMessageParams, "network" | "signerId">): Promise<NearSigned> {
  const c = await nearConnector();
  try {
    const cur = await connected();
    if (cur) return normal(await cur.wallet.signMessage(msg), cur.accountId);
    let signed = null as NearSigned | null;
    const onSigned = (t: { accounts: { accountId: string; signedMessage: { accountId: string; publicKey: string; signature: string } }[] }) => {
      const a = t.accounts[0];
      if (a?.signedMessage) signed = normal(a.signedMessage, a.accountId);
    };
    c.on("wallet:signInAndSignMessage", onSigned);
    try {
      await c.connect({ signMessageParams: msg });
    } finally {
      c.off("wallet:signInAndSignMessage", onSigned);
    }
    if (!signed) throw new Error("The wallet didn't return a signature.");
    return signed;
  } catch (e) {
    throw rejected(e);
  }
}

/** The wallet for `accountId`, connecting it first if needed. Refuses a different account. */
async function walletFor(accountId: string): Promise<NearWalletBase> {
  const c = await nearConnector();
  let cur = await connected();
  if (!cur) {
    const wallet = await c.connect();
    const accounts = await wallet.getAccounts();
    cur = accounts[0] ? { wallet, accountId: accounts[0].accountId } : null;
  }
  if (!cur) throw new Error("No NEAR account connected.");
  if (cur.accountId !== accountId) throw new Error(`Your wallet is on ${cur.accountId}. Switch it to ${accountId}, or sign out and back in.`);
  return cur.wallet;
}

export async function nearSignMessage(accountId: string, msg: Omit<SignMessageParams, "network" | "signerId">): Promise<NearSigned> {
  try {
    const wallet = await walletFor(accountId);
    return normal(await wallet.signMessage({ ...msg, signerId: accountId }), accountId);
  } catch (e) {
    throw rejected(e);
  }
}

export async function nearSendTransactions(accountId: string, transactions: { receiverId: string; actions: ConnectorAction[] }[]) {
  try {
    const wallet = await walletFor(accountId);
    return await wallet.signAndSendTransactions({ signerId: accountId, transactions });
  } catch (e) {
    throw rejected(e);
  }
}

export async function nearSignOut() {
  if (!connectorP) return;
  const c = await connectorP;
  const cur = await connected();
  if (cur) await c.disconnect(cur.wallet).catch(() => {});
}
