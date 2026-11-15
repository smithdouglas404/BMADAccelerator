import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

// Closes open review items raised before the latest build, which no longer apply to the current version.
// Documents are kept: they are approved or declined in the Documents panel.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc?.lastGeneratedAt) return NextResponse.json({ closed: 0 });
  const old = await prisma.reviewItem.findMany({
    where: { useCaseId: id, status: "open", kind: { not: "document" }, createdAt: { lt: uc.lastGeneratedAt } },
  });
  if (!old.length) return NextResponse.json({ closed: 0 });
  await prisma.reviewItem.updateMany({
    where: { id: { in: old.map((r) => r.id) } },
    data: { status: "dismissed", answer: "Closed: from an earlier version", resolvedAt: new Date() },
  });
  if (agentsEnabled()) {
    await enqueue(
      id,
      "review",
      `The client closed ${old.length} review item${old.length === 1 ? "" : "s"} from before the latest build, as no longer applying: ${old
        .map((r) => `"${r.title}"`)
        .join(", ")}. Don't raise them again unless they still matter for the current version; if one does, raise it again in today's terms. No need to tell the client.`,
    );
  }
  return NextResponse.json({ closed: old.length });
}
