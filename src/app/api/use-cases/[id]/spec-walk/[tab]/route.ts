import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { specExplainer, specWalkIntro } from "@/lib/studio/specDefs";
import { SpecWalkError, walkAnswer, walkExchange, walkMove, walkOf, walkSteps, walkWriting } from "@/lib/studio/specWalk";

type Ctx = { params: Promise<{ id: string; tab: string }> };
const Tab = z.enum(["prd", "trd"]);

// The PRD and TRD walkthroughs (Doug, Nov 21). GET: what the document is (from its skill), the walkthrough's
// steps, where it stands and each question's exchange. POST: start | go | skip | stop | answer.
export async function GET(_req: Request, { params }: Ctx) {
  const { id, tab: t } = await params;
  const tab = Tab.safeParse(t);
  if (!tab.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { specWalk: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    explainer: specExplainer(tab.data),
    walkIntro: specWalkIntro(tab.data),
    walk: walkOf(uc.specWalk, tab.data),
    steps: walkSteps(tab.data),
    exchange: await walkExchange(id, tab.data),
    writing: walkWriting(id),
  });
}

const Post = z.object({
  action: z.enum(["start", "go", "skip", "stop", "answer"]),
  step: z.string().max(60).optional(),
  text: z.string().max(20000).optional(),
  raw: z.string().max(40000).optional(),
  by: z.string().max(120).default("The owner"),
});

export async function POST(req: Request, { params }: Ctx) {
  const { id, tab: t } = await params;
  const tab = Tab.safeParse(t);
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!tab.success || !parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = parsed.data;
  try {
    if (p.action === "answer") return NextResponse.json(await walkAnswer(id, tab.data, { key: p.step ?? "", text: p.text ?? "", raw: p.raw, by: p.by }));
    return NextResponse.json(await walkMove(id, tab.data, { action: p.action, step: p.step, by: p.by }));
  } catch (e) {
    if (e instanceof SpecWalkError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
