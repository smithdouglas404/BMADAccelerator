// The pure parts of the usage ledger: prices, token estimates, and counting runs per message.
// No imports, so tests compile it on its own. The ledger that writes to the database is ledger.ts.

// ---- prices (an estimate, never a bill) ----

/** US dollars per million tokens. */
export type Price = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

// Matched against the model name, first hit wins. Override or extend with BACC_PRICES_JSON, for example
// {"gpt-4.1-mini":{"input":0.4,"output":1.6}}. A model with no price is recorded with its tokens and cost 0, flagged estimated.
const PRICES: [RegExp, Price][] = [
  [/haiku/i, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
  [/sonnet/i, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }],
  [/opus|fable/i, { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  [/gpt-4\.1-mini/i, { input: 0.4, output: 1.6, cacheRead: 0.1 }],
  [/gpt-4\.1/i, { input: 2, output: 8, cacheRead: 0.5 }],
  [/gpt-5-mini/i, { input: 0.25, output: 2, cacheRead: 0.025 }],
  [/gpt-image/i, { input: 5, output: 40 }],
  [/text-embedding-3-small/i, { input: 0.02, output: 0 }],
  [/text-embedding-3-large/i, { input: 0.13, output: 0 }],
  [/gemini.*flash/i, { input: 0.3, output: 2.5 }],
];

export function priceFor(model: string, overrides = ""): Price | null {
  try {
    const o = overrides ? (JSON.parse(overrides) as Record<string, Price>) : {};
    const hit = Object.keys(o).find((k) => model.toLowerCase().includes(k.toLowerCase()));
    if (hit) return o[hit];
  } catch {
    // a bad override is ignored: the table below still answers
  }
  return PRICES.find(([re]) => re.test(model))?.[1] ?? null;
}

export type Tokens = { input: number; output: number; cache?: number; cacheWrite?: number };

/** Estimated dollars for one call: tokens times the model's price. Null when the model has no price. */
export function estimateCost(model: string, t: Tokens, overrides = ""): number | null {
  const p = priceFor(model, overrides);
  if (!p) return null;
  const m = 1_000_000;
  return (t.input * p.input + t.output * p.output + (t.cache ?? 0) * (p.cacheRead ?? p.input) + (t.cacheWrite ?? 0) * (p.cacheWrite ?? p.input)) / m;
}

/** Tokens from text length when a service does not report them (about four characters a token). Always an estimate. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---- what a model call is ----

/** One call, as the ledger records it. */
export type Call = {
  useCaseId?: string;
  /** Who: Socra | Claude Code | Document reader | Speech cleaner | Letta (<role>) | Mem0 | Image maker | Jev | <agent in the service> */
  agent: string;
  /** turn | build | control | document | speech | writer | memory | letta | image | judgement | agent */
  kind: string;
  purpose?: string;
  provider: string;
  model: string;
  input: number;
  output: number;
  cache?: number;
  /** When the provider reported a cost (Claude Code does), it is used as it is. */
  reportedUsd?: number;
  ms?: number;
  ok?: boolean;
  error?: string;
};

/** The dollars and where they came from. A reported cost is kept; otherwise tokens times the price table; with no price, 0 and "estimated". */
export function costOf(c: Call, tokensEstimated: boolean, overrides = ""): { usd: number; source: "reported" | "estimated" } {
  if (c.reportedUsd !== undefined && !tokensEstimated) return { usd: c.reportedUsd, source: "reported" };
  const usd = estimateCost(c.model, { input: c.input, output: c.output, cache: c.cache }, overrides);
  return { usd: usd ?? 0, source: "estimated" };
}

// ---- runs per message, and retries ----

export type RunRow = { id: string; useCaseId: string; turnId: string; agent: string; kind: string; ok: boolean; attempt: number; causes: string; costUsd: number; baseline?: boolean; at: Date | string };

export type MessageRuns = { message: string; runs: number; retries: number; failed: number; turns: number; usd: number; firstAt: string; lastAt: string };

/** The messages a turn answered: its causes named msg:<id>. */
export function messagesOf(causes: string): string[] {
  return [...new Set(causes.split(/\s+/).filter((c) => c.startsWith("msg:")).map((c) => c.slice(4)))];
}

/**
 * How many Claude runs each message cost, which were retries (a second or later run in a turn, or the run after a failed one),
 * and how many failed. A turn that answered several messages at once counts its runs once for each message, so the
 * per-message figures can add up to more than the total; `turns` says how many turns touched the message.
 * Only conversation runs ("turn") count: builds and side jobs are not answers to a message.
 */
export function runsPerMessage(rows: RunRow[]): MessageRuns[] {
  const by = new Map<string, { rows: RunRow[]; turns: Set<string> }>();
  for (const r of rows) {
    if (r.baseline || r.kind !== "turn") continue;
    for (const m of messagesOf(r.causes)) {
      const g = by.get(m) ?? { rows: [], turns: new Set<string>() };
      g.rows.push(r);
      g.turns.add(r.turnId || r.id);
      by.set(m, g);
    }
  }
  return [...by.entries()]
    .map(([message, g]) => {
      const sorted = [...g.rows].sort((a, b) => +new Date(a.at) - +new Date(b.at));
      let retries = 0;
      sorted.forEach((r, i) => {
        if (i > 0 || r.attempt > 1) retries++;
      });
      return {
        message,
        runs: sorted.length,
        retries,
        failed: sorted.filter((r) => !r.ok).length,
        turns: g.turns.size,
        usd: sorted.reduce((n, r) => n + r.costUsd, 0),
        firstAt: new Date(sorted[0].at).toISOString(),
        lastAt: new Date(sorted[sorted.length - 1].at).toISOString(),
      };
    })
    .sort((a, b) => b.runs - a.runs || b.usd - a.usd);
}

/** The attempt number of the next run in a turn: one more than the runs already recorded for it. */
export const nextAttempt = (alreadyInTurn: number) => alreadyInTurn + 1;
