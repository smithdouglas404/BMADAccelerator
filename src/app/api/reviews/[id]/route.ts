import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  status: z.enum(["approved", "edited", "answered", "dismissed"]),
  answer: z.string().max(20000).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const item = await prisma.reviewItem.update({
    where: { id },
    data: { status: parsed.data.status, answer: parsed.data.answer ?? "", resolvedAt: new Date() },
  });
  if (parsed.data.answer) {
    await prisma.message.create({
      data: { useCaseId: item.useCaseId, role: "user", content: `${item.title}: ${parsed.data.answer}` },
    });
  }
  return NextResponse.json(item);
}
