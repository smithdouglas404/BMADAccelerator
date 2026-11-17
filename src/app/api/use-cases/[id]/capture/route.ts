import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { captureThought } from "@/lib/studio/actions";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ text: z.string().trim().min(1).max(4000), source: z.string().max(80).default("Phone / voice") });

// Ambient capture: a thought from the phone, the sidebar or a voice note. No ticket needed.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Nothing to capture." }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await captureThought(id, parsed.data.text, parsed.data.source), { status: 201 });
}
