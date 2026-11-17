import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { moveCard, BOARD, BOARD_LABEL } from "@/lib/studio/board";
import { recordChange } from "@/lib/studio/truthlog";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";

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
    notes.push(`${by} edited the card “${edits.title ?? before.title}” on the Board (${Object.entries(edits).map(([f, v]) => `${FIELD_LABEL[f as (typeof FIELDS)[number]]} now: “${String(v).slice(0, 400)}”`).join("; ")}). Carry what changed into the spec and acceptance criteria, and check the Story map links still hold.`);
  }

  if (b.status && b.status !== before.status) {
    const why = b.why || "moved by hand on the Board";
    await moveCard(id, mid, b.status, by, why);
    const back = BOARD.indexOf(b.status) < BOARD.indexOf(before.status as (typeof BOARD)[number]);
    const title = edits.title ?? before.title;
    const thin = (edits.prompt ?? before.prompt).trim().length < 80;
    // Moving a card is an action, not just a move: each column asks Socra for the next thing it needs.
    const ask: Record<string, string> = {
      ready: `It is now Ready to shape: ask ${by} the two or three questions that would give it enough detail to build (who uses it, what "done" looks like, the rules and edge cases), with numbered options and your suggestion marked, and write what they answer into the card's acceptance criteria.`,
      building: thin
        ? `It is now Being made real but has almost no detail yet: before anyone presses Generate, ask ${by} for its acceptance criteria (numbered options, your suggestion marked).`
        : `It is now Being made real: check its acceptance criteria are enough to build from and tell ${by} in one line when to press Generate the prototype.`,
      review: `It is now in Human review: ask ${by} to try it in Try & mark up and say yes, or mark what is wrong.`,
      done: `It is Done: confirm in one line that it does what the card promised, and name what it unlocks next.`,
      queued: "",
    };
    notes.push(`${by} moved the card “${title}” from ${BOARD_LABEL[before.status as keyof typeof BOARD_LABEL] ?? before.status} to ${BOARD_LABEL[b.status]} (${why}). ${back ? "It went back: ask in one line what isn't right yet, with your suggestion, and carry the answer into the spec." : ask[b.status] || "Carry it into the product truth if it changes anything."}`);
  }

  if (notes.length) await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  if (notes.length && agentsEnabled()) await enqueue(id, "user", notes.join("\n"), `move:${mid}`);
  return NextResponse.json(await prisma.move.findUnique({ where: { id: mid } }));
}
