import { NextResponse } from "next/server";
import { TOOL_NAMES, type ToolName } from "@/lib/connect/catalog";
import { callTool } from "@/lib/connect/serve";
import { accessFrom } from "@/lib/connect/tokens";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ tool: string }> };

// The REST API: the same tools as the MCP connector, one POST each (described by /api/v1/openapi.json).
// For assistants that take an OpenAPI custom connector (Meta Muse, custom GPT actions) and for scripts.
export async function POST(req: Request, { params }: Ctx) {
  const { tool } = await params;
  if (!TOOL_NAMES.includes(tool as ToolName)) return NextResponse.json({ error: "No such tool. See /api/v1/openapi.json." }, { status: 404 });
  const access = await accessFrom(req);
  if (!access) return NextResponse.json({ error: "Send Authorization: Bearer <token> (Settings > Connect, or OAuth)." }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  const input = await req.json().catch(() => ({}));
  const client = (req.headers.get("x-client-name") ?? access.name).slice(0, 60);
  const r = await callTool(tool as ToolName, input, access, client, "rest");
  if (r.ok) return NextResponse.json({ ok: true, data: r.data });
  if ("needsConfirmation" in r) return NextResponse.json({ ok: false, needs_confirmation: true, preview: r.preview, how: r.how }, { status: 202 });
  return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
