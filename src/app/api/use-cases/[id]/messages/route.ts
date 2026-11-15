import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ content: z.string().trim().min(1).max(20000) });

// Stores a user message. The concierge and BMAD agents run through the Claude
// Agent SDK in step 2; until ANTHROPIC_API_KEY is set, the concierge says so.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  const msg = await prisma.message.create({ data: { useCaseId: id, role: "user", content: parsed.data.content } });
  if (!process.env.ANTHROPIC_API_KEY) {
    await prisma.message.create({
      data: {
        useCaseId: id,
        role: "concierge",
        content:
          "Got it, I've saved that. The live BMAD agents switch on once the Anthropic API key is added to the server.",
      },
    });
  }
  await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json(msg, { status: 201 });
}
