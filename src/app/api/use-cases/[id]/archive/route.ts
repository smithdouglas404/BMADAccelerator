import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stopPreview } from "@/lib/preview";
import { recordChange } from "@/lib/studio/truthlog";
import { canArchive, checkCloseout, closeoutSummary } from "@/lib/studio/archive";

type Ctx = { params: Promise<{ id: string }> };

// Archive a use case with its closeout, or restore it. The Studio's button, the Archived screen and the
// connector all come here; who may do it is decided in canArchive (lib/studio/archive.ts).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action === "restore" ? "restore" : "archive";
  const by = typeof body.by === "string" ? body.by.trim().slice(0, 80) : "";
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canArchive(by, uc)) return NextResponse.json({ error: "Only the person who started this use case can archive or restore it." }, { status: 403 });

  if (action === "restore") {
    await prisma.useCase.update({ where: { id }, data: { archivedAt: null, updatedAt: uc.updatedAt } });
    await recordChange(id, { node: "use-case", kind: "changed", summary: `${by || "Someone"} restored the use case from the archive`, by });
    return NextResponse.json({ ok: true, restored: uc.name });
  }

  // The form needs a decision (and the reason for a rejection); the connector may leave the closeout out.
  const checked = checkCloseout({ outcome: body.outcome, comments: body.comments, cost: body.cost, benefits: body.benefits }, body.closeout !== false);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const c = checked.closeout;
  await stopPreview(id).catch(() => undefined);
  await prisma.useCase.update({
    where: { id },
    data: { archivedAt: new Date(), archivedBy: by, archiveOutcome: c.outcome, archiveComments: c.comments, archiveCostEstimate: c.cost, archiveBenefits: c.benefits, updatedAt: uc.updatedAt },
  });
  await recordChange(id, { node: "use-case", kind: "changed", summary: `${by || "Someone"} archived the use case: ${closeoutSummary(c).decision}`, after: [c.comments, c.cost, c.benefits].filter(Boolean).join(" | "), by });
  return NextResponse.json({ ok: true, archived: uc.name, closeout: closeoutSummary(c) });
}
