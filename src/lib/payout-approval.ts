// Money leaving a bag for an address that isn't the signed-in wallet needs a fresh signature from that wallet
// (re-audit N2). A stolen session alone can then no longer point a sale or withdrawal at someone else's address.
// Pure: the browser builds the text, the server parses and checks it, then verifies the wallet's signature over it.

export interface PayoutApproval {
  message: string;
  signature: string; // EVM: 0x hex (personal_sign). NEAR: base64 (NEP-413).
  publicKey?: string; // NEAR: the key that signed (checked on chain as a full-access key of the wallet account)
}

const HEAD = "nearbags: approve a payout";
const MAX_AGE_MS = 10 * 60_000;

/** The text the wallet signs. Lines are fixed so the server can parse it back exactly. */
export function payoutApprovalText(p: { host: string; positionId: number; addresses: string[]; issuedAt?: Date }): string {
  const to = [...new Set(p.addresses.map((a) => a.trim()))].sort();
  return [
    HEAD,
    `Site: ${p.host}`,
    `Bag position: ${p.positionId}`,
    ...to.map((a) => `Send to: ${a}`),
    `Issued: ${(p.issuedAt ?? new Date()).toISOString()}`,
    "Only sign this if you are on nearbags and chose these addresses yourself.",
  ].join("\n");
}

/** Why `message` doesn't approve sending this position's money to `addresses`, or null when it does. */
export function payoutApprovalProblem(message: string, want: { host: string; positionId: number; addresses: string[]; now?: number }): string | null {
  const lines = message.split("\n");
  if (lines[0] !== HEAD) return "not a payout approval";
  const issued = lines.find((l) => l.startsWith("Issued: "))?.slice(8) ?? "";
  const at = Date.parse(issued);
  const now = want.now ?? Date.now();
  if (!Number.isFinite(at) || at > now + 60_000 || now - at > MAX_AGE_MS) return "the approval has expired; approve again";
  const expected = payoutApprovalText({ host: want.host, positionId: want.positionId, addresses: want.addresses, issuedAt: new Date(at) });
  if (message !== expected) return "the approval is for a different bag, site or address";
  return null;
}

/** Addresses that need approval: anything other than the signed-in wallet itself (EVM compared case-insensitively). */
export function needsApproval(addresses: string[], wallet: { chain: string; address: string }): string[] {
  const own = (a: string) => (wallet.chain === "evm" ? a.trim().toLowerCase() === wallet.address.toLowerCase() : a.trim() === wallet.address);
  return [...new Set(addresses.map((a) => a.trim()).filter((a) => a && !own(a)))];
}
