// Daily price + dividend top-up (spec §7.1). Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
import { ingestAll } from "@/lib/prices/store";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); // a stray newline in the env value made Vercel Cron get 401
  // Reading the request header also keeps this handler at request time (never prerendered).
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await ingestAll();
  return Response.json({
    ok: true,
    assets: results.length,
    flaggedDays: results.reduce((s, r) => s + r.flaggedDays, 0),
    errors: results.flatMap((r) =>
      Object.entries(r.sources)
        .filter(([s, v]) => typeof v === "string" && s !== "dividends" && !v.includes("TWELVEDATA_API_KEY"))
        .map(([s, v]) => `${r.ticker}/${s}: ${v}`),
    ),
  });
}
