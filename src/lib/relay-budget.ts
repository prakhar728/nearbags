// What a user can make our relayer pay for (security audit 2026-11-18, #10). Each relayed key change costs the relayer
// a little NEAR; without caps, free wallets could drain it. Checked right before relaying, so refused requests don't
// count. Rhea swaps and fee transfers have their own per-order limits.
import "server-only";
import { cap } from "@/lib/ratelimit";

const DAY = 86_400_000;
export const RELAY_CAPS = { perUserPerDay: 30, allPerDay: 3000, deviceKeysPerAccount: 5 } as const;

export async function spendRelay(userId: number) {
  await cap(`relay-day:user:${userId}`, RELAY_CAPS.perUserPerDay, DAY, "You've hit today's limit for account setup. Try again tomorrow.");
  await cap("relay-day:all", RELAY_CAPS.allPerDay, DAY, "Account setup is paused for today. Try again tomorrow.");
}

/** A browser key added to one account: at most a few, ever (a year's window). */
export async function spendDeviceKey(positionId: number) {
  await cap(`device-keys:${positionId}`, RELAY_CAPS.deviceKeysPerAccount, 365 * DAY, `This bag already has ${RELAY_CAPS.deviceKeysPerAccount} browser keys. Use one of those browsers, or restore your keys from your wallet.`);
}
