/**
 * Skill usage, from the real SkillEvent rows (Doug, Nov 21). Pure functions: no events means "never used".
 * "Used" counts a skill loaded into an agent's instructions plus an agent reading or invoking it in a turn;
 * "viewed" counts people opening it on the Skills page.
 */
export type SkillEventRow = { skill: string; kind: string; agent: string; useCaseId: string; createdAt: Date | string };
export type SkillMetric = { used: number; viewed: number; lastUsed: string | null; lastViewed: string | null; agents: string[]; useCases: number };

export function aggregateSkillEvents(rows: SkillEventRow[]): Record<string, SkillMetric> {
  const out: Record<string, SkillMetric & { _a: Set<string>; _u: Set<string> }> = {};
  for (const r of rows) {
    const m = (out[r.skill] ??= { used: 0, viewed: 0, lastUsed: null, lastViewed: null, agents: [], useCases: 0, _a: new Set(), _u: new Set() });
    const at = new Date(r.createdAt).toISOString();
    if (r.kind === "viewed") {
      m.viewed += 1;
      if (!m.lastViewed || at > m.lastViewed) m.lastViewed = at;
    } else {
      m.used += 1;
      if (!m.lastUsed || at > m.lastUsed) m.lastUsed = at;
      if (r.agent) m._a.add(r.agent);
      if (r.useCaseId) m._u.add(r.useCaseId);
    }
  }
  const result: Record<string, SkillMetric> = {};
  for (const [k, m] of Object.entries(out)) result[k] = { used: m.used, viewed: m.viewed, lastUsed: m.lastUsed, lastViewed: m.lastViewed, agents: [...m._a].sort(), useCases: m._u.size };
  return result;
}

export const NO_METRIC: SkillMetric = { used: 0, viewed: 0, lastUsed: null, lastViewed: null, agents: [], useCases: 0 };
