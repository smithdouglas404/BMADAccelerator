import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BMAD_DOC_TYPES } from "@/lib/bmad";
import { writeIntake } from "@/lib/provision";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

const Body = z
  .object({
    bmadType: z.enum(BMAD_DOC_TYPES.map((t) => t.key) as [string, ...string[]]),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    description: z.string().max(1000),
    summary: z.string().max(10000),
    approved: z.boolean(),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const doc = await prisma.document.update({ where: { id }, data: parsed.data });
  if (parsed.data.approved) {
    await prisma.reviewItem.updateMany({
      where: { targetId: id, kind: "document", status: "open" },
      data: { status: "approved", resolvedAt: new Date() },
    });
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: doc.useCaseId } });
    // A document approved after intake goes to BMAD the way BMAD takes inputs.
    if (uc.provisioned && doc.origin === "upload") {
      await writeIntake(uc.id);
      if (agentsEnabled()) {
        const type = BMAD_DOC_TYPES.find((t) => t.key === doc.bmadType);
        await enqueue(
          uc.id,
          "document",
          `The client approved a new document: "${doc.fileName}" (${type?.label ?? doc.bmadType}; usually goes to ${type?.routesTo ?? "the concierge"}). Its text version is ${doc.textPath || "not available"}; it is listed in bacc/intake.md. Bring it into the BMAD work where it belongs, using that agent's own workflow, and tell the client in one line.`,
        );
      }
    }
  }
  return NextResponse.json(doc);
}
