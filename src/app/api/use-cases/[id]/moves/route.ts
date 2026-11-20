import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BOARD, BOARD_LABEL } from "@/lib/studio/board";
import { recordChange } from "@/lib/studio/truthlog";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";
import { itemAsk } from "@/lib/studio/itemAsk";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  capability: z.string().max(120).default(""),
  prompt: z.string().max(8000).default(""),
  status: z.enum(BOARD).default("queued"),
  by: z.string().max(80).default(""),
});

// A person adds a card to the Board themselves. Socra hears it and shapes it like any other story.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Give the card a title." }, { status: 400 });
  const b = parsed.data;
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const by = b.by || "A person";
  const last = await prisma.move.findFirst({ where: { useCaseId: id }, orderBy: { position: "desc" }, select: { position: true } });
  const move = await prisma.move.create({
    data: { useCaseId: id, title: b.title, capability: b.capability, prompt: b.prompt, status: b.status, owner: "Product owner", signal: "ADDED BY HAND", hidden: "story", position: (last?.position ?? 0) + 1, movedBy: by, moveReason: "added on the Board" },
  });
  await recordChange(id, { node: `move:${move.id}`, kind: "added", summary: `${by} added the card “${b.title}” to ${BOARD_LABEL[b.status]}`, after: b.prompt, by });
  await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  if (agentsEnabled())
    await enqueue(id, "user", `${by} added a card to the Board by hand: “${b.title}”${b.capability ? ` (area: ${b.capability})` : ""}${b.prompt ? `. Details: ${b.prompt.slice(0, 1500)}` : ""}. Shape it like any other story: tie it to a capability and a decision, write its acceptance criteria, and suggest its Story map links.\n${itemAsk({ node: `move:${move.id}`, title: b.title, text: b.prompt, stage: b.status === "queued" ? "queued" : b.status, by })}`, `move:${move.id}`);
  return NextResponse.json(move, { status: 201 });
}
