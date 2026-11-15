import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { AGENTS } from "@/lib/bmad";
import { rememberAnswer } from "@/lib/memory";

type Ctx = { params: Promise<{ qid: string }> };

const Body = z.object({ answer: z.string().trim().min(1).max(20000) });

// The client changes an answer they gave earlier. The new answer replaces the old one,
// the conversation records the change, and the agent who asked updates its documents.
export async function PATCH(req: Request, { params }: Ctx) {
  const { qid } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Write the new answer" }, { status: 400 });
  const q = await prisma.question.findUnique({ where: { id: qid } });
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (q.status !== "answered") return NextResponse.json({ error: "Answer it in the conversation first" }, { status: 400 });
  const before = q.answer;
  const answer = parsed.data.answer;
  const updated = await prisma.question.update({ where: { id: qid }, data: { answer, answeredAt: new Date() } });
  const who = AGENTS[q.agent as keyof typeof AGENTS]?.name ?? q.agent;
  await prisma.message.create({
    data: { useCaseId: q.useCaseId, role: "user", content: `Change to my answer to ${who}'s question "${q.question}": ${answer}` },
  });
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: q.useCaseId } });
  rememberAnswer(uc, q.agent, q.question, answer);
  if (agentsEnabled()) {
    await enqueue(
      q.useCaseId,
      "user",
      `The client changed an earlier answer to ${who}'s question "${q.question}". Before they said: "${before}". Now: "${answer}". The new answer replaces the old one. Pass it to ${who} in their own update workflow so the documents say the new thing, and tell the client in one line what changed.`,
    );
  }
  await prisma.useCase.update({ where: { id: q.useCaseId }, data: { updatedAt: new Date() } });
  return NextResponse.json(updated);
}
