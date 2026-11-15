import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const useCase = await prisma.useCase.findUnique({
    where: { id },
    include: {
      skills: true,
      documents: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      tickets: { orderBy: [{ position: "asc" }] },
      reviews: { orderBy: { createdAt: "desc" } },
      recordings: { where: { status: "draft" }, orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!useCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(useCase);
}

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(20000),
    intentDone: z.string().max(4000),
    intentKeep: z.string().max(4000),
    intentOutScope: z.string().max(4000),
    customer: z.string().max(2000),
    problem: z.string().max(4000),
    size: z.enum(["change", "epic", "project"]),
    needsApprovals: z.boolean(),
    clientVendor: z.boolean(),
    regulated: z.boolean(),
    ideaStage: z.enum(["new", "existing", "fuzzy"]),
    repoUrl: z.string().max(500),
    uxMode: z.enum(["fast", "coaching", "handoff"]),
    archMode: z.enum(["fast", "coaching"]),
    onboardingStep: z.number().int().min(0).max(3),
    stage: z.enum(["clarify", "plan", "build", "learn"]),
    activeAgent: z.string().max(40),
    skills: z.array(z.string().max(80)).max(400),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { skills, ...fields } = parsed.data;
  const useCase = await prisma.$transaction(async (tx) => {
    if (skills) {
      await tx.useCaseSkill.deleteMany({ where: { useCaseId: id } });
      if (skills.length) {
        await tx.useCaseSkill.createMany({ data: skills.map((skillId) => ({ useCaseId: id, skillId })) });
      }
    }
    return tx.useCase.update({ where: { id }, data: fields });
  });
  return NextResponse.json(useCase);
}
