import type { MemoryClient, MemoryHit } from "./agentMemory";
import { guessTokens, recordCall } from "@/lib/llm/ledger";

/** What fact extraction writes back, as a share of what it reads: a guess (Mem0 does not say), flagged as an estimate wherever shown. */
const EXTRACTION_OUT_SHARE = 0.25;

// The self-hosted Mem0 server (open source, docker-compose service "mem0") behind the
// MemoryClient interface AgentMemory expects. Differences from Mem0 Cloud that this hides:
// - auth is the X-API-Key header (a Bearer header is read as a JWT);
// - there is no app_id field, so app_id travels in metadata, where filters can reach it;
// - metadata is stored flat, so a {metadata: {kind}} filter becomes {kind};
// - rerank and latest_only are Cloud options, so they are dropped.

type Filter = Record<string, unknown>;

// Turns Cloud-style filters into the self-hosted server's: {metadata: {k: v}} -> {k: v}, recursively.
export function toServerFilters(f: unknown): unknown {
  if (Array.isArray(f)) return f.map(toServerFilters);
  if (!f || typeof f !== "object") return f;
  const out: Filter = {};
  for (const [k, v] of Object.entries(f as Filter)) {
    if (k === "metadata" && v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, v as Filter);
    else if (k === "AND" || k === "OR" || k === "NOT") out[k] = toServerFilters(v);
    else out[k] = v;
  }
  return out;
}

// The self-hosted server needs the filters flat, with an entity id (user, agent or run) at the top:
// it does not apply an OR nested inside AND. AgentMemory sends {AND: [{app_id}, {OR: agents}, {user_id},
// {OR: kinds}]}, so each plain clause moves to the top, an OR over entity ids stays an OR, and an OR
// over one metadata key becomes {key: {in: [...]}}.
const ENTITY = ["user_id", "agent_id", "run_id"];
export function flattenFilters(filters: unknown): Filter {
  const f = (filters ?? {}) as Filter;
  if (!Array.isArray(f.AND)) return f;
  const top: Filter = {};
  for (const [k, v] of Object.entries(f)) if (k !== "AND") top[k] = v;
  for (const clause of f.AND as Filter[]) {
    const keys = Object.keys(clause ?? {});
    if (keys.length === 1 && keys[0] === "OR" && Array.isArray(clause.OR)) {
      const alts = clause.OR as Filter[];
      const k = Object.keys(alts[0] ?? {})[0];
      const same = k && alts.every((a) => Object.keys(a).length === 1 && Object.keys(a)[0] === k && typeof a[k] !== "object");
      if (same && !ENTITY.includes(k)) top[k] = { in: alts.map((a) => a[k]) };
      else if (same && alts.length === 1) top[k] = alts[0][k];
      else top.OR = alts;
    } else Object.assign(top, clause);
  }
  return top;
}

export class Mem0RestClient implements MemoryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 20_000,
  ) {}

  private async call<T>(method: string, p: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${p}`, {
      method,
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { "X-API-Key": this.apiKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Mem0 ${method} ${p} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async add(messages: { role: string; content: string }[], options: Record<string, unknown>) {
    const { app_id, metadata, ...rest } = options;
    const t = Date.now();
    const text = messages.map((m) => m.content).join("\n");
    const useCaseId = typeof options.run_id === "string" ? options.run_id : "";
    const agent = `Mem0 · ${typeof options.agent_id === "string" ? options.agent_id : "memory"}`;
    try {
      const res = await this.call("POST", "/memories", {
        messages,
        ...rest,
        metadata: { ...((metadata as Filter) ?? {}), ...(app_id ? { app_id } : {}) },
      });
      await this.record(agent, useCaseId, "saving a memory", text, guessTokens(text) * EXTRACTION_OUT_SHARE, options.infer !== false, Date.now() - t, true, "");
      return res;
    } catch (e) {
      await this.record(agent, useCaseId, "saving a memory", text, 0, options.infer !== false, Date.now() - t, false, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  /**
   * Mem0 (self-hosted) does not report what its OpenAI calls used, so they are recorded from the text sent and received, as an
   * estimate: fact extraction on the chat model when it infers facts, and the embedding of the text (or the search words).
   * The models are the ones Mem0 is configured with (MEM0_DEFAULT_LLM_MODEL, MEM0_DEFAULT_EMBEDDER_MODEL).
   */
  private async record(agent: string, useCaseId: string, purpose: string, text: string, outTokens: number, infers: boolean, ms: number, ok: boolean, error: string) {
    const input = guessTokens(text);
    const where = { useCaseId };
    if (infers) await recordCall({ agent, kind: "memory", purpose: `${purpose}: picking out the facts`, provider: "openai", model: process.env.MEM0_DEFAULT_LLM_MODEL || "gpt-4.1-mini", input, output: Math.ceil(outTokens), ms, ok, error }, where, { estimated: true });
    await recordCall({ agent, kind: "memory", purpose: `${purpose}: embedding`, provider: "openai", model: process.env.MEM0_DEFAULT_EMBEDDER_MODEL || "text-embedding-3-small", input, output: 0, ms: infers ? 0 : ms, ok, error }, where, { estimated: true });
  }

  async search(query: string, options: Record<string, unknown>): Promise<{ results?: MemoryHit[] }> {
    const filters = flattenFilters(toServerFilters(options.filters));
    const t = Date.now();
    const useCaseId = JSON.stringify(options.filters ?? {}).match(/"use_case":"([^"]+)"/)?.[1] ?? "";
    try {
      const res = await this.call<{ results?: MemoryHit[] }>("POST", "/search", {
        query,
        filters,
        ...(options.top_k !== undefined ? { top_k: options.top_k } : {}),
        ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
      });
      await this.record("Mem0 · recall", useCaseId, "searching memory", query, 0, false, Date.now() - t, true, "");
      return res;
    } catch (e) {
      await this.record("Mem0 · recall", useCaseId, "searching memory", query, 0, false, Date.now() - t, false, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.call("GET", "/configure");
      return true;
    } catch {
      return false;
    }
  }
}
