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

const EVM_CHAINS = new Set(["eth", "arb", "base", "op", "pol", "bsc"]);
/** Is a 1Click chain id one where the signed-in wallet's own address is really the user's? */
export const walletChainFits = (walletChain: string, chain: string | undefined) =>
  chain === undefined || (walletChain === "near" ? chain === "near" : EVM_CHAINS.has(chain));

/**
 * Addresses that need approval: anything other than the signed-in wallet itself (EVM compared case-insensitively),
 * and the wallet's own address too when it's on a chain outside the wallet's family (a 0x address on Aptos or Sui
 * isn't the user's EVM wallet). `chains[i]`, when given, is the 1Click chain the i-th address receives on.
 */
export function needsApproval(addresses: string[], wallet: { chain: string; address: string }, chains: (string | undefined)[] = []): string[] {
  const own = (a: string, i: number) =>
    walletChainFits(wallet.chain, chains[i]) && (wallet.chain === "evm" ? a.trim().toLowerCase() === wallet.address.toLowerCase() : a.trim() === wallet.address);
  return [...new Set(addresses.map((a, i) => (a.trim() && !own(a, i) ? a.trim() : "")).filter(Boolean))];
}
