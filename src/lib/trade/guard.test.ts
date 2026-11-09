import { describe, expect, it } from "vitest";
import { guard, usSession } from "./guard";

// 2026-11-09 is a Monday. EST (UTC-5) since Nov 1.
const et = (iso: string) => new Date(iso);

describe("usSession", () => {
  it("maps New York times to sessions", () => {
    expect(usSession(et("2026-11-09T08:00:00Z"))).toBe("overnight"); // 03:00 ET Mon
    expect(usSession(et("2026-11-09T09:30:00Z"))).toBe("pre"); // 04:30 ET
    expect(usSession(et("2026-11-09T15:00:00Z"))).toBe("regular"); // 10:00 ET
    expect(usSession(et("2026-11-09T21:30:00Z"))).toBe("post"); // 16:30 ET
    expect(usSession(et("2026-11-10T02:00:00Z"))).toBe("overnight"); // 21:00 ET Mon
    expect(usSession(et("2026-11-14T03:00:00Z"))).toBe("weekend"); // 22:00 ET Fri
    expect(usSession(et("2026-11-14T15:00:00Z"))).toBe("weekend"); // Sat
    expect(usSession(et("2026-11-15T23:00:00Z"))).toBe("weekend"); // 18:00 ET Sun
    expect(usSession(et("2026-11-16T01:30:00Z"))).toBe("overnight"); // 20:30 ET Sun: Ondo week opens
  });
});

describe("guard", () => {
  it("passes a fair buy and warns/blocks expensive ones", () => {
    const base = { side: "buy" as const, referencePrice: 100, kind: "stock" as const, session: "regular" as const };
    expect(guard({ ...base, usd: 100, units: 0.995 }).verdict).toBe("ok"); // 0.5% over
    expect(guard({ ...base, usd: 100, units: 0.97 }).verdict).toBe("warn"); // ~3.1% over
    expect(guard({ ...base, usd: 100, units: 0.9 }).verdict).toBe("block"); // ~11% over
    expect(guard({ ...base, usd: 100, units: 1.2 }).verdict).toBe("ok"); // cheaper than reference is never bad
  });

  it("sells are bad when we receive less", () => {
    const g = guard({ side: "sell", usd: 90, units: 1, referencePrice: 100, kind: "crypto", session: "weekend" });
    expect(g.deviation).toBeCloseTo(0.1);
    expect(g.verdict).toBe("block");
  });

  it("widens stock thresholds off-hours but not crypto", () => {
    const stock = guard({ side: "buy", usd: 100, units: 1 / 1.04, referencePrice: 100, kind: "etf", session: "weekend" });
    expect(stock.verdict).toBe("warn");
    const crypto = guard({ side: "buy", usd: 100, units: 1 / 1.04, referencePrice: 100, kind: "crypto", session: "weekend" });
    expect(crypto.verdict).toBe("warn");
    const stockBig = guard({ side: "buy", usd: 100, units: 1 / 1.07, referencePrice: 100, kind: "stock", session: "overnight" });
    expect(stockBig.verdict).toBe("warn"); // 7% is block in-session, warn overnight
  });
});
