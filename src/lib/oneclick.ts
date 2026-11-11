// 1Click API client (server only: holds the partner JWT). Docs: https://docs.near-intents.org (1Click Swap API v0).
import "server-only";
import type { SignedRawEd25519 } from "@/lib/intents/payload";

const BASE = "https://1click.chaindefuser.com/v0";

export type DepositType = "ORIGIN_CHAIN" | "INTENTS";
export type RecipientType = "DESTINATION_CHAIN" | "INTENTS";

export interface QuoteRequest {
  dry: boolean;
  swapType?: "EXACT_INPUT";
  slippageTolerance: number; // bps
  originAsset: string;
  depositType: DepositType;
  destinationAsset: string;
  amount: string; // smallest units of originAsset
  recipient: string;
  recipientType: RecipientType;
  refundTo: string;
  refundType: DepositType;
  deadline?: string;
  referral?: string;
  quoteWaitingTimeMs?: number;
  /** Extra fees paid out of the swap. 1Click keeps half of each (and adds its own 20 bps). */
  appFees?: { recipient: string; fee: number }[];
}

export interface Quote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  timeEstimate: number;
  deadline?: string;
  timeWhenInactive?: string;
}

export interface QuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: QuoteRequest;
  quote: Quote;
}

export type SwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface StatusResponse {
  status: SwapStatus;
  updatedAt: string;
  swapDetails?: {
    amountIn?: string;
    amountOut?: string;
    amountInUsd?: string;
    amountOutUsd?: string;
    refundedAmount?: string;
    intentHashes?: string[];
    nearTxHashes?: string[];
    originChainTxHashes?: { hash: string; explorerUrl: string }[];
    destinationChainTxHashes?: { hash: string; explorerUrl: string }[];
  };
  quoteResponse?: QuoteResponse;
}

export interface TokenInfo {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  contractAddress?: string;
}

export class OneClickError extends Error {
  constructor(
    public status: number,
    message: string,
    public correlationId?: string,
  ) {
    super(message);
  }
  /** Solvers had nothing for this pair/size right now (market closed, thin liquidity). */
  get noLiquidity() {
    return /no liquidity/i.test(this.message);
  }
}

function jwt() {
  const t = process.env.ONECLICK_JWT;
  if (!t) throw new Error("ONECLICK_JWT is not set");
  return t;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt()}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const j = (json ?? {}) as { message?: string; correlationId?: string };
    throw new OneClickError(res.status, j.message ?? text.slice(0, 300) ?? res.statusText, j.correlationId);
  }
  return json as T;
}

const defaultDeadline = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export const oneclick = {
  tokens: (opts: { ondo?: boolean } = {}) => call<TokenInfo[]>("GET", `/tokens${opts.ondo ? "?ondoTokens=1" : ""}`),

  quote: (req: QuoteRequest, deadlineMinutes = 20) =>
    call<QuoteResponse>("POST", "/quote", {
      swapType: "EXACT_INPUT",
      referral: "stonkbag", // Keep "stonkbag": the 1Click partner referral id; change only once 1Click confirms a new one.
      deadline: defaultDeadline(deadlineMinutes),
      ...req,
    }),

  /** Unsigned payload for spending from an Intents balance into a quote's deposit address. */
  generateIntent: (depositAddress: string, signerId: string, standard: "raw_ed25519" | "nep413" | "erc191" = "raw_ed25519") =>
    call<{ intent: { standard: string; payload: string | object }; correlationId: string }>("POST", "/generate-intent", {
      type: "swap_transfer",
      standard,
      signerId,
      depositAddress,
    }),

  submitIntent: (signedData: SignedRawEd25519) =>
    call<{ intentHash: string; correlationId: string }>("POST", "/submit-intent", { type: "swap_transfer", signedData }),

  status: (depositAddress: string, depositMemo?: string) =>
    call<StatusResponse>(
      "GET",
      `/status?depositAddress=${encodeURIComponent(depositAddress)}${depositMemo ? `&depositMemo=${encodeURIComponent(depositMemo)}` : ""}`,
    ),

  submitDepositTx: (txHash: string, depositAddress: string, memo?: string) =>
    call<StatusResponse>("POST", "/deposit/submit", { txHash, depositAddress, ...(memo ? { memo } : {}) }),
};

export const isFinal = (s: SwapStatus) => s === "SUCCESS" || s === "REFUNDED" || s === "FAILED";
