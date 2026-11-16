import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueToken, publicBase } from "@/lib/connect/tokens";
import { newConnectCode } from "@/lib/connect/oauth";
import { TOOLS, TOOL_NAMES } from "@/lib/connect/catalog";
import { encrypt } from "@/lib/settings";
import { sendTest } from "@/lib/notify";

// Settings > Connect: the connector's addresses, who has access, a connect code for OAuth, tokens for
// scripts and OpenAPI connectors (shown once), and the log of every call.
export async function GET(req: Request) {
  const base = publicBase(req);
  const [tokens, calls, targets] = await Promise.all([
    prisma.apiToken.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.connectorCall.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.notifyTarget.findMany({ orderBy: { createdAt: "asc" } }),
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
    // Where waiting questions are sent. The address itself never comes back to the page.
    notify: targets.map((t) => ({ id: t.id, kind: t.kind, hint: t.hint, customer: t.customer, enabled: t.enabled, lastError: t.lastError, lastSent: t.lastSent })),
    emailReady: !!process.env.SMTP_URL,
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
  z.object({ action: z.literal("notify_add"), kind: z.enum(["email", "slack", "webhook"]), address: z.string().trim().min(3).max(500), customer: z.string().trim().max(120).default("") }),
  z.object({ action: z.literal("notify_remove"), id: z.string().min(4) }),
  z.object({ action: z.literal("notify_toggle"), id: z.string().min(4), enabled: z.boolean() }),
  z.object({ action: z.literal("notify_test"), id: z.string().min(4) }),
]);

function hintFor(kind: string, address: string) {
  if (kind === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) ? address : null;
  try {
    const u = new URL(address);
    if (u.protocol !== "https:" && !/^(localhost|127\.)/.test(u.hostname)) return null;
    if (kind === "slack" && u.hostname !== "hooks.slack.com") return null;
    return `${u.hostname} …${address.slice(-4)}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Give the access a name." }, { status: 400 });
  const b = parsed.data;
  if (b.action === "code") return NextResponse.json(newConnectCode());
  if (b.action === "notify_add") {
    const hint = hintFor(b.kind, b.address);
    if (!hint) return NextResponse.json({ error: b.kind === "email" ? "That doesn't look like an email address." : b.kind === "slack" ? "Paste a Slack incoming webhook (https://hooks.slack.com/…)." : "Paste an https address." }, { status: 400 });
    const t = await prisma.notifyTarget.create({ data: { kind: b.kind, address: await encrypt(b.address), hint, customer: b.customer } });
    return NextResponse.json({ id: t.id }, { status: 201 });
  }
  if (b.action === "notify_remove") {
    await prisma.notifyTarget.deleteMany({ where: { id: b.id } });
    await prisma.notifySent.deleteMany({ where: { targetId: b.id } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "notify_toggle") {
    await prisma.notifyTarget.updateMany({ where: { id: b.id }, data: { enabled: b.enabled } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "notify_test") {
    try {
      await sendTest(b.id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  if (b.action === "revoke") {
    await prisma.apiToken.updateMany({ where: { id: b.id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  const t = await issueToken({ name: b.name, scope: b.scope, customer: b.customer, person: b.person, role: b.role });
  // The only time the token is shown. It is stored as a hash.
  return NextResponse.json({ token: t.token, id: t.id }, { status: 201 });
}
