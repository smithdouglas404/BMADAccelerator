import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { agentsEnabled, resume } from "@/lib/agent/runner";
import { studioState } from "@/lib/studio/state";
import { ensureStarted, focusCapability } from "@/lib/studio/actions";
import { VALIDATION_SIGNALS, type Validation } from "@/lib/studio/core";
import { connectionStatus } from "@/lib/studio/sync";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const state = await studioState(id);
  if (!state) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!state.started) void ensureStarted(id);
  void resume(id);
  return NextResponse.json({ ...state, agentsEnabled: agentsEnabled(), connections: connectionStatus() });
}

const SIGNAL_KEYS = VALIDATION_SIGNALS.map((s) => s.key) as [string, ...string[]];

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    lens: z.enum(["owner", "engineer"]),
    focus: z.string().max(80),
    prfaq: z.string().max(200000),
    validation: z.object({ key: z.enum(SIGNAL_KEYS), state: z.enum(["confirmed", "probe", "open"]) }),
    repoUrl: z.string().max(500),
    gitBranch: z.string().trim().min(1).max(120).regex(/^[\w./-]+$/),
    linearTeam: z.string().max(120),
    skills: z.array(z.string().max(80)).max(400),
    customer: z.string().trim().max(120),
    businessArea: z.string().trim().max(120),
    summary: z.string().max(2000),
    lastView: z.string().max(40).regex(/^[a-z-]*$/),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "That change isn't valid." }, { status: 400 });
  const before = await prisma.useCase.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { skills, validation, focus, prfaq, lastView, ...fields } = parsed.data;
  // Remembering where someone was is not a change to the product: it keeps the product's own updated time.
  if (lastView !== undefined && !Object.keys(fields).length && !skills && !validation && !focus && prfaq === undefined) {
    await prisma.useCase.update({ where: { id }, data: { lastView, updatedAt: before.updatedAt } });
    return NextResponse.json({ ok: true });
  }
  if (lastView !== undefined) (fields as Record<string, unknown>).lastView = lastView;
  if (skills) {
    await prisma.useCaseSkill.deleteMany({ where: { useCaseId: id } });
    if (skills.length) await prisma.useCaseSkill.createMany({ data: skills.map((skillId) => ({ useCaseId: id, skillId })) });
  }
  const data: Record<string, unknown> = { ...fields };
  if (validation) {
    const v = { ...((before.validation ?? {}) as Validation) } as Record<string, { state: string; note?: string }>;
    v[validation.key] = { ...(v[validation.key] ?? {}), state: validation.state, note: validation.state === "confirmed" ? "Confirmed by the owner" : "The owner asked to probe this" };
    data.validation = v;
  }
  if (prfaq !== undefined) Object.assign(data, { prfaq, prfaqUpdatedAt: new Date() });
  await prisma.useCase.update({ where: { id }, data });
  if (focus && focus !== before.focus) await focusCapability(id, focus);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.useCase.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
