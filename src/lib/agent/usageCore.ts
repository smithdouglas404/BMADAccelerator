
// What each Claude run used and cost. Claude Code reports running totals for a session at the end of each run; a resumed session's
// first report already includes the earlier runs. So each run records the difference from the session's last total, and a resumed
// session seen for the first time is a baseline (cost 0): its earlier cost was not ours to count.

export type Totals = { cost: number; input: number; output: number; cache: number };

/** What this run added, from the session's running totals now and the last totals recorded for it (null: never seen). */
export function usageDelta(prev: Totals | null, now: Totals, resumed: boolean): { delta: Totals; baseline: boolean } {
  if (!prev) {
    if (resumed) return { delta: { cost: 0, input: 0, output: 0, cache: 0 }, baseline: true };
    return { delta: now, baseline: false };
  }
  const d = (a: number, b: number) => Math.max(0, a - b);
  return { delta: { cost: d(now.cost, prev.cost), input: d(now.input, prev.input), output: d(now.output, prev.output), cache: d(now.cache, prev.cache) }, baseline: false };
}

export type ResultLike = { total_cost_usd?: number; duration_ms?: number; modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }> };

export function totalsOf(r: ResultLike): { totals: Totals; model: string } {
  const models = Object.entries(r.modelUsage ?? {});
  const sum = (f: (u: NonNullable<ResultLike["modelUsage"]>[string]) => number | undefined) => models.reduce((n, [, u]) => n + (f(u) ?? 0), 0);
  const main = models.sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0]?.[0] ?? "";
  return { totals: { cost: r.total_cost_usd ?? 0, input: sum((u) => u.inputTokens), output: sum((u) => u.outputTokens), cache: sum((u) => (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0)) }, model: main };
}

// ---- what the screens show ----

export type Row = { useCaseId: string; agent: string; kind: string; model: string; provider?: string; inputTokens: number; outputTokens: number; cacheTokens: number; costUsd: number; costSource?: string; ok?: boolean; baseline: boolean; at: Date | string };
type Group = { runs: number; tokens: number; inputTokens: number; outputTokens: number; cacheTokens: number; usd: number; failed: number; estimatedUsd: number };
export type Rollup = {
  totalUsd: number; estimatedUsd: number; runs: number; failed: number; tokens: number; since: string | null;
  byAgent: ({ agent: string } & Group)[];
  byKind: ({ kind: string } & Group)[];
  byProduct: ({ useCaseId: string } & Group)[];
  /** Each agent on each product: who spent what where. */
  byAgentProduct: ({ agent: string; useCaseId: string } & Group)[];
};

/** Sums the records per agent, per kind of call and per product, biggest first. Baselines (first sight of a resumed session) are not calls of ours. `estimatedUsd` is the part of the cost that is an estimate, not reported by the provider. */
export function rollup(rows: Row[]): Rollup {
  const real = rows.filter((r) => !r.baseline);
  const group = <K extends string>(key: (r: Row) => string, name: K, split?: (r: Row) => string) => {
    const m = new Map<string, Group>();
    for (const r of real) {
      const g = m.get(key(r)) ?? { runs: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, usd: 0, failed: 0, estimatedUsd: 0 };
      g.runs++;
      g.inputTokens += r.inputTokens;
      g.outputTokens += r.outputTokens;
      g.cacheTokens += r.cacheTokens;
      g.tokens += r.inputTokens + r.outputTokens + r.cacheTokens;
      g.usd += r.costUsd;
      if (r.ok === false) g.failed++;
      if (r.costSource === "estimated") g.estimatedUsd += r.costUsd;
      m.set(key(r), g);
    }
    return [...m.entries()].map(([k, g]) => ({ ...(split ? { agent: k.split("\u0000")[0], useCaseId: k.split("\u0000")[1] } : { [name]: k }), ...g })).sort((a, b) => b.usd - a.usd || b.runs - a.runs);
  };
  const first = rows.map((r) => new Date(r.at).getTime()).sort((a, b) => a - b)[0];
  return {
    totalUsd: real.reduce((n, r) => n + r.costUsd, 0),
    estimatedUsd: real.filter((r) => r.costSource === "estimated").reduce((n, r) => n + r.costUsd, 0),
    runs: real.length,
    failed: real.filter((r) => r.ok === false).length,
    tokens: real.reduce((n, r) => n + r.inputTokens + r.outputTokens + r.cacheTokens, 0),
    since: first ? new Date(first).toISOString() : null,
    byAgent: group((r) => r.agent, "agent") as Rollup["byAgent"],
    byKind: group((r) => r.kind, "kind") as Rollup["byKind"],
    byProduct: group((r) => r.useCaseId, "useCaseId") as Rollup["byProduct"],
    byAgentProduct: group((r) => `${r.agent}\u0000${r.useCaseId}`, "agent", () => "") as unknown as Rollup["byAgentProduct"],
  };
}
