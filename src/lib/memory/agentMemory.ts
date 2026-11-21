import {
  checkRemember,
  VERBATIM_KINDS,
  type MemoryKind,
  type MemoryScope,
  type RememberInput,
} from "./contract";

export * from "./contract";

/** One search hit as the service uses it. */
export interface MemoryHit {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/**
 * The slice of the Mem0 v3 client this package needs. Passing the client in keeps
 * mem0ai out of this package's dependencies, so the api-server can stay on 2.x until INN-135.
 */
export interface MemoryClient {
  add(
    messages: { role: string; content: string }[],
    options: Record<string, unknown>,
  ): Promise<{ event_id?: string; results?: unknown } | unknown>;
  search(
    query: string,
    options: Record<string, unknown>,
  ): Promise<{ results?: MemoryHit[] } | MemoryHit[]>;
  getEvent?(eventId: string): Promise<{ status?: string }>;
}

export type RememberResult =
  | { ok: true; eventId?: string; status?: string }
  | { ok: false; skipped: "not-configured" | "contract" | "error"; reason?: string };

export interface RecallOptions {
  scope: MemoryScope;
  /** Extra agent ids to search across (OR). The scope's own agent is always included. */
  alsoAgents?: string[];
  kinds?: MemoryKind[];
  limit?: number;
  threshold?: number;
}

export interface MemoryServiceOptions {
  /** Absent client means not configured: every call degrades, none throws. */
  client?: MemoryClient | null;
  /** Poll the save's event status this many times (default 3). */
  eventChecks?: number;
  eventDelayMs?: number;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toHits(res: unknown): MemoryHit[] {
  if (Array.isArray(res)) return res as MemoryHit[];
  const r = (res as { results?: MemoryHit[] } | null)?.results;
  return Array.isArray(r) ? r : [];
}

export class AgentMemory {
  private readonly client: MemoryClient | null;
  private readonly eventChecks: number;
  private readonly eventDelayMs: number;
  private readonly log: (m: string) => void;
  /** True when the last recall failed (as opposed to finding nothing). */
  lastRecallFailed = false;
  /** One search per run: key = run + query + filters. */
  private readonly cache = new Map<string, MemoryHit[]>();

  constructor(opts: MemoryServiceOptions = {}) {
    this.client = opts.client ?? null;
    this.eventChecks = opts.eventChecks ?? 3;
    this.eventDelayMs = opts.eventDelayMs ?? 250;
    this.log = opts.log ?? (() => {});
  }

  get configured(): boolean {
    return this.client !== null;
  }

  async remember(input: RememberInput): Promise<RememberResult> {
    const problem = checkRemember(input);
    if (problem) return { ok: false, skipped: "contract", reason: problem };
    if (!this.client) return { ok: false, skipped: "not-configured" };
    const { scope, metadata } = input;
    const options: Record<string, unknown> = {
      app_id: scope.appId,
      agent_id: scope.agentId,
      infer: !VERBATIM_KINDS.has(metadata.kind),
      metadata: { ...metadata },
    };
    if (scope.userId) options.user_id = scope.userId;
    if (scope.runId) options.run_id = scope.runId;
    if (input.expirationDate) options.expiration_date = input.expirationDate;
    try {
      const res = (await this.client.add([{ role: "user", content: input.text }], options)) as {
        event_id?: string;
      } | null;
      const eventId = res?.event_id;
      const status = eventId ? await this.checkEvent(eventId) : undefined;
      if (status === "FAILED") return { ok: false, skipped: "error", reason: "event failed" };
      return { ok: true, eventId, status };
    } catch (e) {
      this.log(`agent-memory remember failed: ${(e as Error).message}`);
      return { ok: false, skipped: "error", reason: (e as Error).message };
    }
  }

