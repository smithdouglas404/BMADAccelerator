import { lettaName } from "./config.ts";

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
    const r = await call<{ results?: { memory?: string }[] } | { memory?: string }[]>(this.base, this.h(), "POST", "/search", {
      query: query.slice(0, 1000),
      filters: { user_id: scope, agent_id: agent },
      limit,
    });
    const rows = Array.isArray(r) ? r : (r?.results ?? []);
    return rows.map((x) => x.memory ?? "").filter(Boolean).slice(0, limit);
  }
  async remember(scope: string, agent: string, messages: { role: string; content: string }[], meta: Record<string, string> = {}) {
    if (!this.on) return;
    await call(this.base, this.h(), "POST", "/memories", { messages, user_id: scope, agent_id: agent, metadata: { app_id: "studio-agent-service", ...meta } });
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
    await call(
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
    );
  }
}
