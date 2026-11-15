import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  transcript: z.string().max(200000).optional(),
  status: z.enum(["draft", "submitted"]).optional(),
});

// Save keeps the draft; Submit marks it submitted and posts it to the conversation.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const rec = await prisma.recording.update({ where: { id }, data: parsed.data });
  if (parsed.data.status === "submitted" && rec.transcript.trim()) {
    await prisma.message.create({ data: { useCaseId: rec.useCaseId, role: "user", content: rec.transcript } });
  }
  return NextResponse.json(rec);
}
