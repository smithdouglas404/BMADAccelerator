import { prisma } from "@/lib/db";
import { aggregateSkillEvents, type SkillMetric } from "./skillMetricsCore";

/** Records one real skill event. Never throws: counting must not break a turn or a page. */
export async function logSkillEvents(events: { skill: string; kind: "loaded" | "used" | "viewed"; agent?: string; useCaseId?: string }[]) {
  const data = events.filter((e) => e.skill).map((e) => ({ skill: e.skill.slice(0, 120), kind: e.kind, agent: (e.agent ?? "").slice(0, 120), useCaseId: e.useCaseId ?? "" }));
  if (data.length === 0) return;
  await prisma.skillEvent.createMany({ data }).catch(() => undefined);
}

export async function skillMetrics(): Promise<{ since: string | null; metrics: Record<string, SkillMetric> }> {
  const rows = await prisma.skillEvent.findMany({ select: { skill: true, kind: true, agent: true, useCaseId: true, createdAt: true } }).catch(() => []);
  const since = rows.length ? new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))).toISOString() : null;
  return { since, metrics: aggregateSkillEvents(rows) };
}
