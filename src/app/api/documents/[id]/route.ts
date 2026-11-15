import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AGENTS, BMAD_DOC_TYPES, DOC_STAGES, ROUTABLE_AGENTS, type Routing } from "@/lib/bmad";
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
    status: z.enum(["in_review", "approved", "declined"]),
    stage: z.enum(DOC_STAGES.map((s) => s.key) as [string, ...string[]]),
    declineNote: z.string().max(2000),
    routing: z.array(z.object({ agent: z.enum(ROUTABLE_AGENTS), why: z.string().max(1000) })).max(6),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  // `status` is the source of truth; `approved` stays in step with it.
  const data = { ...parsed.data };
  if (data.approved === true && !data.status) data.status = "approved";
  if (data.status) data.approved = data.status === "approved";
  if (data.status && data.status !== "declined") data.declineNote = data.declineNote ?? "";
  const before = await prisma.document.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = await prisma.document.update({ where: { id }, data });
  const decided = data.status && data.status !== before.status ? data.status : "";
  if (decided === "declined") {
    await prisma.reviewItem.updateMany({
      where: { targetId: id, kind: "document", status: "open" },
      data: { status: "dismissed", answer: data.declineNote || "Declined", resolvedAt: new Date() },
    });
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: doc.useCaseId } });
    if (uc.provisioned && doc.origin === "upload") {
      await writeIntake(uc.id);
      if (agentsEnabled() && before.status === "approved") {
        await enqueue(
          uc.id,
          "document",
          `The client declined "${doc.fileName}", which was approved before${data.declineNote ? ` (reason: ${data.declineNote})` : ""}. Stop using it as input and tell the client in one line if anything already built on it needs a second look.`,
        );
      }
    }
  }
  if (decided === "in_review") {
    await prisma.reviewItem.updateMany({
      where: { targetId: id, kind: "document", status: { not: "open" } },
      data: { status: "open", resolvedAt: null },
    });
  }
  if (decided === "approved") {
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
        const routing = (doc.routing as Routing) ?? [];
        await enqueue(
          uc.id,
          "document",
          `The client approved a new document: "${doc.fileName}" (${type?.label ?? doc.bmadType}; for ${DOC_STAGES.find((x) => x.key === doc.stage)?.label ?? "any stage"}). Its text version is ${doc.textPath || "not available"}; it is listed in bacc/intake.md. Summary: ${doc.summary}\n\nIt matters to these BMAD agents:\n${
            routing.length
              ? routing.map((r) => `- ${AGENTS[r.agent as keyof typeof AGENTS]?.name} (\`${AGENTS[r.agent as keyof typeof AGENTS]?.skill}\`): ${r.why}`).join("\n")
              : `- ${type?.routesTo ?? "the concierge"}`
          }\n\nBring it to each of them in BMAD's order (earlier stages first), using each agent's own workflow to fold it into their documents. Each agent should compare it with what BMAD already has and ask the client, one question at a time, about anything unclear, missing or in conflict. Tell the client in one line who is picking it up.`,
        );
      }
    }
  }
  return NextResponse.json(doc);
}
