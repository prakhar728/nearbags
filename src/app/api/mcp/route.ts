// nearbags MCP server (Streamable HTTP, stateless, JSON responses). Add it to an agent with
//   claude mcp add --transport http nearbags https://nearbags.com/api/mcp
// Without a key: read-only tools that return what the website shows anyone. With an agent key
// ("Authorization: Bearer nbk_...", made on the creator's profile): also the creator tools for that account's own
// baskets. No cookies or sessions are read, so CORS can be open.
import { z } from "zod";
import { resolveKey, type AgentActor } from "@/lib/agent-keys";
import { HttpError } from "@/lib/auth/session";
import { CREATOR_TOOLS } from "@/lib/mcp/creator-tools";
import { INSTRUCTIONS, TOOLS } from "@/lib/mcp/tools";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 300; // run_agent waits for the agent's decision and swaps

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id",
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

const schemaOf = (input: z.ZodType) => z.toJSONSchema(input, { io: "input" });
const PUBLIC = TOOLS.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: schemaOf(t.input),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));
const CREATOR = CREATOR_TOOLS.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: schemaOf(t.input),
  annotations: t.readOnly
    ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    : { readOnlyHint: false, destructiveHint: t.name === "close_bag", idempotentHint: false, openWorldHint: t.name === "run_agent" },
}));

const KEY_NOTE =
  " With this agent key you can also manage the key owner's own bags: whoami, my_bags, preview_bag, create_bag, edit_bag, close_bag and run_agent. New bags go live only after the owner buys them on the site; nothing here can buy, sell or move money.";

/** Messages we wrote for people (HttpError, "No bag ...") go to the agent; anything else stays generic. */
function errorText(e: unknown) {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Error && /^No (bag|creator)/.test(e.message)) return e.message;
  return null;
}

async function handleOne(m: Msg, actor: AgentActor | null): Promise<object | null> {
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m?.id ?? null, -32600, "Invalid request.");
  if (m.id === undefined) return null; // a notification (e.g. notifications/initialized): nothing to answer
  const id = m.id;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "nearbags", title: "nearbags", version: "0.2.0" },
        instructions: INSTRUCTIONS + (actor ? KEY_NOTE : ""),
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: actor ? [...PUBLIC, ...CREATOR] : PUBLIC });
    case "tools/call": {
      const name = m.params?.name;
      const pub = TOOLS.find((x) => x.name === name);
      const own = CREATOR_TOOLS.find((x) => x.name === name);
      const t = pub ?? own;
      if (!t) return fail(id, -32602, `Unknown tool: ${String(name)}`);
      if (own && !actor) return ok(id, text(`${own.name} needs an agent key. Make one on your nearbags profile and send it as "Authorization: Bearer nbk_...".`, true));
      const args = t.input.safeParse(m.params?.arguments ?? {});
      if (!args.success) return ok(id, text(`Invalid arguments: ${args.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true));
      try {
        const out = own ? await own.run(args.data, actor!) : await pub!.run(args.data);
        return ok(id, text(out));
      } catch (e) {
        const msg = errorText(e);
        if (!msg) console.error("[mcp]", t.name, e);
        return ok(id, text(msg ?? "Something went wrong at nearbags. Try again shortly.", true));
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(request: Request) {
  // A key that's present but wrong is an error, not a quiet fall-back to read-only: the owner should notice.
  const auth = request.headers.get("authorization");
  let actor: AgentActor | null = null;
  if (auth) {
    const key = auth.replace(/^Bearer\s+/i, "").trim();
    actor = key ? await resolveKey(key).catch(() => null) : null;
    if (!actor)
      return Response.json(fail(null, -32001, "That agent key isn't valid or was revoked. Make a new one on your nearbags profile."), { status: 401, headers: CORS });
  }

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
    await rateLimit("mcp", 60, 60_000, actor ? `key:${actor.keyId}` : "");
  } catch {
    return Response.json(fail(null, -32000, "Too many requests. Wait a minute and try again."), { status: 429, headers: { ...CORS, "Retry-After": "60" } });
  }
  const out = (await Promise.all(msgs.map((m) => handleOne(m, actor)))).filter((x): x is object => x !== null);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? out : out[0], { headers: CORS });
}

// No server-to-client stream: tell clients that try to open one.
export function GET() {
  return new Response("nearbags MCP: POST JSON-RPC to this URL. Docs: https://nearbags.com/docs/agents", {
    status: 405,
    headers: { ...CORS, Allow: "POST, OPTIONS", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
