import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerSays } from "@/lib/studio/actions";
import { recordChange } from "@/lib/studio/truthlog";
import { LINK_KINDS, LINK_LABEL, connectPrompt, liveLinks, storyNodes, suggestPrompt, unlinked } from "@/lib/studio/storymap";

type Ctx = { params: Promise<{ id: string }> };

// The Story map: stories (board cards) and Socra's open recommendations, with the links between them.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({
    where: { id },
    include: { moves: { orderBy: { position: "asc" } }, backlog: { orderBy: { createdAt: "asc" } }, storyLinks: { orderBy: { createdAt: "asc" } } },
  });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const nodes = storyNodes(uc.moves, uc.backlog);
  const links = liveLinks(uc.storyLinks, nodes);
  return NextResponse.json({ nodes, links, unlinked: unlinked(nodes, links), dismissed: uc.storyLinks.filter((l) => l.status === "dismissed").length });
}

const Author = z.object({ name: z.string().max(80).optional(), role: z.string().max(60).optional() }).optional();
const Body = z.discriminatedUnion("action", [
  // A person connects two stories. With ask, Socra asks two or three questions to firm up the link.
  z.object({ action: z.literal("connect"), from: z.string().min(3), to: z.string().min(3), kind: z.enum(LINK_KINDS), ask: z.boolean().default(true), author: Author }),
  z.object({ action: z.enum(["accept", "dismiss", "remove"]), link: z.string().min(3), author: Author }),
  // A person asks Socra to look for links now.
  z.object({ action: z.literal("suggest"), author: Author }),
]);

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const b = parsed.data;
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const by = b.author?.name?.trim() || b.author?.role?.trim() || "The owner";

  const titleOf = async (ref: string) => {
    if (ref.startsWith("move:")) return (await prisma.move.findFirst({ where: { id: ref.slice(5), useCaseId: id } }))?.title ?? null;
    if (ref.startsWith("backlog:")) return (await prisma.backlogItem.findFirst({ where: { id: ref.slice(8), useCaseId: id } }))?.title ?? null;
    return null;
  };

  if (b.action === "connect") {
    if (b.from === b.to) return NextResponse.json({ error: "Pick two different stories." }, { status: 400 });
    const [a, c] = [await titleOf(b.from), await titleOf(b.to)];
    if (!a || !c) return NextResponse.json({ error: "One of those stories isn't in this product." }, { status: 404 });
    const l = await prisma.storyLink.upsert({
      where: { useCaseId_from_to_kind: { useCaseId: id, from: b.from, to: b.to, kind: b.kind } },
      create: { useCaseId: id, from: b.from, to: b.to, kind: b.kind, status: "confirmed", by },
      update: { status: "confirmed", by },
    });
    await recordChange(id, { node: b.from, kind: "changed", summary: `${by} linked “${a}” ${LINK_LABEL[b.kind]} “${c}”`, after: `${LINK_LABEL[b.kind]} ${c}`, causes: [b.to], by });
    if (b.ask) await ownerSays(id, connectPrompt(a, c, b.kind), { source: "Story map", author: b.author });
    return NextResponse.json({ ok: true, link: l.id }, { status: 201 });
  }

  if (b.action === "suggest") {
    await ownerSays(id, suggestPrompt(), { source: "Story map", author: b.author });
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const l = await prisma.storyLink.findFirst({ where: { id: b.link, useCaseId: id } });
  if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [a, c] = [(await titleOf(l.from)) ?? l.from, (await titleOf(l.to)) ?? l.to];
  const label = LINK_LABEL[l.kind as keyof typeof LINK_LABEL] ?? l.kind;
  if (b.action === "accept") {
    await prisma.storyLink.update({ where: { id: l.id }, data: { status: "confirmed" } });
    await recordChange(id, { node: l.from, kind: "approved", summary: `${by} accepted ${l.by || "Socra"}'s link: “${a}” ${label} “${c}”`, before: "suggested", after: "confirmed", causes: [l.to], by });
  } else {
    // Dismissed and removed links are kept as dismissed, so Socra never offers them again.
    await prisma.storyLink.update({ where: { id: l.id }, data: { status: "dismissed" } });
    await recordChange(id, { node: l.from, kind: "rejected", summary: `${by} ${b.action === "dismiss" ? "dismissed the suggested" : "removed the"} link “${a}” ${label} “${c}”`, before: l.status, after: "dismissed", causes: [l.to], by });
  }
  return NextResponse.json({ ok: true });
}
