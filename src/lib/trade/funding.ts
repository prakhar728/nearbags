// Deciding when a buy's deposit has really arrived. Pure, so it can be tested without a database.

/**
 * How much USDC a buy's deposit put in the account, or 0 to wait. 1Click can report SUCCESS a few blocks before the
 * RPC shows the balance, so a balance below what 1Click reports means "not visible yet", not "less arrived". After
 * 30 minutes we trust the balance, in case 1Click's figure is off.
 */
export function fundedAmount(reported: bigint, balance: bigint, createdAt: Date, now = Date.now()): bigint {
  if (balance <= 0n) return 0n;
  if (reported <= 0n || balance >= reported) return reported > 0n ? reported : balance;
  return now - createdAt.getTime() > 30 * 60_000 ? balance : 0n;
}
