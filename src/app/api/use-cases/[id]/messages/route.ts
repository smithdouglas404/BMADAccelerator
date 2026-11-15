import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerSays, undoApproval } from "@/lib/studio/actions";

type Ctx = { params: Promise<{ id: string }> };

const Author = z.object({ name: z.string().max(80).optional(), role: z.string().max(60).optional() }).optional();
const Body = z.object({
  content: z.string().trim().min(1).max(20000),
  source: z.string().max(80).optional(),
  author: Author,
  // "" or a specialist's key: who the message is addressed to.
  to: z.string().max(40).optional(),
  // The words as spoken, when the message was cleaned up from voice.
  raw: z.string().max(40000).optional(),
});

// Someone on the product talks to the Muse (or one of its specialists). A plain yes or a numbered pick
// is an approval; anything else is held in the backlog.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { content, ...opts } = parsed.data;
  return NextResponse.json(await ownerSays(id, content, opts), { status: 201 });
}

const Undo = z.object({ undo: z.string().min(1), author: Author });

// Undo an approval made by a yes or a pick.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Undo.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const d = await undoApproval(id, parsed.data.undo, parsed.data.author);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
