import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ content: z.string().trim().min(1).max(20000) });

// Stores a user message and hands it to the concierge, who runs BMAD.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  const msg = await prisma.message.create({ data: { useCaseId: id, role: "user", content: parsed.data.content } });
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id } });
  await prisma.useCase.update({ where: { id }, data: { pendingQuestion: "" } });
  if (agentsEnabled()) {
    await enqueue(
      id,
      "user",
      `The client says${uc.pendingQuestion ? ` (answering "${uc.pendingQuestion}")` : ""}:\n\n${parsed.data.content}`,
    );
  } else {
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
