import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { claudeConfigured } from "@/lib/agent/auth";
import { save, startInspiration, type Inspiration } from "@/lib/inspire";

type Ctx = { params: Promise<{ id: string }> };

// Starts (or restarts) the research behind the "Picture it" step. The page polls the use case for the result.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!claudeConfigured()) return NextResponse.json({ error: "Claude isn't set up yet." }, { status: 503 });
  void startInspiration(id);
  return NextResponse.json({ status: "working" }, { status: 202 });
}

const Picks = z.object({
  features: z.array(z.string().max(80)).max(40),
  direction: z.string().max(80),
  notes: z.string().max(4000),
  skipped: z.boolean().optional(),
});

// Saves what the client picked (or that they skipped the step).
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Picks.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const prev = (uc.inspiration as Inspiration | null) ?? { status: "ready" as const };
  await save(id, { ...prev, status: prev.status === "working" ? "ready" : prev.status, picks: parsed.data });
  return NextResponse.json({ ok: true });
}
