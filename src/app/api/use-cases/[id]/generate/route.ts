import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runGenerate } from "@/lib/generate";
import { agentsEnabled } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

// Build: the Studio assembles a fresh package and Claude Code builds the pilot from it (or redesigns its look
// with { redesign: true }, or sets the app aside and builds from scratch with { fresh: true }).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!agentsEnabled()) return NextResponse.json({ error: "Sign Claude in on Settings to let Claude Code build." }, { status: 503 });
  if (uc.generateBusy) return NextResponse.json({ status: "already running" }, { status: 202 });
  await prisma.useCase.update({ where: { id }, data: { generateBusy: true, generateStatus: "Assembling the package" } });
  const body = (await req.json().catch(() => ({}))) as { redesign?: unknown; fresh?: unknown };
  void runGenerate(id, { redesign: body.redesign === true, fresh: body.fresh === true });
  return NextResponse.json({ status: "started" }, { status: 202 });
}
