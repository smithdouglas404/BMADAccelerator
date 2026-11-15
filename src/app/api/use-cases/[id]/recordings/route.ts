import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  purpose: z.string().max(40).default("describe"),
  transcript: z.string().max(200000).default(""),
});

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const rec = await prisma.recording.create({ data: { useCaseId: id, ...parsed.data } });
  return NextResponse.json(rec, { status: 201 });
}
