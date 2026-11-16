import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { moveCard, BOARD, BOARD_LABEL } from "@/lib/studio/board";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string; mid: string }> };

const Body = z.object({ status: z.enum(BOARD), by: z.string().max(80).default(""), why: z.string().max(400).default("") });

// A person moves a card by hand (never required: the Muse and the builds move them). It is logged and the
// Muse hears it, so a card moved back reopens the conversation about it.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, mid } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const before = await prisma.move.findFirst({ where: { id: mid, useCaseId: id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const by = parsed.data.by || "A person";
  const why = parsed.data.why || "moved by hand";
  const after = await moveCard(id, mid, parsed.data.status, by, why);
  if (agentsEnabled() && before.status !== parsed.data.status)
    await enqueue(
      id,
      "user",
      `${by} moved the card “${before.title}” from ${BOARD_LABEL[before.status as keyof typeof BOARD_LABEL] ?? before.status} to ${BOARD_LABEL[parsed.data.status]} (${why}). ${BOARD.indexOf(parsed.data.status) < BOARD.indexOf(before.status as (typeof BOARD)[number]) ? "It went back: ask in one line what isn't right yet, with your suggestion, and carry the answer into the spec." : "Carry it into the product truth if it changes anything."}`,
      `move:${mid}`,
    );
  return NextResponse.json(after);
}
