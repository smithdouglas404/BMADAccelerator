/**
 * The accelerator's side of the Letta role agents (self-hosted Letta). Network calls only; the rules
 * are in lettaCore.ts. Adapted from Capability-Economics-Guide scripts/src/bmad-letta.ts: the same
 * idempotent setup (find agents by name, never overwrite their memory, keep the built-in memory tools
 * in tool_ids), the same /messages/stream call, and the same 429 back-off. Every call degrades: when
 * Letta is missing or down, the accelerator carries on without it.
 */
import {
  LESSONS_BLOCK_LABEL,
  MEM0_APP_ID,
  ROLES,
  SHARED_BLOCK_LABEL,
  TAG,
  assistantText,
  parsePortfolio,
  pickEmbedding,
  pickModel,
  questionMessage,
  renderPortfolio,
  roleFor,
  statusBlock,
  toolCalls,
  toolSources,
  upsertPortfolio,
  type LettaMessage,
  type PortfolioRow,
  type Role,
} from "./lettaCore";

const base = () => (process.env.LETTA_BASE_URL ?? "").replace(/\/+$/, "");
const key = () => process.env.LETTA_API_KEY ?? "";
export const lettaConfigured = () => Boolean(base());

async function letta<T = unknown>(method: string, p: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${base()}${p}`, {
      method,
      headers: { "Content-Type": "application/json", ...(key() ? { Authorization: `Bearer ${key()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 429 || attempt >= 5) break;
    const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res.ok) throw new Error(`Letta ${method} ${p} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const o = r as { items?: T[]; data?: T[] } | null;
  return o?.items ?? o?.data ?? [];
}

interface Agent { id: string; name: string }
interface Block { id: string; label: string; value: string }

async function findAgent(role: Role): Promise<Agent | undefined> {
  const list = rows<Agent>(await letta("GET", `/v1/agents/?name=${encodeURIComponent(role.agentName)}&limit=5`));
  return list.find((a) => a.name === role.agentName);
}

async function sharedBlock(): Promise<Block | undefined> {
  const list = rows<Block>(await letta("GET", `/v1/blocks/?label=${SHARED_BLOCK_LABEL}&tags=${TAG}&limit=5`));
  return list.find((b) => b.label === SHARED_BLOCK_LABEL);
}

const agentIds = new Map<string, string>();

/**
 * Creates or refreshes the six role agents, their tools and the shared block. Safe to run again:
 * existing agents keep their memory. Returns the model it used, or why it did nothing.
 */
export async function setupLetta(): Promise<{ ok: boolean; note: string }> {
  if (!lettaConfigured()) return { ok: false, note: "LETTA_BASE_URL is not set" };
  const handles = rows<{ handle?: string | null }>(await letta("GET", "/v1/models/")).map((m) => m.handle ?? "").filter(Boolean);
  const model = pickModel(handles, process.env.BACC_LETTA_MODEL || undefined);
  if (!model) return { ok: false, note: `Letta offers no Claude model yet (is ANTHROPIC_API_KEY set for Letta?). Offered: ${handles.slice(0, 10).join(", ") || "none"}` };
  const embeddings = rows<{ handle?: string | null }>(await letta("GET", "/v1/models/embedding")).map((m) => m.handle ?? "").filter(Boolean);
  const embedding = pickEmbedding(embeddings, process.env.BACC_LETTA_EMBEDDING || undefined);
  if (!embedding) return { ok: false, note: `Letta offers no OpenAI embedding model (is OPENAI_API_KEY set for Letta?). Offered: ${embeddings.join(", ") || "none"}` };

  const toolIds: string[] = [];
  for (const source_code of toolSources()) {
    const t = await letta<{ id: string; name: string }>("PUT", "/v1/tools/", { source_code, tags: [TAG] });
    toolIds.push(t.id);
  }
  // PATCH tool_ids replaces the whole list, so the built-in memory tools must be in it.
  for (const name of ["core_memory_replace", "core_memory_append", "conversation_search"]) {
    const t = rows<{ id: string; name: string }>(await letta("GET", `/v1/tools/?name=${name}&limit=5`)).find((x) => x.name === name);
    if (t) toolIds.push(t.id);
  }

  let shared = await sharedBlock();
  if (!shared) {
    shared = await letta<Block>("POST", "/v1/blocks/", {
      label: SHARED_BLOCK_LABEL,
      value: renderPortfolio([]),
      description: "Every use case in the accelerator: stage, active role, gates passed, last handoff. Written by the app.",
      tags: [TAG],
      limit: 8000,
    });
  }

  const secrets: Record<string, string> = {};
  if (process.env.MEM0_API_KEY) secrets.MEM0_API_KEY = process.env.MEM0_API_KEY;
  if (process.env.MEM0_BASE_URL) secrets.MEM0_BASE_URL = process.env.MEM0_BASE_URL;
  if (key()) secrets.LETTA_SERVER_PASSWORD = key();

  for (const role of ROLES) {
    const tags = [TAG, `${TAG}-role:${role.key}`, `app:${MEM0_APP_ID}`];
    const existing = await findAgent(role);
    if (existing) {
      // Keep the agent's own memory; refresh tools, secrets and the shared block.
      const switchModel = process.env.BACC_LETTA_MODEL === model;
      await letta("PATCH", `/v1/agents/${existing.id}`, { tool_ids: toolIds, tags, secrets, ...(switchModel ? { model } : {}) });
      await letta("PATCH", `/v1/agents/${existing.id}/core-memory/blocks/attach/${shared.id}`).catch(() => undefined);
      agentIds.set(role.key, existing.id);
      continue;
    }
    const a = await letta<Agent>("POST", "/v1/agents/", {
      name: role.agentName,
      description: `${role.name}, the BMAD ${role.title}: memory across the accelerator's use cases`,
      model,
      embedding,
      memory_blocks: [
        { label: "persona", value: role.persona, limit: 8000, read_only: true },
        { label: `${role.key}_status`, value: statusBlock(), limit: 3000, description: "This role's working state. Update it with your memory tools." },
        { label: LESSONS_BLOCK_LABEL, value: "none yet", limit: 6000, description: "The lessons this role learned across use cases, best first. Written by the app from Mem0." },
      ],
      block_ids: [shared.id],
      tool_ids: toolIds,
      include_base_tools: true,
      tags,
      secrets,
    });
    agentIds.set(role.key, a.id);
  }
  return { ok: true, note: `model ${model}, embedding ${embedding}` };
}

