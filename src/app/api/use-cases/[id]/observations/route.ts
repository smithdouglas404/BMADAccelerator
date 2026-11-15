import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

const KINDS = ["observation", "metric", "interview", "felt-wrong", "voice"] as const;
const LABEL: Record<(typeof KINDS)[number], string> = {
  observation: "Pilot observation",
  metric: "Pilot metric",
  interview: "Interview note",
  "felt-wrong": "This felt wrong because…",
  voice: "Voice feedback",
};

// The validation and pilot loop: what real use showed. It becomes evidence and goes back into the PRD
// and TRD through the Muse, instead of sitting as disconnected feedback.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = z.object({ kind: z.enum(KINDS).default("observation"), text: z.string().trim().min(2).max(8000) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Write what you saw." }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { kind, text } = parsed.data;
  const ev = await prisma.evidence.create({
    data: { useCaseId: id, source: LABEL[kind], type: kind === "interview" ? "interview" : "pilot", insight: text, confidence: kind === "metric" ? "high" : "medium", trace: "Pilot feedback → specification" },
  });
  if (agentsEnabled())
    await enqueue(
      id,
      "pilot",
      `Pilot feedback (${LABEL[kind]}, evidence ${ev.id}): "${text}". Feed it back into the specification: update the PRD and TRD sections it bears on (set_spec_section with an evidence trace step naming it), adjust validation and readiness honestly, add a backlog item if something must change, and tell the owner in one line what it changed.`,
    );
  return NextResponse.json(ev, { status: 201 });
}
