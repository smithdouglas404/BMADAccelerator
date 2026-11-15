import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncBoard } from "@/lib/bmadTickets";

type Ctx = { params: Promise<{ id: string }> };

// Re-reads BMAD's ticket tree (through Sofia's tickets.py) into the live board.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const useCase = await prisma.useCase.findUnique({ where: { id } });
  if (!useCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await syncBoard(id);
  return NextResponse.json({ synced: result.count, newUnknowns: result.newUnknowns });
}
