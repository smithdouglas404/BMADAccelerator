import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentsEnabled, kick } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

// "Try again" on a failed agent turn: puts the failed work back in the queue and starts it.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!agentsEnabled()) return NextResponse.json({ error: "Agents are not set up" }, { status: 400 });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.agentEvent.updateMany({
    where: { useCaseId: id, status: "failed", createdAt: { gt: since } },
    data: { status: "queued", attempts: 0 },
  });
  await prisma.useCase.update({ where: { id }, data: { agentError: "" } });
  void kick(id);
  return NextResponse.json({ requeued: count });
}
