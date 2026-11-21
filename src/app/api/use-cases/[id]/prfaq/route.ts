import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { prfaqMarkers, prfaqWalkIntro, skillSection } from "@/lib/studio/prfaqDraft";
import { walkAnswer, walkExchange, walkMove, walkOf, walkSteps, walkWriting } from "@/lib/studio/prfaqWalk";
import { PrfaqError, askAboutPrfaq, prfaqFresh, prfaqMeta, prfaqSkill, restorePrfaq, saveTalkDraft, talkDraft, writePrfaq } from "@/lib/studio/prfaqTalk";

type Ctx = { params: Promise<{ id: string }> };

// Generate PRFAQ from what was said (Doug, Nov 21). GET: the talk being recorded, the documents picked, where
// each PRFAQ line came from, and earlier versions. PUT: keep the talk and the picked documents as they change.
// POST: generate (new, from everything) | update (the PRFAQ as it is plus what's new) | reformat (same
// content, in the format) | restore | ask (Ask Socra).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const meta = prfaqMeta(uc.prfaqSources);
  const draft = await talkDraft(id);
  const msgIds = prfaqMarkers(uc.prfaq).filter((k) => k.startsWith("m:")).map((k) => k.slice(2));
  const answers = msgIds.length ? await prisma.message.findMany({ where: { useCaseId: id, id: { in: msgIds } }, select: { id: true, content: true, author: true, authorRole: true, createdAt: true } }) : [];
  const talks = await prisma.recording.count({ where: { useCaseId: id, purpose: "prfaq", status: "submitted" } });
  const skill = await prfaqSkill();
  return NextResponse.json({
    draft: { transcript: draft.transcript, raw: draft.raw, updatedAt: draft.updatedAt },
    talks,
    fresh: await prfaqFresh(id, meta),
    docs: meta.docs,
    sources: meta.sources,
    last: meta.last ?? null,
    versions: meta.versions.map((v) => ({ at: v.at, how: v.how, by: v.by })),
    // What a PRFAQ is, and the walkthrough's steps, questions and bars: all from the studio-prfaq skill.
    explainer: skillSection(skill, "What a PRFAQ is"),
    walkIntro: prfaqWalkIntro(skill),
    walk: walkOf(uc.prfaqSources),
    steps: (await walkSteps()).steps,
    exchange: await walkExchange(id),
    writing: walkWriting(id),
    answers: Object.fromEntries(answers.map((a) => [a.id, { text: a.content, who: a.author || a.authorRole || "A person", at: a.createdAt }])),
  });
}

const Put = z.object({ transcript: z.string().max(200000).optional(), raw: z.string().max(400000).optional(), docs: z.array(z.string().max(40)).max(50).optional() });

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Put.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.transcript !== undefined) await saveTalkDraft(id, parsed.data.transcript, parsed.data.raw ?? "");
  if (parsed.data.docs) {
    const own = await prisma.document.findMany({ where: { useCaseId: id, id: { in: parsed.data.docs } }, select: { id: true } });
    await prisma.useCase.update({ where: { id }, data: { prfaqSources: { ...prfaqMeta(uc.prfaqSources), docs: own.map((d) => d.id) } as object } });
  }
  return NextResponse.json({ ok: true });
}

const Post = z.object({
  action: z.enum(["generate", "update", "reformat", "restore", "ask", "walk-start", "walk-go", "walk-skip", "walk-stop", "walk-answer"]),
  step: z.string().max(40).optional(),
  text: z.string().max(20000).optional(),
  by: z.string().max(120).default("The owner"),
  transcript: z.string().max(200000).optional(),
  raw: z.string().max(400000).optional(),
  docs: z.array(z.string().max(40)).max(50).optional(),
  gap: z.string().max(600).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Post.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = parsed.data;
  try {
    if (p.action === "walk-answer") return NextResponse.json(await walkAnswer(id, { key: p.step ?? "", text: p.text ?? "", raw: p.raw, by: p.by }));
    if (p.action.startsWith("walk-")) return NextResponse.json(await walkMove(id, { action: p.action.slice(5) as "start" | "go" | "skip" | "stop", step: p.step, by: p.by }));
    if (p.action === "restore") return NextResponse.json(await restorePrfaq(id, p.by));
    if (p.action === "ask") return NextResponse.json(await askAboutPrfaq(id, { by: p.by, gap: p.gap }));
    return NextResponse.json(await writePrfaq(id, { mode: p.action as "generate" | "update" | "reformat", by: p.by, transcript: p.transcript, raw: p.raw, docs: p.docs }));
  } catch (e) {
    if (e instanceof PrfaqError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
