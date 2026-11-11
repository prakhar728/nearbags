"use client";
// What the signed-in wallet holds of each pay token, for the token picker and "Use max".
// EVM: native coins and ERC-20s on the six supported chains (one multicall per chain). NEAR: NEP-141 balances, and
// native NEAR counted toward wNEAR (the NEAR payment path wraps it on the fly).
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Hex } from "viem";
import { useConfig } from "wagmi";
import { getBalance, readContracts } from "wagmi/actions";
import { canPayFromEvm, canPayFromNear, EVM_CHAIN_IDS, nearBalance, nearFtBalance, type PayToken } from "./pay";

export interface Holding {
  amount: number; // whole tokens
  raw: bigint;
  usd: number;
}

/** Native NEAR kept back for gas and storage when paying with NEAR. */
export const NEAR_RESERVE = 0.1;

export function useWalletBalances(user: { chain: "near" | "evm"; address: string } | null | undefined, tokens: PayToken[]) {
  const config = useConfig();
  const payable = tokens.filter((t) => (user?.chain === "evm" ? canPayFromEvm(t) : user?.chain === "near" ? canPayFromNear(t) : false));
  return useQuery({
    queryKey: ["wallet-balances", user?.chain, user?.address, payable.map((t) => t.assetId).join(",")],
    enabled: !!user && payable.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const out = new Map<string, Holding>();
      const put = (t: PayToken, raw: bigint) => {
        const amount = Number(raw) / 10 ** t.decimals;
        if (amount > 0) out.set(t.assetId, { amount, raw, usd: amount * (t.price || 0) });
      };
      if (user!.chain === "evm") {
        const owner = user!.address as Hex;
        const byChain = new Map<number, PayToken[]>();
        for (const t of payable) (byChain.get(EVM_CHAIN_IDS[t.chain]) ?? byChain.set(EVM_CHAIN_IDS[t.chain], []).get(EVM_CHAIN_IDS[t.chain])!).push(t);
        await Promise.all(
          [...byChain].map(async ([chainId, list]) => {
            const natives = list.filter((t) => !t.contract);
            const erc20s = list.filter((t) => t.contract);
            await Promise.all([
              ...natives.map((t) => getBalance(config, { address: owner, chainId }).then((b) => put(t, b.value)).catch(() => {})),
              erc20s.length
                ? readContracts(config, {
                    allowFailure: true,
                    contracts: erc20s.map((t) => ({ address: t.contract as Hex, abi: erc20Abi, functionName: "balanceOf" as const, args: [owner] as const, chainId })),
                  })
                    .then((rs) => rs.forEach((r, i) => r.status === "success" && put(erc20s[i], r.result as bigint)))
                    .catch(() => {})
                : null,
            ]);
          }),
        );
      } else {
        await Promise.all(
          payable.map(async (t) => {
            try {
              let raw = await nearFtBalance(t.contract!, user!.address);
              if (t.contract === "wrap.near") {
                const free = await nearBalance(user!.address);
                const reserve = BigInt(NEAR_RESERVE * 1e6) * 10n ** 18n;
                raw += free > reserve ? free - reserve : 0n;
              }
              put(t, raw);
            } catch {}
          }),
        );
      }
      return out;
    },
  });
}
