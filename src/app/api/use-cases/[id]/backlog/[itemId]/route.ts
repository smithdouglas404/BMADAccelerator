import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { pullForward } from "@/lib/studio/actions";
import { recordChange } from "@/lib/studio/truthlog";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const Body = z.object({
  kind: z.enum(["capture", "epic", "distraction"]).optional(),
  group: z.string().max(120).optional(),
  pull: z.boolean().optional(),
  includeInBuild: z.boolean().optional(),
  // A person changes an earlier requirement in their own words, or withdraws it (kept in history).
  title: z.string().trim().min(2).max(300).optional(),
  note: z.string().max(4000).optional(),
  withdraw: z.boolean().optional(),
  // The Board's red "needs you" marker: work on it with Socra, accept it onto the Board, or reject it.
  triage: z.enum(["working", "accepted", "rejected"]).optional(),
  by: z.string().max(80).default(""),
});

// The owner curates a thought (group it into a capability, park it), pulls a recommendation forward,
// or ticks it for the next build. Nothing here turns a suggestion into a requirement silently.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, itemId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const item = await prisma.backlogItem.findFirst({ where: { id: itemId, useCaseId: id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.pull) return NextResponse.json(await pullForward(id, itemId));
  if (parsed.data.triage) return NextResponse.json(await triage(id, item, parsed.data.triage, parsed.data.by || "A person"));
  const { title, note, withdraw, by } = parsed.data;
  if (title !== undefined || note !== undefined || withdraw) {
    const who = by || "A person";
    const after = await prisma.backlogItem.update({
      where: { id: itemId },
      data: withdraw
        ? { kind: "distraction", group: "Withdrawn", includeInBuild: false, state: "held" }
        : { ...(title !== undefined ? { title } : {}), ...(note !== undefined ? { note } : {}) },
    });
    await recordChange(id, {
      node: `backlog:${itemId}`,
      kind: withdraw ? "withdrawn" : "changed",
      summary: withdraw ? `${who} withdrew “${item.title}” (kept in history)` : `${who} changed “${item.title}”`,
      before: `${item.title}${item.note ? `\n${item.note}` : ""}`,
      after: withdraw ? "Withdrawn" : `${after.title}${after.note ? `\n${after.note}` : ""}`,
      by: who,
    });
    if (agentsEnabled())
      await enqueue(
        id,
        "user",
        withdraw
          ? `${who} withdrew the backlog item “${item.title}” (id ${itemId}). Take it out of the product truth wherever it shaped something (spec sections with it in related, floor items, cards), say in one line what that changes, and move any card it drove back with move_card.`
          : `${who} changed the backlog item “${item.title}” (id ${itemId}) to: “${after.title}”${after.note ? ` — ${after.note}` : ""}. Carry the change into the spec sections and cards it touches, and say in one line what it changes.`,
        `backlog:${itemId}`,
      );
    return NextResponse.json(after);
  }
  const { kind, group, includeInBuild } = parsed.data;
  const data: Record<string, unknown> = {};
  if (kind) {
    data.kind = kind;
    data.group = kind === "distraction" ? "Parked by Socra" : (group ?? item.group);
    if (kind === "distraction") data.state = "held";
  }
  if (includeInBuild !== undefined) {
    data.includeInBuild = includeInBuild;
    if (includeInBuild && item.state !== "built") data.state = "ready";
  }
  return NextResponse.json(await prisma.backlogItem.update({ where: { id: itemId }, data }));
}

type Item = NonNullable<Awaited<ReturnType<typeof prisma.backlogItem.findFirst>>>;

// A person deals with a new backlog item from the Board. Accepting puts it on the Board as a card in the
// Backlog column (it stays there until it moves on); rejecting sets it aside (kept in history); working on
// it asks Socra to open the conversation about it. Each one is logged and Socra hears it.
async function triage(useCaseId: string, item: Item, to: "working" | "accepted" | "rejected", by: string) {
  const suggestion = item.state === "suggested" || item.state === "probing";
  const group = item.group && !/^(Unsorted signal|Withdrawn|Parked by Socra)$/i.test(item.group) ? item.group : "";
  let moveId = "";
  if (to === "accepted") {
    const last = await prisma.move.findFirst({ where: { useCaseId }, orderBy: { position: "desc" }, select: { position: true } });
    const move = await prisma.move.create({
      data: {
        useCaseId, title: item.title.slice(0, 200), capability: group, prompt: item.note, status: "queued", owner: "Product owner",
        signal: suggestion ? "SOCRA SUGGESTED" : "ACCEPTED", hidden: "story", position: (last?.position ?? 0) + 1, movedBy: by, moveReason: "accepted from the backlog",
      },
    });
    moveId = move.id;
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "accepted", ...(suggestion ? { state: "held", kind: "epic" } : {}) } });
    await recordChange(useCaseId, { node: `move:${move.id}`, kind: "added", summary: `${by} accepted “${item.title}” onto the Board`, after: item.note, by, causes: [`backlog:${item.id}`] });
  } else if (to === "rejected") {
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "rejected", kind: "distraction", group: "Withdrawn", includeInBuild: false, state: "held" } });
    await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "withdrawn", summary: `${by} rejected “${item.title}” (kept in history)`, before: item.title, after: "Rejected", by });
  } else {
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "working" } });
  }
  await prisma.useCase.update({ where: { id: useCaseId }, data: { updatedAt: new Date() } });
  if (agentsEnabled()) {
    const prompt =
      to === "accepted"
        ? `${by} accepted the backlog item “${item.title}” (id ${item.id}) onto the Board as a card (move:${moveId}). Shape it: tie it to a capability and a decision, write its acceptance criteria on the card, and ask ${by} the one question that would make it ready to build, with numbered options.`
        : to === "rejected"
          ? `${by} rejected the backlog item “${item.title}” (id ${item.id}). ${suggestion ? "Don't propose it again unless they ask." : "Take it out of the product truth wherever it shaped something, and say in one line what that changes."}`
          : `${by} wants to work on “${item.title}” (id ${item.id}) now${item.note ? ` (${item.note.slice(0, 600)})` : ""}. Open it up: say in one line what you understand it to mean, then ask the two or three questions that would make it a clear requirement, with numbered options and your suggestion marked.`;
    await enqueue(useCaseId, "user", prompt, `backlog:${item.id}`);
  }
  return { ok: true, triage: to, moveId };
}
