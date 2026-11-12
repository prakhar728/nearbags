// Public, read-only MCP server (Streamable HTTP, stateless, JSON responses). Add it to an agent with
//   claude mcp add --transport http nearbags https://nearbags.com/api/mcp
// No cookies or sessions are read, so CORS can be open; tools only return what the website shows anyone.
import { z } from "zod";
import { INSTRUCTIONS, TOOLS } from "@/lib/mcp/tools";
import { rateLimit } from "@/lib/ratelimit";

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
};

type Id = string | number | null;
interface Msg {
  jsonrpc?: string;
  id?: Id;
  method?: unknown;
  params?: Record<string, unknown>;
}

const ok = (id: Id, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (data: unknown, isError = false) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }], ...(isError ? { isError } : {}) });

const LISTED = TOOLS.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: z.toJSONSchema(t.input, { io: "input" }),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

async function handleOne(m: Msg): Promise<object | null> {
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m?.id ?? null, -32600, "Invalid request.");
  if (m.id === undefined) return null; // a notification (e.g. notifications/initialized): nothing to answer
  const id = m.id;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "nearbags", title: "nearbags", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: LISTED });
    case "tools/call": {
      const name = m.params?.name;
      const t = TOOLS.find((x) => x.name === name);
      if (!t) return fail(id, -32602, `Unknown tool: ${String(name)}`);
      const args = t.input.safeParse(m.params?.arguments ?? {});
      if (!args.success) return ok(id, text(`Invalid arguments: ${args.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true));
      try {
        return ok(id, text(await t.run(args.data)));
      } catch (e) {
        // Only messages we wrote reach the agent; anything else (database, network) stays generic.
        const msg = e instanceof Error && /^No (bag|creator)/.test(e.message) ? e.message : "Something went wrong reading nearbags. Try again shortly.";
        if (!(e instanceof Error && /^No (bag|creator)/.test(e.message))) console.error("[mcp]", t.name, e);
        return ok(id, text(msg, true));
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error."), { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Msg[];
  if (msgs.length === 0 || msgs.length > 20) return Response.json(fail(null, -32600, "Send 1 to 20 messages."), { status: 400, headers: CORS });
  try {
    await rateLimit("mcp", 60, 60_000);
  } catch {
    return Response.json(fail(null, -32000, "Too many requests. Wait a minute and try again."), { status: 429, headers: { ...CORS, "Retry-After": "60" } });
  }
  const out = (await Promise.all(msgs.map(handleOne))).filter((x): x is object => x !== null);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? out : out[0], { headers: CORS });
}

// No server-to-client stream: tell clients that try to open one.
export function GET() {
  return new Response("nearbags MCP: POST JSON-RPC to this URL. Read-only tools: list_bags, get_bag, get_agent_runs, get_creator, list_assets.", {
    status: 405,
    headers: { ...CORS, Allow: "POST, OPTIONS", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
