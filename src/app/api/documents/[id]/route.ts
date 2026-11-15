import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BMAD_DOC_TYPES } from "@/lib/bmad";

type Ctx = { params: Promise<{ id: string }> };

const Body = z
  .object({
    bmadType: z.enum(BMAD_DOC_TYPES.map((t) => t.key) as [string, ...string[]]),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    description: z.string().max(1000),
    summary: z.string().max(10000),
    approved: z.boolean(),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const doc = await prisma.document.update({ where: { id }, data: parsed.data });
  if (parsed.data.approved) {
    await prisma.reviewItem.updateMany({
      where: { targetId: id, kind: "document", status: "open" },
      data: { status: "approved", resolvedAt: new Date() },
    });
  }
  return NextResponse.json(doc);
}
