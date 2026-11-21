import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { moveCard, BOARD, BOARD_LABEL } from "@/lib/studio/board";
import { recordChange } from "@/lib/studio/truthlog";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";
import { itemAsk, type Stage } from "@/lib/studio/itemAsk";

type Ctx = { params: Promise<{ id: string; mid: string }> };

// One card on the Board: its full details, what happened to it, and the files attached to it.
export async function GET(_req: Request, { params }: Ctx) {
  const { id, mid } = await params;
  const move = await prisma.move.findFirst({ where: { id: mid, useCaseId: id } });
  if (!move) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [history, files] = await Promise.all([
    prisma.truthChange.findMany({ where: { useCaseId: id, node: `move:${mid}` }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.document.findMany({ where: { useCaseId: id, moveId: mid }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, summary: true, createdAt: true } }),
  ]);
  return NextResponse.json({ move, history, files });
}

const FIELDS = ["title", "capability", "decision", "prompt", "owner", "hidden", "signal"] as const;
const FIELD_LABEL: Record<(typeof FIELDS)[number], string> = { title: "title", capability: "area", decision: "decision", prompt: "details", owner: "owner", hidden: "kind", signal: "tag" };
const Body = z.object({
  status: z.enum(BOARD).optional(),
  by: z.string().max(80).default(""),
  why: z.string().max(400).default(""),
  title: z.string().trim().min(1).max(200).optional(),
  capability: z.string().max(120).optional(),
  decision: z.string().max(600).optional(),
  prompt: z.string().max(8000).optional(),
  owner: z.string().max(80).optional(),
  hidden: z.string().max(40).optional(),
  signal: z.string().max(40).optional(),
});

// A person moves or edits a card by hand (never required: Socra and the builds move them). Every change
// is logged with who made it, and Socra hears it, so a card moved back or reworded reopens the conversation.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, mid } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const b = parsed.data;
  const before = await prisma.move.findFirst({ where: { id: mid, useCaseId: id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const by = b.by || "A person";
  const notes: string[] = [];

  const edits: Partial<Record<(typeof FIELDS)[number], string>> = {};
  for (const f of FIELDS) if (b[f] !== undefined && b[f] !== before[f]) edits[f] = b[f];
  if (Object.keys(edits).length) {
    await prisma.move.update({ where: { id: mid }, data: edits });
    const what = Object.keys(edits).map((f) => FIELD_LABEL[f as (typeof FIELDS)[number]]);
    await recordChange(id, {
      node: `move:${mid}`,
      kind: "changed",
      summary: `${by} edited the ${what.join(", ")} of “${edits.title ?? before.title}”`,
      before: Object.keys(edits).map((f) => `${FIELD_LABEL[f as (typeof FIELDS)[number]]}: ${before[f as (typeof FIELDS)[number]]}`).join("\n"),
      after: Object.entries(edits).map(([f, v]) => `${FIELD_LABEL[f as (typeof FIELDS)[number]]}: ${v}`).join("\n"),
      by,
    });
    notes.push(`${by} edited the card “${edits.title ?? before.title}” on the Board (${Object.entries(edits).map(([f, v]) => `${FIELD_LABEL[f as (typeof FIELDS)[number]]} now: “${String(v).slice(0, 400)}”`).join("; ")}). Carry what changed into the spec and acceptance criteria, and check the Story map links still hold. Say in one line what it changed, with say about ["move:${mid}"]; if the new wording leaves something a builder needs unclear, ask about it the same way (numbered options, your suggestion marked).`);
  }

  if (b.status && b.status !== before.status) {
    const why = b.why || "moved by hand on the Board";
    await moveCard(id, mid, b.status, by, why);
    const back = BOARD.indexOf(b.status) < BOARD.indexOf(before.status as (typeof BOARD)[number]);
    const title = edits.title ?? before.title;
    const prompt = edits.prompt ?? before.prompt;
    // Every move by hand is an action: the specialist for the new column looks at the card, and Socra asks
    // what is missing for that stage, tied to the card (no fixed questions on screen: Socra's own words).
    const stage: Stage = back ? "back" : (b.status as Stage);
    const need: Record<string, string> = {
      back: "It went back: ask what isn't right yet, with your suggestion, and carry the answer into the spec.",
      queued: "It went back to Backlog: ask what isn't right yet, with your suggestion.",
      ready: "It is now Ready to shape: get it to enough detail to build (who uses it and when, what done looks like, the rules and edge cases) and write the answers into the card's acceptance criteria.",
      building: "It is now Being made real: check its acceptance criteria are enough to build from. If they are, tell them in one line to press Generate the prototype; if not, ask for what is missing before anyone builds.",
      review: "It is now in Human review: ask them to try it in Try & mark up, and ask the one or two things to check that its acceptance criteria name.",
      done: "It is Done: check it does what the card promised (name any acceptance criterion not shown working yet, as a question), and name what it unlocks next.",
    };
    const origin = await prisma.truthChange.findFirst({ where: { useCaseId: id, node: `move:${mid}`, kind: "added" }, select: { causes: true } });
    const fromItem = origin?.causes.filter((c) => c.startsWith("backlog:")) ?? [];
    notes.push(`${by} moved the card “${title}” (move:${mid}) from ${BOARD_LABEL[before.status as keyof typeof BOARD_LABEL] ?? before.status} to ${BOARD_LABEL[b.status]} (${why}). ${need[stage] ?? need.back}\n${itemAsk({ node: `move:${mid}`, extraNodes: fromItem, title, text: prompt, stage, by })}`);
  }

  if (notes.length) await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  if (notes.length && agentsEnabled()) await enqueue(id, "user", notes.join("\n"), `move:${mid}`);
  return NextResponse.json(await prisma.move.findUnique({ where: { id: mid } }));
}
