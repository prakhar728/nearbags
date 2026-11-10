import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: () => ({}), schema: {} }));
import { calendarCloses } from "./market";
import { sameButNonce } from "./config";

describe("calendarCloses", () => {
  const today = new Date("2026-11-11T12:00:00Z");
  it("fills weekends with the last close and ends with the live price", () => {
    const rows = [
      { date: "2026-11-06", close: 100 }, // Friday
      { date: "2026-11-09", close: 103 }, // Monday
      { date: "2026-11-10", close: 104 },
    ];
    expect(calendarCloses(rows, 105, 7, today)).toEqual([100, 100, 100, 103, 104, 105]);
  });
  it("starts at the first known close", () => expect(calendarCloses([], 50, 30, today)).toEqual([50]));
});

describe("sameButNonce", () => {
  it("ignores only the nonce", () => {
    expect(sameButNonce('{"a":1,"nonce":"x","intents":[1]}', '{"a":1,"nonce":"y","intents":[1]}')).toBe(true);
    expect(sameButNonce('{"a":1,"nonce":"x","intents":[1]}', '{"a":1,"nonce":"y","intents":[2]}')).toBe(false);
    expect(sameButNonce("nope", "{}")).toBe(false);
  });
});
