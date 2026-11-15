import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runGenerate } from "@/lib/generate";
import { agentsEnabled } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

// Generate: Claude Code builds (or rebuilds from the deltas) the app from BMAD's
// documents as they stand (or redesigns its look with { redesign: true }, or sets the app aside and builds from scratch with { fresh: true }), then the preview restarts on the use case's own URL.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!agentsEnabled()) return NextResponse.json({ error: "Add the Anthropic API key to turn on Generate." }, { status: 503 });
  if (uc.generateBusy) return NextResponse.json({ status: "already running" }, { status: 202 });
  await prisma.useCase.update({ where: { id }, data: { generateBusy: true, generateStatus: "Getting ready" } });
  const body = (await req.json().catch(() => ({}))) as { redesign?: unknown; fresh?: unknown };
  void runGenerate(id, { redesign: body.redesign === true, fresh: body.fresh === true });
  return NextResponse.json({ status: "started" }, { status: 202 });
}
