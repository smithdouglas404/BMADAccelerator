import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { pullForward } from "@/lib/studio/actions";
import { recordChange } from "@/lib/studio/truthlog";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";
import { itemAsk } from "@/lib/studio/itemAsk";

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
  triage: z.enum(["working", "accepted", "rejected", "deferred"]).optional(),
  // Doug (Nov 19): picking an item and saying yes to "work on it now" puts its card straight into Ready to shape.
  ready: z.boolean().optional(),
  // Doug (Nov 21): defer to a day. The item keeps its place and needs a person again once that day comes.
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  if (parsed.data.triage) return NextResponse.json(await triage(id, item, parsed.data.triage, parsed.data.by || "A person", parsed.data.ready === true, parsed.data.until));
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
          : `${who} changed the backlog item “${item.title}” (id ${itemId}) to: “${after.title}”${after.note ? ` — ${after.note}` : ""}. Carry the change into the spec sections and cards it touches, and say in one line what it changes (say with about ["backlog:${itemId}"]); if the new wording leaves something a builder needs unclear, ask about it the same way, with numbered options and your suggestion marked.`,
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
async function triage(useCaseId: string, item: Item, to: "working" | "accepted" | "rejected" | "deferred", by: string, ready = false, until?: string) {
  const back = until ? new Date(`${until}T00:00:00`) : null
  const backLabel = back ? back.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const suggestion = item.state === "suggested" || item.state === "probing";
  const group = item.group && !/^(Unsorted signal|Withdrawn|Parked by Socra)$/i.test(item.group) ? item.group : "";
  let moveId = "";
  if (to === "accepted") {
    const last = await prisma.move.findFirst({ where: { useCaseId }, orderBy: { position: "desc" }, select: { position: true } });
    const move = await prisma.move.create({
      data: {
        useCaseId, title: item.title.slice(0, 200), capability: group, prompt: item.note, status: ready ? "ready" : "queued", owner: "Product owner",
        signal: suggestion ? "SOCRA SUGGESTED" : "ACCEPTED", hidden: "story", position: (last?.position ?? 0) + 1, movedBy: by, moveReason: ready ? "chosen to work on from the backlog" : "accepted from the backlog",
      },
    });
    moveId = move.id;
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "accepted", deferUntil: null, ...(suggestion ? { state: "held", kind: "epic" } : {}) } });
    await recordChange(useCaseId, { node: `move:${move.id}`, kind: "added", summary: `${by} ${ready ? "chose to work on" : "accepted"} “${item.title}” ${ready ? "now: it is Ready to shape on the Board" : "onto the Board"}`, after: item.note, by, causes: [`backlog:${item.id}`] });
  } else if (to === "rejected") {
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "rejected", deferUntil: null, kind: "distraction", group: "Withdrawn", includeInBuild: false, state: "held" } });
    await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "withdrawn", summary: `${by} rejected “${item.title}” (kept in history)`, before: item.title, after: "Rejected", by });
  } else if (to === "deferred") {
    // It keeps its place (no group change, still shown greyed where it was) and comes back on its day.
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "deferred", deferUntil: back, includeInBuild: false, ...(suggestion ? { state: "held" } : {}) } });
    await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "changed", summary: `${by} deferred “${item.title}”${back ? ` until ${backLabel}` : ""}`, before: item.title, after: back ? `Deferred until ${backLabel}` : "Deferred", by });
  } else {
    await prisma.backlogItem.update({ where: { id: item.id }, data: { triage: "working", deferUntil: null } });
  }
  await prisma.useCase.update({ where: { id: useCaseId }, data: { updatedAt: new Date() } });
  if (agentsEnabled()) {
    const nodes = moveId ? [`backlog:${item.id}`, `move:${moveId}`] : [`backlog:${item.id}`];
    const ask = (stage: "accepted" | "working") => itemAsk({ node: nodes[0], extraNodes: nodes.slice(1), title: item.title, text: item.note, stage, by });
    const prompt =
      to === "accepted"
        ? `${by} ${ready ? "chose to work on the backlog item now" : "accepted the backlog item"} “${item.title}” (id ${item.id}); it is on the Board as a card${ready ? " in Ready to shape" : " in Backlog"} (move:${moveId}). Shape it: tie it to a capability and a decision and write its acceptance criteria on the card (upsert_move with id ${moveId}).\n${ask("accepted")}`
        : to === "rejected"
          ? `${by} rejected the backlog item “${item.title}” (id ${item.id}). ${suggestion ? "Don't propose it again unless they ask." : "Take it out of the product truth wherever it shaped something, and say in one line what that changes"} (with say about ["backlog:${item.id}"]). Ask nothing.`
          : to === "deferred"
            ? `${by} deferred the backlog item “${item.title}” (id ${item.id})${back ? ` until ${backLabel}` : " for later"}. Keep it, don't shape it now, and don't raise it before then unless asked${back ? `; on ${backLabel} it shows red again for a person to decide` : ""}. Ask nothing.`
            : `${by} wants to talk “${item.title}” (id ${item.id}) through now${item.note ? ` (${item.note.slice(0, 600)})` : ""}. Say in one line what you understand it to mean.\n${ask("working")}`;
    await enqueue(useCaseId, "user", prompt, nodes.join(" "));
  }
  return { ok: true, triage: to, moveId };
}
