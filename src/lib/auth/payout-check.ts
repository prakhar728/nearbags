// Server side of payout approvals (lib/payout-approval.ts): check the text, then verify the signed-in wallet signed it.
import "server-only";
import { eq } from "drizzle-orm";
import { JsonRpcProvider } from "near-api-js-v7";
import { verifyMessage as verifyNep413 } from "near-api-js-v7/nep413";
import { sha256 } from "@noble/hashes/sha2.js";
import { verifyMessage as verifyEvm, type Hex } from "viem";
import { db, schema } from "@/db";
import { rpcUrl } from "@/lib/intents/rpc";
import { needsApproval, payoutApprovalProblem, type PayoutApproval } from "@/lib/payout-approval";
import { b64ToBytes } from "./messages";
import { requestHost, signInHost } from "./hosts";
import { HttpError, type Session } from "./session";

/** Refuse unless every address other than the user's own wallet was approved by that wallet just now. */
export async function assertPayoutApproved(request: Request, s: Session, positionId: number, addresses: string[], approval: PayoutApproval | undefined) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
  if (!u) throw new HttpError(401, "Sign in again.");
  const others = needsApproval(addresses, { chain: u.walletChain, address: u.walletAddress });
  if (!others.length) return;
  if (!approval) throw new HttpError(428, "Approve this address with your wallet first.");
  const host = signInHost(requestHost(request));
  if (!host) throw new HttpError(400, "Unknown site.");
  const why = payoutApprovalProblem(approval.message, { host, positionId, addresses: others });
  if (why) throw new HttpError(403, `Payout not approved: ${why}.`);
  let ok = false;
  try {
    if (u.walletChain === "evm") {
      ok = await verifyEvm({ address: u.walletAddress as Hex, message: approval.message, signature: approval.signature as Hex });
    } else {
      if (!approval.publicKey) throw new Error("missing key");
      await verifyNep413({
        signerAccountId: u.walletAddress,
        signerPublicKey: approval.publicKey,
        payload: { message: approval.message, recipient: host, nonce: sha256(new TextEncoder().encode(approval.message)) },
        signature: b64ToBytes(approval.signature),
        provider: new JsonRpcProvider({ url: rpcUrl() }),
      });
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(403, "That approval isn't signed by the wallet you signed in with.");
}
