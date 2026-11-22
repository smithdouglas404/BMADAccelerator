import { AsyncLocalStorage } from "node:async_hooks";

// Every model call the service makes is noted here (Doug, Nov 22): the agent's own thinking (AgentKit), Letta's persona runs and
// Mem0's fact extraction and embeddings. The Studio reads the notes (GET /v1/admin/usage) into its own ledger, which prices them
// and sends them on to Nasiko. The service only records what was used; it never prices.

export type UsageNote = {
  useCase: string; run: string; agent: string;
  kind: "agent" | "letta" | "memory";
  purpose: string; provider: string; model: string;
  input: number; output: number; cache: number;
  /** True when the tokens are a guess from text length (a service that does not report them). */
  estimated: boolean; ok: boolean; error: string; ms: number;
  /** A stable key for a call that Inngest may replay, so it is recorded once. */
  key?: string;
};

export type Where = { useCase: string; run: string; agent: string };
const where = new AsyncLocalStorage<Where>();
let sink: ((n: UsageNote) => Promise<void>) | null = null;

/** The server sets this once: where notes are stored. */
export function setUsageSink(fn: ((n: UsageNote) => Promise<void>) | null) {
  sink = fn;
}
/** Everything inside `fn` belongs to this run, so memory calls name their use case and agent without being passed them. */
export const inRun = <T>(w: Where, fn: () => Promise<T>) => where.run(w, fn);

export async function noteUsage(n: Omit<UsageNote, "useCase" | "run" | "agent"> & Partial<Pick<UsageNote, "useCase" | "run" | "agent">>) {
  try {
    const w = where.getStore();
    await sink?.({ useCase: w?.useCase ?? "", run: w?.run ?? "", agent: w?.agent ?? "", ...n });
  } catch (e) {
    console.warn("[usage] not noted:", (e as Error).message);
  }
}

export const guess = (text: string) => Math.ceil(text.length / 4);

/** Tokens out of a provider's raw answer: Anthropic, OpenAI and Gemini each name them differently. Null when none are there. */
export function tokensFromRaw(raw: string | undefined): { input: number; output: number; cache: number; model: string } | null {
  if (!raw) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const model = typeof j.model === "string" ? j.model : typeof j.modelVersion === "string" ? j.modelVersion : "";
  const u = j.usage as Record<string, unknown> | undefined;
  if (u && ("input_tokens" in u || "output_tokens" in u))
    return { input: n(u.input_tokens), output: n(u.output_tokens), cache: n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens), model };
  if (u && ("prompt_tokens" in u || "completion_tokens" in u)) return { input: n(u.prompt_tokens), output: n(u.completion_tokens), cache: n((u.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens), model };
  const g = j.usageMetadata as Record<string, unknown> | undefined;
  if (g) return { input: n(g.promptTokenCount), output: n(g.candidatesTokenCount), cache: n(g.cachedContentTokenCount), model };
  return null;
}
