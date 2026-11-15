import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// The people working on this product. Everyone shares one product truth; the role tells the Muse who
// it is talking to (a business analyst on the PRD, a product engineer on workflows and checkpoints...).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await prisma.member.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } }));
}

const Body = z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().min(2).max(60) });

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Give a name and a role." }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const have = await prisma.member.findFirst({ where: { useCaseId: id, name: parsed.data.name } });
  const m = have
    ? await prisma.member.update({ where: { id: have.id }, data: { role: parsed.data.role } })
    : await prisma.member.create({ data: { useCaseId: id, ...parsed.data } });
  return NextResponse.json(m, { status: have ? 200 : 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const mid = new URL(req.url).searchParams.get("member") ?? "";
  await prisma.member.deleteMany({ where: { id: mid, useCaseId: id } });
  return NextResponse.json({ ok: true });
}
