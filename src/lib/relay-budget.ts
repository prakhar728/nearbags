// What a user can make our relayer pay for (security audit 2026-11-18, #10). Each relayed key change costs the relayer
// a little NEAR; without caps, free wallets could drain it. Checked right before relaying, so refused requests don't
// count. Rhea swaps and fee transfers have their own per-order limits.
import "server-only";
import { cap, clientIp, hit } from "@/lib/ratelimit";

const DAY = 86_400_000;
export const RELAY_CAPS = { perUserPerDay: 30, perIpPerDay: 60, deviceKeysPerAccount: 20, alertAllPerDay: 3000 } as const;

// Per user and per IP, not a global hard stop: a global cap would let a few hundred free wallets switch account setup
// off for everyone (re-audit N5). The global count only raises an alert in the logs.
export async function spendRelay(userId: number) {
  await cap(`relay-day:user:${userId}`, RELAY_CAPS.perUserPerDay, DAY, "You've hit today's limit for account setup. Try again tomorrow.");
  await cap(`relay-day:ip:${await clientIp()}`, RELAY_CAPS.perIpPerDay, DAY, "Too many accounts set up from this network today. Try again tomorrow.");
  const all = await hit("relay-day:all", DAY);
  if (all === RELAY_CAPS.alertAllPerDay || (all > RELAY_CAPS.alertAllPerDay && all % 500 === 0)) console.error(`relayer alert: ${all} relays in the last day`);
}

/** A browser key added to one account: at most a few, ever (a year's window). */
export async function spendDeviceKey(positionId: number) {
  await cap(`device-keys:${positionId}`, RELAY_CAPS.deviceKeysPerAccount, 365 * DAY, `This bag already has ${RELAY_CAPS.deviceKeysPerAccount} browser keys. Use one of those browsers, or restore your keys from your wallet.`);
}
