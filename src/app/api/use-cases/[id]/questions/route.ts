import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// Every question the agents asked this client, in order: the one on screen, the ones waiting, and the answered ones.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const questions = await prisma.question.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ questions });
}