let ready: Promise<boolean> | null = null;
let readyAt = 0;

/** Makes the next memory use run setup again (after the memory model changes on the Settings page). */
export function resetLetta() {
  ready = null;
  readyAt = 0;
}

/** Runs setup once per process (again after 5 minutes if it failed). */
export function ensureLetta(): Promise<boolean> {
  if (!lettaConfigured()) return Promise.resolve(false);
  if (ready && (Date.now() - readyAt < 5 * 60_000)) return ready;
  readyAt = Date.now();
  ready = setupLetta()
    .then((r) => {
      if (!r.ok) console.warn("letta setup:", r.note);
      else console.log("letta ready:", r.note);
      if (!r.ok) readyAt = 0;
      return r.ok;
    })
    .catch((e) => {
      console.warn("letta setup failed:", e instanceof Error ? e.message : e);
      readyAt = Date.now() - 4 * 60_000; // try again in a minute
      return false;
    });
  return ready;
}

async function agentId(role: Role): Promise<string | null> {
  if (!(await ensureLetta())) return null;
  if (agentIds.has(role.key)) return agentIds.get(role.key)!;
  const a = await findAgent(role);
  if (a) agentIds.set(role.key, a.id);
  return a?.id ?? null;
}

async function send(id: string, content: string): Promise<LettaMessage[]> {
  // The streaming endpoint, not /messages: self-hosted Letta answers /messages with a 500 (load_agent).
  const res = await fetch(`${base()}/v1/agents/${id}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key() ? { Authorization: `Bearer ${key()}` } : {}) },
    body: JSON.stringify({ messages: [{ role: "user", content }], stream_tokens: false }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Letta POST messages/stream -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  const out: LettaMessage[] = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const m = JSON.parse(line.slice(6)) as LettaMessage & { message?: string; detail?: string };
    if (m.message_type === "error_message") throw new Error(`Letta agent error: ${m.message ?? ""} ${m.detail ?? ""}`.trim());
    out.push(m);
  }
  return out;
}

/** Sends a role a message and returns what it said and which tools it called. Null when Letta is unavailable. */
export async function tellRole(roleKey: string, content: string): Promise<{ text: string; tools: string[] } | null> {
  const role = roleFor(roleKey);
  if (!role) return null;
  const id = await agentId(role);
  if (!id) return null;
  const messages = await send(id, content);
  return { text: assistantText(messages), tools: toolCalls(messages) };
}

/** The app or a Claude agent asks a Letta role what it remembers. */
export async function askRole(roleKey: string, question: string, fromTitle: string, context = ""): Promise<string | null> {
  const msg = questionMessage(fromTitle, question);
  const r = await tellRole(roleKey, context.trim() ? `<retrieved_context>\n${context.trim()}\n</retrieved_context>\n\n${msg}` : msg);
  return r ? r.text : null;
}

/** Every role's top_lessons block, read without a model call. */
export async function topLessons(): Promise<{ role: Role; lessons: string }[]> {
  if (!(await ensureLetta())) return [];
  const out: { role: Role; lessons: string }[] = [];
  for (const role of ROLES) {
    const id = await agentId(role);
    if (!id) continue;
    const b = await letta<Block>("GET", `/v1/agents/${id}/core-memory/blocks/${LESSONS_BLOCK_LABEL}`).catch(() => null);
    const v = b?.value?.trim() ?? "";
    if (v && v !== "none yet") out.push({ role, lessons: v });
  }
  return out;
}

export async function setTopLessons(roleKey: string, value: string): Promise<void> {
  const role = roleFor(roleKey);
  if (!role) return;
  const id = await agentId(role);
  if (!id) return;
  await letta("PATCH", `/v1/agents/${id}/core-memory/blocks/${LESSONS_BLOCK_LABEL}`, { value: value.slice(0, 5900) || "none yet" });
}

export async function updatePortfolio(row: PortfolioRow): Promise<void> {
  if (!(await ensureLetta())) return;
  const shared = await sharedBlock();
  if (!shared) return;
  const next = upsertPortfolio(parsePortfolio(shared.value), row);
  await letta("PATCH", `/v1/blocks/${shared.id}`, { value: renderPortfolio(next) });
}

export async function portfolio(): Promise<PortfolioRow[]> {
  if (!(await ensureLetta())) return [];
  const shared = await sharedBlock();
  return shared ? parsePortfolio(shared.value) : [];
}

export async function lettaStatus(): Promise<{ up: boolean; agents: { role: string; name: string; id: string | null }[]; note?: string }> {
  if (!lettaConfigured()) return { up: false, agents: [], note: "not configured" };
  try {
    await letta("GET", "/v1/health/", undefined, 5000).catch(() => letta("GET", "/v1/models/", undefined, 5000));
  } catch (e) {
    return { up: false, agents: [], note: e instanceof Error ? e.message : String(e) };
  }
  const ok = await ensureLetta();
  const agents = [];
  for (const role of ROLES) agents.push({ role: role.key, name: role.name, id: ok ? await agentId(role) : null });
  return { up: true, agents, note: ok ? undefined : "role agents not set up yet (see server log)" };
}
