import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readTicketTree } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };

// Syncs the Kanban mirror from BMAD's ticket tree files (the source of truth).
// Status is preserved for cards the accelerator already knows about.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const useCase = await prisma.useCase.findUnique({ where: { id } });
  if (!useCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tree = await readTicketTree(useCase.slug);
  for (const t of tree) {
    await prisma.ticket.upsert({
      where: { useCaseId_ref: { useCaseId: id, ref: t.ref } },
      create: { useCaseId: id, ...t, status: t.unknown ? "backlog" : "ready" },
      update: {
        title: t.title,
        kind: t.kind,
        epicRef: t.epicRef,
        after: t.after,
        unknown: t.unknown,
        verify: t.verify,
        refined: t.refined,
      },
    });
    if (t.unknown) {
      const exists = await prisma.reviewItem.findFirst({
        where: { useCaseId: id, kind: "unknown", title: { contains: t.ref }, status: "open" },
      });
      if (!exists) {
        await prisma.reviewItem.create({
          data: {
            useCaseId: id,
            kind: "unknown",
            title: `Question on ${t.ref}: ${t.title}`,
            detail: t.unknown,
            reason: "Settle now, spike it, or leave it to the stories",
            source: "Sofia",
          },
        });
      }
    }
  }
  return NextResponse.json({ synced: tree.length });
}
