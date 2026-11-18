// Who counts as an admin by wallet (ADMIN_WALLETS). Pure, so it can be unit-tested and used outside server-only code.
// Entries are comma-separated and may name the chain: "near:alice.near", "evm:0xAbC…". A plain "0x…" entry matches only
// EVM users, any other plain entry only NEAR users (security audit 2026-11-18: the old check ignored the chain, and
// "0x…" is also a valid NEAR account id). EVM addresses compare case-insensitively.

export type WalletChain = "near" | "evm";

export function adminWalletEntries(raw = process.env.ADMIN_WALLETS ?? ""): { chain: WalletChain; address: string }[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = /^(near|evm):(.+)$/i.exec(x);
      if (m) return { chain: m[1].toLowerCase() as WalletChain, address: m[2].trim() };
      return { chain: /^0x/i.test(x) ? "evm" : "near", address: x };
    });
}

export function isAdminWallet(chain: string, address: string, raw?: string): boolean {
  const a = address.trim().toLowerCase();
  // NEAR account ids are lowercase by protocol, so lowercasing both sides is safe there too.
  return adminWalletEntries(raw).some((e) => e.chain === chain && e.address.toLowerCase() === a);
}

/** A user row (or anything shaped like it) is an admin by flag or by wallet. */
export function isAdminUser(u: { isAdmin: boolean; walletChain: string; walletAddress: string }, raw?: string): boolean {
  return u.isAdmin || isAdminWallet(u.walletChain, u.walletAddress, raw);
}
