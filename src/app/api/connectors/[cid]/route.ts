import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ConnectorBody, sealSecrets, testConnector } from "@/lib/studio/mcp";

type Ctx = { params: Promise<{ cid: string }> };

// Switch on or off, choose which products get it, or replace its secrets (never shown again).
export async function PATCH(req: Request, { params }: Ctx) {
  const { cid } = await params;
  const parsed = ConnectorBody.omit({ name: true }).partial().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const { secrets, ...rest } = parsed.data;
  const data = { ...rest, ...(secrets && Object.keys(secrets).length ? await sealSecrets(secrets) : {}) };
  const row = await prisma.mcpServer.update({ where: { id: cid }, data }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { cid } = await params;
  await prisma.mcpServer.delete({ where: { id: cid } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

// Test: connect and list the connector's tools.
export async function POST(_req: Request, { params }: Ctx) {
  const { cid } = await params;
  return NextResponse.json(await testConnector(cid).catch((e) => ({ ok: false, tools: [], error: String(e) })));
}
