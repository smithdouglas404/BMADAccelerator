import type { MemoryClient, MemoryHit } from "./agentMemory";

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
    return this.call("POST", "/memories", {
      messages,
      ...rest,
      metadata: { ...((metadata as Filter) ?? {}), ...(app_id ? { app_id } : {}) },
    });
  }

  async search(query: string, options: Record<string, unknown>): Promise<{ results?: MemoryHit[] }> {
    const filters = flattenFilters(toServerFilters(options.filters));
    return this.call("POST", "/search", {
      query,
      filters,
      ...(options.top_k !== undefined ? { top_k: options.top_k } : {}),
      ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
    });
  }

  /** Every record under one scope (the self-hosted server's GET /memories), for Settings > Agent memory. */
  async list(params: { user_id?: string; agent_id?: string; run_id?: string }, topK = 200): Promise<unknown> {
    // top_k/limit: the server lists 20 by default; newer servers read one of these, older ones ignore them.
    const q = new URLSearchParams([...(Object.entries(params).filter(([, v]) => v) as [string, string][]), ["top_k", String(topK)], ["limit", String(topK)]]);
    return this.call("GET", `/memories?${q}`);
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
