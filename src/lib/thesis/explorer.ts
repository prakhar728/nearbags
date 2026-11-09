// NEAR Intents Explorer API: request shapes shared by `pnpm thesis` (which sends them) and /thesis (which shows them).
// Pure module: no fetch, no secrets. Source: https://explorer.near-intents.org/api/v0/openapi.yaml (read 2026-11-09).
import { ASSETS } from "@/lib/assets";

export const EXPLORER_BASE = "https://explorer.near-intents.org/api/v0";
export const TRANSACTIONS_PATH = "/transactions";
export const PAGE_SIZE = 1000; // spec max for numberOfTransactions
export const MIN_GAP_MS = 5_000; // spec: 1 request every 5 s per partner

// Ondo tokenized stocks and ETFs, as NEAR Intents asset ids (nep141:bnb-0x….omdep.near).
export const ONDO_ASSETS = ASSETS.filter((a) => a.kind === "stock" || a.kind === "etf");
export const ONDO_IDS = ONDO_ASSETS.map((a) => a.intentsAssetId);
export const ONDO_SYMBOL: Record<string, string> = Object.fromEntries(ONDO_ASSETS.map((a) => [a.intentsAssetId, a.id]));

export type StreamKind = "ondo-in" | "ondo-out" | "all";

export interface Cursor {
  depositAddress: string;
  depositMemo: string | null;
}

/** Query params for one page of one stream in one [start, end) window (Unix seconds). Ondo streams take ONE token id:
 *  the API does not OR repeated toTokenId/fromTokenId params (only the last one counts) and returns nothing for a
 *  comma list (both probed 2026-11-10), so the pull asks once per token. */
export function streamParams(kind: StreamKind, startSec: number, endSec: number, cursor?: Cursor | null, tokenId?: string): [string, string][] {
  const p: [string, string][] = [
    ["numberOfTransactions", String(PAGE_SIZE)],
    ["statuses", "SUCCESS"],
    // Both bounds are documented as non-inclusive, so start one second early to keep txs stamped exactly at start.
    ["startTimestampUnix", String(startSec - 1)],
    ["endTimestampUnix", String(endSec)],
  ];
  if (kind !== "all" && !tokenId) throw new Error(`${kind} needs a token id`);
  if (kind === "ondo-in") p.push(["toTokenId", tokenId!]);
  if (kind === "ondo-out") p.push(["fromTokenId", tokenId!]);
  // Token filters exclude "masking transactions"; minUsdPrice=0 applies the same exclusion to the unfiltered stream.
  // On 2026-11-10 one hour of the unfiltered feed had the same 454 rows with and without it.
  if (kind === "all") p.push(["minUsdPrice", "0"]);
  if (cursor) {
    p.push(["direction", "next"]); // next = older
    p.push(["lastDepositAddress", cursor.depositAddress]);
    if (cursor.depositMemo) p.push(["lastDepositMemo", cursor.depositMemo]);
  }
  return p;
}

export function transactionsUrl(params: [string, string][]): string {
  return `${EXPLORER_BASE}${TRANSACTIONS_PATH}?${new URLSearchParams(params).toString()}`;
}

/** Human-readable request template for the /thesis page and THESIS.md (token ids listed once, not URL-encoded). */
export function requestTemplate(kind: StreamKind): string {
  const lines = [
    `GET ${EXPLORER_BASE}${TRANSACTIONS_PATH}`,
    `Authorization: Bearer $EXPLORER_JWT`,
    `  numberOfTransactions=${PAGE_SIZE}`,
    `  statuses=SUCCESS`,
    kind === "all"
      ? `  startTimestampUnix=<week start − 1>  endTimestampUnix=<week end>   (one window per UTC week, Monday 00:00)`
      : `  startTimestampUnix=<first week start − 1>  endTimestampUnix=<now>   (the whole range at once)`,
  ];
  if (kind === "ondo-in") lines.push(`  toTokenId=<one Ondo id>     (one call per id: ${ONDO_IDS.length} ids, below)`);
  if (kind === "ondo-out") lines.push(`  fromTokenId=<one Ondo id>   (one call per id: ${ONDO_IDS.length} ids, below)`);
  if (kind === "all") lines.push(`  minUsdPrice=0   (swaps only, same as the token-filtered calls)`);
  lines.push(`  then: direction=next&lastDepositAddress=<last row>&lastDepositMemo=<last row> until a page has < ${PAGE_SIZE} rows`);
  return lines.join("\n");
}
