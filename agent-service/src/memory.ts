import { lettaName } from "./config.ts";
import { guess, noteUsage } from "./usage.ts";

// Mem0 (self-hosted) does not say what its OpenAI calls used, so they are noted from the text sent: fact extraction on the chat model
// and the embedding. The models are the ones Mem0 is configured with. Always flagged estimated.
const mem0Models = () => ({ llm: process.env.MEM0_DEFAULT_LLM_MODEL || "gpt-4.1-mini", embed: process.env.MEM0_DEFAULT_EMBEDDER_MODEL || "text-embedding-3-small" });

// Memory for every agent in the service (CLAUDE.md, "Agent memory: Mem0 + Letta"):
// - Mem0 (self-hosted) holds long-term facts, scoped to one customer and use case (user_id) and one agent (agent_id).
// - Letta (self-hosted) holds the agent's persona and its memory of each person, which it edits itself.
// Both degrade: when one is missing or down, the run carries on and its history says so.

const trim = (u?: string) => (u ?? "").replace(/\/+$/, "");

async function call<T>(base: string, headers: Record<string, string>, method: string, p: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export class Mem0 {
  private base: string;
  private key: string;
  constructor(base = trim(process.env.MEM0_BASE_URL), key = process.env.MEM0_API_KEY ?? "") {
    this.base = base;
    this.key = key;
  }
  get on() {
    return Boolean(this.base);
  }
  private h() {
    return this.key ? { "X-API-Key": this.key } : ({} as Record<string, string>);
  }
  async recall(scope: string, agent: string, query: string, limit = 6): Promise<string[]> {
    if (!this.on || !query.trim()) return [];
    const t = Date.now();
    const r = await call<{ results?: { memory?: string }[] } | { memory?: string }[]>(this.base, this.h(), "POST", "/search", {
      query: query.slice(0, 1000),
      filters: { user_id: scope, agent_id: agent },
      limit,
    }).catch(async (e) => {
      await noteUsage({ kind: "memory", purpose: "Mem0 search: embedding", provider: "openai", model: mem0Models().embed, input: guess(query.slice(0, 1000)), output: 0, cache: 0, estimated: true, ok: false, error: (e as Error).message, ms: Date.now() - t });
      throw e;
    });
    await noteUsage({ kind: "memory", purpose: "Mem0 search: embedding", provider: "openai", model: mem0Models().embed, input: guess(query.slice(0, 1000)), output: 0, cache: 0, estimated: true, ok: true, error: "", ms: Date.now() - t });
    const rows = Array.isArray(r) ? r : (r?.results ?? []);
    return rows.map((x) => x.memory ?? "").filter(Boolean).slice(0, limit);
  }
  async remember(scope: string, agent: string, messages: { role: string; content: string }[], meta: Record<string, string> = {}) {
    if (!this.on) return;
    const t = Date.now();
    const text = messages.map((m) => m.content).join("\n");
    const note = (ok: boolean, error: string) =>
      Promise.all([
        noteUsage({ kind: "memory", purpose: "Mem0 save: picking out the facts", provider: "openai", model: mem0Models().llm, input: guess(text), output: Math.ceil(guess(text) * 0.25), cache: 0, estimated: true, ok, error, ms: Date.now() - t }),
        noteUsage({ kind: "memory", purpose: "Mem0 save: embedding", provider: "openai", model: mem0Models().embed, input: guess(text), output: 0, cache: 0, estimated: true, ok, error, ms: 0 }),
      ]);
    try {
      await call(this.base, this.h(), "POST", "/memories", { messages, user_id: scope, agent_id: agent, metadata: { app_id: "studio-agent-service", ...meta } });
    } catch (e) {
      await note(false, (e as Error).message);
      throw e;
    }
    await note(true, "");
  }
}

type Block = { label: string; value: string };
type LettaAgent = { id: string; name: string; memory?: { blocks?: Block[] }; blocks?: Block[] };

export class Letta {
  private models: string[] | null = null;
  private embeddings: string[] | null = null;
  private ids = new Map<string, string>();
  private base: string;
  private key: string;
  constructor(base = trim(process.env.LETTA_BASE_URL), key = process.env.LETTA_SERVER_PASSWORD ?? process.env.LETTA_API_KEY ?? "") {
    this.base = base;
    this.key = key;
  }
  get on() {
    return Boolean(this.base);
  }
  private h() {
    return this.key ? { Authorization: `Bearer ${this.key}` } : ({} as Record<string, string>);
  }
  private rows<T>(r: unknown): T[] {
    if (Array.isArray(r)) return r as T[];
    const o = r as { items?: T[]; data?: T[] } | null;
    return o?.items ?? o?.data ?? [];
  }
  /** A cheap Claude model for the persona's own memory edits (Haiku first), and an OpenAI embedding. */
  private async pick() {
    this.models ??= this.rows<{ handle?: string }>(await call(this.base, this.h(), "GET", "/v1/models/")).map((m) => m.handle ?? "").filter(Boolean);
    this.embeddings ??= this.rows<{ handle?: string }>(await call(this.base, this.h(), "GET", "/v1/models/embedding")).map((m) => m.handle ?? "").filter(Boolean);
    const want = process.env.AGENT_SERVICE_LETTA_MODEL;
    const model = (want && this.models.find((m) => m === want)) || this.models.find((m) => /claude.*haiku/i.test(m)) || this.models.find((m) => /claude/i.test(m)) || this.models[0];
    const embedding = this.embeddings.find((m) => /text-embedding-3-small/.test(m)) || this.embeddings[0];
    if (!model || !embedding) throw new Error("Letta offers no model or embedding (are its keys set?)");
    return { model, embedding };
  }
  /** Finds or creates the Letta agent for (use case, agent, person). An existing one keeps its memory. */
  async agentFor(useCase: string, key: string, person: string, persona: string): Promise<string> {
    const name = lettaName(useCase, key, person);
    const cached = this.ids.get(name);
    if (cached) return cached;
    const found = this.rows<LettaAgent>(await call(this.base, this.h(), "GET", `/v1/agents/?name=${encodeURIComponent(name)}&limit=5`)).find((a) => a.name === name);
    let id = found?.id;
    if (!id) {
      const { model, embedding } = await this.pick();
      const made = await call<LettaAgent>(this.base, this.h(), "POST", "/v1/agents/", {
        name,
        model,
        embedding,
        memory_blocks: [
          { label: "persona", value: persona.slice(0, 4000), limit: 5000 },
          { label: "human", value: person ? `The person's name or id: ${person}. Nothing else known yet.` : "Nothing known yet about who is asking.", limit: 5000 },
        ],
        tags: ["studio-agent-service", `uc:${useCase}`, `agent:${key}`],
      });
      id = made.id;
    }
    this.ids.set(name, id);
    return id;
  }
  /** The persona and what this agent knows about the person, as Letta keeps them now. */
  async blocks(agentId: string): Promise<{ persona: string; human: string }> {
    const r = await call<unknown>(this.base, this.h(), "GET", `/v1/agents/${agentId}/core-memory/blocks`);
    const blocks = this.rows<Block>(r);
    return { persona: blocks.find((b) => b.label === "persona")?.value ?? "", human: blocks.find((b) => b.label === "human")?.value ?? "" };
  }
  /** Tells the persona what just happened, so it updates its own memory of the person (and itself). */
  async reflect(agentId: string, input: string, output: string) {
    const t = Date.now();
    const res = await call<{ usage?: { prompt_tokens?: number; completion_tokens?: number; cached_input_tokens?: number | null; step_count?: number }; messages?: { message_type?: string; content?: unknown }[] } | null>(
      this.base,
      this.h(),
      "POST",
      `/v1/agents/${agentId}/messages`,
      {
        messages: [
          {
            role: "user",
            content: `[Memory update only, no reply needed] You just helped this person.\nThey said: ${input.slice(0, 3000)}\nYou answered: ${output.slice(0, 3000)}\nUpdate your memory of the person (preferences, context, how they like to work) and of yourself if your role changed. Keep it short.`,
          },
        ],
      },
      60_000,
    ).catch(async (e) => {
      await noteUsage({ kind: "letta", purpose: "Letta persona updates its memory", provider: "letta", model: await this.modelOf(agentId), input: 0, output: 0, cache: 0, estimated: true, ok: false, error: (e as Error).message, ms: Date.now() - t });
      throw e;
    });
    // Letta says what its model used when it answers; when it does not, the text sent is counted (an estimate).
    const u = res?.usage;
    const sent = input.slice(0, 3000) + output.slice(0, 3000);
    await noteUsage({ kind: "letta", purpose: `Letta persona updates its memory${u?.step_count ? ` (${u.step_count} steps)` : ""}`, provider: "letta", model: await this.modelOf(agentId), input: u?.prompt_tokens ?? guess(sent), output: u?.completion_tokens ?? 0, cache: u?.cached_input_tokens ?? 0, estimated: !u, ok: true, error: "", ms: Date.now() - t });
  }
  private modelNames = new Map<string, string>();
  /** The model a Letta agent runs on, for the usage note. */
  private async modelOf(agentId: string): Promise<string> {
    const hit = this.modelNames.get(agentId);
    if (hit) return hit;
    const a = await call<{ llm_config?: { model?: string }; model?: string }>(this.base, this.h(), "GET", `/v1/agents/${agentId}`).catch(() => null);
    const m = a?.llm_config?.model ?? a?.model ?? "";
    if (m) this.modelNames.set(agentId, m);
    return m;
  }
}
