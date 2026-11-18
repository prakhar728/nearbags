// A treasury's public ledger, in USDC: what came in, what it bought, and whether that matches the cash it holds.
// Pure, so it is unit-tested; lib/treasury.ts loads the rows. Amounts are USDC smallest units (6 decimals).

export const PAYOUT_SEQ = 100; // same as trade/orders.ts (not imported: orders.ts pulls in server code)

export interface FeeIn {
  at: string;
  amount: string; // USDC units received
  from: string; // the bag whose buyer paid the fee
}
export interface OwnBuy {
  at: string;
  grossUsdc: string; // USDC that landed when the owner topped up the treasury themselves
}
export interface FeePaid {
  amount: string; // fees this account paid on the owner's own buys
}
export interface GiftIn {
  at: string;
  note: string; // "A gift" (the public page never names the sender), or "their own gift, taken back"
  units: [string, string][]; // intents asset id → smallest units that arrived (the relayed transfer, when stored)
}
export interface LegRow {
  at: string;
  orderKind: "buy" | "sell" | "reset" | "withdraw";
  seq: number;
  assetFrom: string;
  assetTo: string;
  amountIn: string;
  amountOutActual: string | null;
  recipient: string | null;
  status: string;
}

export interface LedgerEntry {
  at: string;
  kind: "fee" | "topup" | "gift" | "purchase" | "sale" | "out";
  usdc: number; // + into the treasury's cash, − out of it
  asset?: string; // what was bought or sold (intents asset id)
  units?: string; // how much of it (smallest units)
  note?: string;
  items?: [string, string][]; // a gift: everything that arrived besides USDC
}

const usd = (units: string | null | undefined) => Number(units ?? "0") / 1e6;

/** A leg's output stays in the treasury account unless it pays out or withdraws to an outside address. */
const leaves = (l: LegRow) => l.recipient != null || l.seq === PAYOUT_SEQ;

export function buildLedger(p: { usdc: string; fees: FeeIn[]; topups: OwnBuy[]; feesPaid: FeePaid[]; legs: LegRow[]; gifts?: GiftIn[] }) {
  const entries: LedgerEntry[] = [];
  for (const f of p.fees) entries.push({ at: f.at, kind: "fee", usdc: usd(f.amount), note: f.from });
  for (const t of p.topups) entries.push({ at: t.at, kind: "topup", usdc: usd(t.grossUsdc) });
  // A gift claimed into the treasury: its USDC counts as cash in, the rest is listed (it isn't cash).
  for (const g of p.gifts ?? []) {
    const cash = g.units.filter(([id]) => id === p.usdc).reduce((s, [, v]) => s + usd(v), 0);
    entries.push({ at: g.at, kind: "gift", usdc: cash, note: g.note, items: g.units.filter(([id]) => id !== p.usdc) });
  }
  const feesPaid = p.feesPaid.reduce((s, f) => s + usd(f.amount), 0);

  for (const l of p.legs) {
    if (l.status !== "success") continue;
    const fromUsdc = l.assetFrom === p.usdc;
    const toUsdc = l.assetTo === p.usdc;
    // Paid out or withdrawn first: a payout in USDC is USDC → USDC, but the money still leaves.
    if (fromUsdc && leaves(l)) entries.push({ at: l.at, kind: "out", usdc: -usd(l.amountIn), note: l.orderKind === "sell" ? "Sale paid out" : "Withdrawn" });
    else if (fromUsdc && toUsdc) continue; // a basket's USDC weight: no swap, no change
    else if (fromUsdc) entries.push({ at: l.at, kind: "purchase", usdc: -usd(l.amountIn), asset: l.assetTo, units: l.amountOutActual ?? undefined });
    else if (toUsdc && !leaves(l)) entries.push({ at: l.at, kind: "sale", usdc: usd(l.amountOutActual), asset: l.assetFrom, units: l.amountIn });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));

  const sum = (k: LedgerEntry["kind"]) => entries.filter((e) => e.kind === k).reduce((s, e) => s + e.usdc, 0);
  const received = sum("fee") + sum("topup") + sum("gift");
  const spent = 0 - sum("purchase") || 0;
  const sold = sum("sale");
  const out = (0 - sum("out") || 0) + feesPaid;
  const expectedCash = received - spent + sold - out;
  return { entries, totals: { received, fees: sum("fee"), topups: sum("topup"), gifts: entries.filter((e) => e.kind === "gift").length, spent, sold, out, expectedCash } };
}

/** The largest holding's share of the treasury, as a fraction (0 when empty). */
export function concentration(values: { assetId: string; valueUsd: number }[]): { assetId: string | null; share: number } {
  const total = values.reduce((s, v) => s + v.valueUsd, 0);
  if (total <= 0) return { assetId: null, share: 0 };
  const top = values.reduce((a, b) => (b.valueUsd > a.valueUsd ? b : a));
  return { assetId: top.assetId, share: top.valueUsd / total };
}