  private async checkEvent(eventId: string): Promise<string | undefined> {
    const get = this.client?.getEvent?.bind(this.client);
    if (!get) return undefined;
    let status: string | undefined;
    for (let i = 0; i < this.eventChecks; i++) {
      try {
        status = (await get(eventId)).status?.toUpperCase();
      } catch {
        return undefined;
      }
      if (status && status !== "PENDING" && status !== "RUNNING" && status !== "QUEUED") return status;
      if (i < this.eventChecks - 1) await sleep(this.eventDelayMs);
    }
    return status;
  }

  async recall(query: string, opts: RecallOptions): Promise<MemoryHit[]> {
    this.lastRecallFailed = false;
    if (!this.client || !query.trim()) return [];
    const { scope } = opts;
    const agents = Array.from(new Set([scope.agentId, ...(opts.alsoAgents ?? [])]));
    const and: Record<string, unknown>[] = [{ app_id: scope.appId }];
    and.push(agents.length > 1 ? { OR: agents.map((a) => ({ agent_id: a })) } : { agent_id: agents[0] });
    if (scope.userId) and.push({ user_id: scope.userId });
    if (opts.kinds?.length) and.push({ OR: opts.kinds.map((k) => ({ metadata: { kind: k } })) });
    const filters = { AND: and };
    const key = JSON.stringify([scope.runId ?? "", query, filters, opts.limit, opts.threshold]);
    if (scope.runId && this.cache.has(key)) return [...this.cache.get(key)!];
    try {
      const res = await this.client.search(query, {
        filters,
        top_k: opts.limit ?? 8,
        ...(opts.threshold !== undefined ? { threshold: opts.threshold } : {}),
      });
      const hits = toHits(res);
      if (scope.runId) this.cache.set(key, hits);
      return [...hits];
    } catch (e) {
      this.lastRecallFailed = true;
      this.log(`agent-memory recall failed: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * Ask helper: recall for a question and format it as context, or tell the caller
   * what is missing with NEED_CONTEXT lines (the Studio role agents' convention).
   */
  async ask(question: string, opts: RecallOptions): Promise<{ context: string; needContext: string[]; degraded?: boolean }> {
    const hits = await this.recall(question, opts);
    // Memory unavailable is not the same as nothing stored: do not send the agent off asking for known facts.
    if (!hits.length && (!this.client || this.lastRecallFailed)) return { context: "", needContext: [], degraded: true };
    if (!hits.length) return { context: "", needContext: [`NEED_CONTEXT: ${question}`] };
    return { context: hits.map((h) => `- ${h.memory}`).join("\n"), needContext: [] };
  }

  /** Record whether a recalled memory helped. Stored as a verbatim qa memory pointing at the id. */
  feedback(memoryId: string, helpful: boolean, scope: MemoryScope, note?: string) {
    return this.remember({
      text: `Feedback on memory ${memoryId}: ${helpful ? "helpful" : "not helpful"}${note ? ` - ${note}` : ""}`,
      scope,
      metadata: { kind: "qa", source: "feedback", confidence: helpful ? 0.9 : 0.1 },
    });
  }

  /** Copy lessons learned by one agent into a shared agent id so other agents recall them. */
  async promoteLessons(from: MemoryScope, toAgentId: string, limit = 50): Promise<number> {
    // Kind-filtered, no threshold: search is semantic, so the query is only a hint and nothing is excluded by wording.
    const lessons = await this.recall("lesson", { scope: from, kinds: ["lesson"], limit, threshold: 0 });
    if (this.lastRecallFailed || !lessons.length) return 0;
    const target = { ...from, agentId: toAgentId };
    const have = new Set(
      (await this.recall("lesson", { scope: target, kinds: ["lesson"], limit: 200, threshold: 0 })).map((h) =>
        h.memory.trim().toLowerCase(),
      ),
    );
    let promoted = 0;
    for (const l of lessons) {
      if (have.has(l.memory.trim().toLowerCase())) continue; // idempotent
      const r = await this.remember({
        text: l.memory,
        scope: target,
        metadata: { kind: "lesson", source: `promoted-from:${from.agentId}:${l.id}` },
      });
      if (r.ok) promoted++;
    }
    return promoted;
  }
}
