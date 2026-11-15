import { prisma } from "@/lib/db";

// One question on screen at a time. Agents' questions wait in line, in the order
// asked, and the next one is shown as soon as the client answers the current one.

async function show(useCaseId: string, q: { id: string; agent: string; question: string; explanation: string }) {
  await prisma.message.create({
    data: {
      useCaseId,
      role: q.agent === "concierge" ? "concierge" : "bmad-agent",
      agent: q.agent,
      content: q.explanation ? `${q.question}\n\n${q.explanation}` : q.question,
    },
  });
  await prisma.question.update({ where: { id: q.id }, data: { status: "open" } });
  await prisma.useCase.update({ where: { id: useCaseId }, data: { pendingQuestion: q.question, activeAgent: q.agent } });
}

// Returns true when the question is on screen now, false when it waits in line.
export async function askQuestion(useCaseId: string, agent: string, question: string, explanation: string) {
  const q = await prisma.question.create({ data: { useCaseId, agent, question, explanation } });
  const open = await prisma.question.count({ where: { useCaseId, status: "open" } });
  if (open) return false;
  await show(useCaseId, q);
  return true;
}

// Records the client's answer to the open question, shows the next waiting one,
// and returns the question that was answered.
export async function answerQuestion(useCaseId: string, answer: string) {
  const open = await prisma.question.findFirst({ where: { useCaseId, status: "open" }, orderBy: { createdAt: "asc" } });
  if (open) {
    await prisma.question.update({ where: { id: open.id }, data: { status: "answered", answer, answeredAt: new Date() } });
  }
  const next = await prisma.question.findFirst({ where: { useCaseId, status: "waiting" }, orderBy: { createdAt: "asc" } });
  if (next) await show(useCaseId, next);
  else await prisma.useCase.update({ where: { id: useCaseId }, data: { pendingQuestion: "" } });
  return open;
}
