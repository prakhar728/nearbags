// Open an agent run's OutLayer attestation as OutLayer's readable report (with its Verify button). The report page is
// keyed by request id, so look it up from the transaction hash; if that fails, fall back to the raw attestation JSON.
const API = "https://api.outlayer.ai";

export async function GET(_req: Request, ctx: RouteContext<"/api/agent/proof/[tx]">) {
  const { tx } = await ctx.params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tx)) return Response.json({ error: "Not a transaction hash." }, { status: 400 });
  const raw = `${API}/attestations/by-tx/${tx}`;
  try {
    const r = await fetch(raw, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    const j = (await r.json()) as { request_id?: number };
    if (r.ok && Number.isInteger(j.request_id)) return Response.redirect(`https://app.outlayer.ai/attestations/by-request/${j.request_id}`, 302);
  } catch {}
  return Response.redirect(raw, 302);
}
