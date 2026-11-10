// Sign-in messages, shared by client and server so both build the exact same text.
// Renamed with the app (Stonkbag → nearbags): a sign-in signature is checked once against a 5-minute nonce and then
// thrown away (the session is a cookie), so nothing persisted depends on this text. The basket-key unlock message is
// different and must never change: see UNLOCK_MESSAGE_V1 in src/lib/intents/keys.ts.
export const NEP413_RECIPIENT = "nearbags";

export function signInMessage(nonceB64: string, origin: string) {
  return [
    "Sign in to nearbags",
    "",
    `Site: ${origin}`,
    `Nonce: ${nonceB64}`,
    "",
    "This signature only proves you own this wallet. It cannot move funds.",
  ].join("\n");
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
