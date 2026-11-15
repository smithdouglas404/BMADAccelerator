import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, START_PROMPT, agentsEnabled, resume } from "@/lib/agent/runner";
import { STAGES, AGENTS } from "@/lib/bmad";
import { syncPreviewState } from "@/lib/preview";

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
      feedback: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!useCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const preview = await syncPreviewState(useCase);
  void resume(id);
  const questionsWaiting = await prisma.question.count({ where: { useCaseId: id, status: "waiting" } });
  return NextResponse.json({ ...useCase, preview, agentsEnabled: agentsEnabled(), questionsWaiting });
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
  const before = await prisma.useCase.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const useCase = await prisma.$transaction(async (tx) => {
    if (skills) {
      await tx.useCaseSkill.deleteMany({ where: { useCaseId: id } });
      if (skills.length) {
        await tx.useCaseSkill.createMany({ data: skills.map((skillId) => ({ useCaseId: id, skillId })) });
      }
    }
    return tx.useCase.update({ where: { id }, data: fields });
  });
  // Intake finished: install BMAD and let the concierge start the work.
  if (fields.onboardingStep === 3 && before.onboardingStep < 3) {
    await enqueue(id, "start", START_PROMPT);
  }
  // The person clicked a stage on the process rail: jump there with its agent.
  if (fields.stage && fields.stage !== before.stage && before.onboardingStep >= 3) {
    const st = STAGES.find((s) => s.key === fields.stage);
    const lead = Object.entries(AGENTS).find(([, a]) => a.stage === fields.stage && a.skill.startsWith("bmad-agent"));
    await enqueue(
      id,
      "stage",
      `The client clicked "${st?.label}" on the process rail: they want to work on that stage now${lead ? ` (usually ${lead[1].name}, \`${lead[1].skill}\`)` : ""}. Check with the \`bmad\` skill what that stage needs given what exists, tell them in one line what happens there, and continue from where BMAD's work on it stands.`,
    );
  }
  return NextResponse.json(useCase);
}
