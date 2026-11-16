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
