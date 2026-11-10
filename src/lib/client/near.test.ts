import { describe, expect, it } from "vitest";
import { base58 } from "@/lib/intents/keys";
import { signatureToB64 } from "./near";

const raw = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256);
const b64 = btoa(String.fromCharCode(...raw));

describe("signatureToB64", () => {
  it("keeps base64", () => expect(signatureToB64(b64)).toBe(b64));
  it("reads unpadded base64", () => expect(signatureToB64(b64.replace(/=+$/, ""))).toBe(b64));
  it("reads base58", () => expect(signatureToB64(base58.encode(raw))).toBe(b64));
  it("reads ed25519:base58", () => expect(signatureToB64(`ed25519:${base58.encode(raw)}`)).toBe(b64));
  it("rejects junk", () => expect(() => signatureToB64("abc")).toThrow());
});
