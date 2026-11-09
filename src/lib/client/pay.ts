"use client";
// Pay a 1Click deposit address straight from the connected EVM wallet (native coin or ERC-20).
import { erc20Abi, type Hex } from "viem";
import type { Config } from "wagmi";
import { sendTransaction, switchChain, writeContract } from "wagmi/actions";

export const EVM_CHAIN_IDS: Record<string, number> = { eth: 1, arb: 42161, base: 8453, op: 10, pol: 137, bsc: 56 };

export interface PayToken {
  assetId: string;
  symbol: string;
  chain: string;
  decimals: number;
  price: number;
  contract: string | null;
}

export const canPayFromEvm = (t: PayToken) => t.chain in EVM_CHAIN_IDS;

export async function payFromEvm(config: Config, t: PayToken, to: string, amount: string): Promise<Hex> {
  const chainId = EVM_CHAIN_IDS[t.chain];
  await switchChain(config, { chainId });
  if (!t.contract) return sendTransaction(config, { chainId, to: to as Hex, value: BigInt(amount) });
  return writeContract(config, { chainId, address: t.contract as Hex, abi: erc20Abi, functionName: "transfer", args: [to as Hex, BigInt(amount)] });
}
