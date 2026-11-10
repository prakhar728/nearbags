// Open an agent run's OutLayer attestation as OutLayer's readable report (with its Verify button). The report page is
// keyed by job id (the attestation's task_id), so look it up from the transaction hash. Request ids repeat across
// mainnet and testnet, so the by-request page asks which one; the job page doesn't. Falls back to the raw JSON.
const API = "https://api.outlayer.ai";

export async function GET(_req: Request, ctx: RouteContext<"/api/agent/proof/[tx]">) {
  const { tx } = await ctx.params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tx)) return Response.json({ error: "Not a transaction hash." }, { status: 400 });
  const raw = `${API}/attestations/by-tx/${tx}`;
  try {
    const r = await fetch(raw, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    const j = (await r.json()) as { task_id?: number };
    if (r.ok && Number.isInteger(j.task_id)) return Response.redirect(`https://app.outlayer.ai/attestation/${j.task_id}`, 302);
  } catch {}
  return Response.redirect(raw, 302);
}
