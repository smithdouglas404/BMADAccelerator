import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; mid: string }> };

const Body = z.object({ status: z.enum(["queued", "ready", "building", "review", "done"]).optional() });

// The owner moves a card on the Make it real board.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, mid } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const m = await prisma.move.findFirst({ where: { id: mid, useCaseId: id } });
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await prisma.move.update({ where: { id: mid }, data: parsed.data }));
}
