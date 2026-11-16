import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueToken, publicBase } from "@/lib/connect/tokens";
import { newConnectCode } from "@/lib/connect/oauth";
import { TOOLS, TOOL_NAMES } from "@/lib/connect/catalog";

// Settings > Connect: the connector's addresses, who has access, a connect code for OAuth, tokens for
// scripts and OpenAPI connectors (shown once), and the log of every call.
export async function GET(req: Request) {
  const base = publicBase(req);
  const [tokens, calls] = await Promise.all([
    prisma.apiToken.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.connectorCall.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  return NextResponse.json({
    mcpUrl: `${base}/api/mcp`,
    openApiUrl: `${base}/api/v1/openapi.json`,
    isPublic: !/^http:\/\/(localhost|127\.)/.test(base),
    tools: TOOL_NAMES.map((n) => ({ name: n, title: TOOLS[n].title, write: TOOLS[n].write })),
    tokens: tokens
      .filter((t) => !t.expiresAt || t.expiresAt > new Date())
      .map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, scope: t.scope, customer: t.customer, person: t.person, role: t.role, viaOAuth: !!t.clientId, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt })),
    calls,
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("code") }),
  z.object({
    action: z.literal("token"),
    name: z.string().trim().min(1).max(80),
    scope: z.enum(["read", "write"]),
    customer: z.string().trim().max(120).default(""),
    person: z.string().trim().max(80).default(""),
    role: z.string().trim().max(60).default("Product owner"),
  }),
  z.object({ action: z.literal("revoke"), id: z.string().min(4) }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Give the access a name." }, { status: 400 });
  const b = parsed.data;
  if (b.action === "code") return NextResponse.json(newConnectCode());
  if (b.action === "revoke") {
    await prisma.apiToken.updateMany({ where: { id: b.id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  const t = await issueToken({ name: b.name, scope: b.scope, customer: b.customer, person: b.person, role: b.role });
  // The only time the token is shown. It is stored as a hash.
  return NextResponse.json({ token: t.token, id: t.id }, { status: 201 });
}
