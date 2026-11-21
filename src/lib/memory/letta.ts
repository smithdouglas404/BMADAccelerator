/**
 * The accelerator's side of the Letta role agents (self-hosted Letta). Network calls only; the rules
 * are in lettaCore.ts. Adapted from the Capability-Economics-Guide Letta pattern: the same
 * idempotent setup (find agents by name, never overwrite their memory, keep the built-in memory tools
 * in tool_ids), the same /messages/stream call, and the same 429 back-off. Every call degrades: when
 * Letta is missing or down, the accelerator carries on without it.
 */
import {
  HUMAN_BLOCK_LABEL,
  LESSONS_BLOCK_LABEL,
  appendPlaybookLine,
  customerTag,
  keepPassages,
  playbookLabel,
  type ArchivePassage,
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
  domainRole,
  statusBlock,
  toolCalls,
  toolSources,
  upsertPortfolio,
  type LettaMessage,
  type PortfolioRow,
  type Role,
} from "./lettaCore";
import type { Block as MindBlock, Passage as MindPassage } from "./inspectCore";

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

const HUMAN_BLOCK = { label: HUMAN_BLOCK_LABEL, value: "No one noted yet.", limit: 3000, description: "What this role has learned about the people it works with: their role, how they decide, what they care about. The role edits it." };

/** Whether Letta's sleep-time (background reflection) agent could be switched on: "on", "unsupported" (the server refused) or "unknown" (not tried yet). */
let sleeptime: "on" | "unsupported" | "unknown" = "unknown";
export const sleeptimeState = () => sleeptime;

type Ctx = { model: string; embedding: string; toolIds: string[]; sharedId: string; secrets: Record<string, string> };
let ctx: Ctx | null = null;

/** Creates an agent with Letta's sleep-time reflection agent on; if the server refuses the option, creates it without and remembers that. */
async function createAgent(body: Record<string, unknown>): Promise<Agent> {
  if (sleeptime !== "unsupported") {
    try {
      const a = await letta<Agent>("POST", "/v1/agents/", { ...body, enable_sleeptime: true });
      sleeptime = "on";
      return a;
    } catch (e) {
      if (!/ 4\d\d /.test(e instanceof Error ? e.message : "")) throw e;
      sleeptime = "unsupported";
      console.warn("letta: sleep-time agent not accepted, creating without it");
    }
  }
  return letta<Agent>("POST", "/v1/agents/", body);
}

/** Brings an agent made earlier up to date: the human block, and the sleep-time agent when the server accepts it. Never throws. */
async function upgradeAgent(id: string): Promise<void> {
  try {
    const have = rows<{ label: string }>(await letta("GET", `/v1/agents/${id}/core-memory/blocks`)).some((b) => b.label === HUMAN_BLOCK_LABEL);
    if (!have) {
      const b = await letta<Block>("POST", "/v1/blocks/", { ...HUMAN_BLOCK, tags: [TAG] });
      await letta("PATCH", `/v1/agents/${id}/core-memory/blocks/attach/${b.id}`);
    }
  } catch (e) {
    console.warn("letta human block", e instanceof Error ? e.message : e);
  }
  if (sleeptime === "unsupported") return;
  try {
    await letta("PATCH", `/v1/agents/${id}`, { enable_sleeptime: true });
    sleeptime = "on";
  } catch (e) {
    if (/ 4\d\d /.test(e instanceof Error ? e.message : "")) sleeptime = "unsupported";
  }
}

/** Creates (or finds) one role's Letta agent. Existing agents keep their memory; only a missing one is made. */
async function ensureRoleAgent(role: Role, c: Ctx): Promise<string> {
  const tags = [TAG, `${TAG}-role:${role.key}`, `app:${MEM0_APP_ID}`];
  const existing = await findAgent(role);
  if (existing) {
    agentIds.set(role.key, existing.id);
    return existing.id;
  }
  const a = await createAgent({
    name: role.agentName,
    description: `${role.name}, ${role.title} in the Working Backwards Studio: memory across products`,
    model: c.model,
    embedding: c.embedding,
    memory_blocks: [
      { label: "persona", value: role.persona, limit: 8000, read_only: true },
      { label: `${role.key.replace(/-/g, "_")}_status`, value: statusBlock(), limit: 3000, description: "This role's working state. Update it with your memory tools." },
      { label: LESSONS_BLOCK_LABEL, value: "none yet", limit: 6000, description: "The lessons this role learned across use cases, best first. Written by the app from Mem0." },
      HUMAN_BLOCK,
    ],
    block_ids: [c.sharedId],
    tool_ids: c.toolIds,
    include_base_tools: true,
    tags,
    secrets: c.secrets,
  });
  agentIds.set(role.key, a.id);
  return a.id;
}

/** The field experts made so far (Claims expert, Clinical expert...), found by name in Letta. */
export async function domainRoles(): Promise<Role[]> {
  if (!lettaConfigured()) return [];
  const out: Role[] = [];
  const list = rows<Agent>(await letta("GET", `/v1/agents/?tags=${encodeURIComponent(`${TAG}`)}&limit=200`).catch(() => []));
  for (const a of list) {
    const key = a.name.startsWith("bacc-") ? a.name.slice(5) : "";
    const r = key.startsWith("domain-") ? domainRole(key) : undefined;
    if (r) out.push(r);
  }
  return out;
}

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
  for (const name of ["core_memory_replace", "core_memory_append", "conversation_search", "archival_memory_insert", "archival_memory_search"]) {
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

  ctx = { model, embedding, toolIds, sharedId: shared.id, secrets };
  for (const role of ROLES) {
    const tags = [TAG, `${TAG}-role:${role.key}`, `app:${MEM0_APP_ID}`];
    const existing = await findAgent(role);
    if (existing) {
      // Keep the agent's own memory; refresh tools, secrets and the shared block.
      const switchModel = process.env.BACC_LETTA_MODEL === model;
      await letta("PATCH", `/v1/agents/${existing.id}`, { tool_ids: toolIds, tags, secrets, ...(switchModel ? { model } : {}) });
      await letta("PATCH", `/v1/agents/${existing.id}/core-memory/blocks/attach/${shared.id}`).catch(() => undefined);
      agentIds.set(role.key, existing.id);
      await upgradeAgent(existing.id);
      continue;
    }
    await ensureRoleAgent(role, ctx);
  }
  // Field experts made earlier keep their memory; refresh their tools like the fixed roles.
  for (const role of await domainRoles()) {
    const a = await findAgent(role);
    if (!a) continue;
    await letta("PATCH", `/v1/agents/${a.id}`, { tool_ids: toolIds, secrets }).catch(() => undefined);
    await letta("PATCH", `/v1/agents/${a.id}/core-memory/blocks/attach/${shared.id}`).catch(() => undefined);
    agentIds.set(role.key, a.id);
    await upgradeAgent(a.id);
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
  // A field's expert is made the first time its field is named, with the same memory as every other agent.
  if (!a && role.key.startsWith("domain-") && ctx) return ensureRoleAgent(role, ctx).catch((e) => {
    console.warn(`letta ${role.key} not created`, e instanceof Error ? e.message : e);
    return null;
  });
  return a?.id ?? null;
}

/** A role's Letta agent id, without creating it. */
export async function roleAgentId(roleKey: string): Promise<string | null> {
  const role = roleFor(roleKey);
  if (!role || !lettaConfigured()) return null;
  return agentIds.get(role.key) ?? (await findAgent(role).catch(() => undefined))?.id ?? null;
}

/** Makes sure a role has its Letta agent now (used when a specialist first speaks). */
export async function ensureRole(roleKey: string): Promise<boolean> {
  const role = roleFor(roleKey);
  return role ? (await agentId(role)) !== null : false;
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
  for (const role of [...ROLES, ...(await domainRoles())]) {
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

/** Letta's raw answer for the memory page: an agent's blocks and archival passages, read without a model call. */
async function mindOf(id: string): Promise<{ blocks: MindBlock[]; passages: MindPassage[] }> {
  const blocks = rows<MindBlock>(await letta("GET", `/v1/agents/${id}/core-memory/blocks`));
  const passages = rows<MindPassage>(await letta("GET", `/v1/agents/${id}/archival-memory?limit=50`).catch(() => []));
  return { blocks, passages };
}

/** A Studio role's Letta mind (persona, status, top lessons, the shared portfolio), for Settings > Agent memory. */
export async function roleMind(roleKey: string) {
  const role = roleFor(roleKey);
  if (!role || !lettaConfigured()) return null;
  const a = await findAgent(role);
  if (!a) return null;
  return { id: a.id, name: a.name, ...(await mindOf(a.id)) };
}

/** The Letta agents the shared agent service keeps for one app agent: one per person it has helped. */
export async function serviceMinds(useCaseId: string, key: string) {
  if (!lettaConfigured()) return [];
  const list = rows<Agent>(await letta("GET", `/v1/agents/?tags=${encodeURIComponent(`uc:${useCaseId}`)}&tags=${encodeURIComponent(`agent:${key}`)}&match_all_tags=true&limit=50`));
  const prefix = `svc-${useCaseId}-${key}-`;
  const out = [];
  for (const a of list.filter((x) => x.name.startsWith(prefix))) out.push({ id: a.id, name: a.name, ...(await mindOf(a.id)) });
  return out;
}


// ---- Archival notes: each role's own long notes, saved by the app and searched each turn --------------------

/** Saves a note in a role's own archive, tagged with the customer and use case so another customer never sees it. */
export async function archiveWrite(roleKey: string, text: string, opts: { customer?: string; useCaseId?: string; source?: string }): Promise<boolean> {
  const role = roleFor(roleKey);
  if (!role || !text.trim()) return false;
  const id = await agentId(role);
  if (!id) return false;
  try {
    await letta("POST", `/v1/agents/${id}/archival-memory`, { text: text.slice(0, 6000), tags: [customerTag(opts.customer), ...(opts.useCaseId ? [`use-case:${opts.useCaseId}`] : []), ...(opts.source ? [`source:${opts.source}`] : [])] });
    return true;
  } catch (e) {
    console.warn(`letta archive ${roleKey}`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** The best archive notes of a role for this customer, by meaning. */
export async function archiveSearch(roleKey: string, query: string, customer: string, limit = 3): Promise<ArchivePassage[]> {
  const role = roleFor(roleKey);
  if (!role || !query.trim()) return [];
  const id = await agentId(role);
  if (!id) return [];
  try {
    const found = rows<ArchivePassage>(await letta("GET", `/v1/agents/${id}/archival-memory?search=${encodeURIComponent(query.slice(0, 500))}&limit=${limit * 4}`));
    return keepPassages(found, customer, limit);
  } catch {
    return [];
  }
}

// ---- Customer playbook: one standalone block per customer that holds that customer's decisions --------------

async function playbookBlock(customer: string): Promise<Block | undefined> {
  const label = playbookLabel(customer);
  return rows<Block>(await letta("GET", `/v1/blocks/?label=${encodeURIComponent(label)}&limit=5`)).find((b) => b.label === label);
}

/** Adds a line to a customer's playbook (created on first use). It is read by the app each turn, never attached to the cross-customer roles. */
export async function playbookAppend(customer: string, line: string): Promise<boolean> {
  if (!(await ensureLetta())) return false;
  try {
    const b = await playbookBlock(customer);
    if (!b) {
      await letta("POST", "/v1/blocks/", { label: playbookLabel(customer), value: appendPlaybookLine("", line), tags: [TAG, "bacc-playbook"], limit: 6000, description: `What was decided for ${customer || "this workspace"}, newest first. Written by the app.` });
      return true;
    }
    await letta("PATCH", `/v1/blocks/${b.id}`, { value: appendPlaybookLine(b.value, line) });
    return true;
  } catch (e) {
    console.warn("letta playbook", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function playbookRead(customer: string): Promise<string> {
  if (!(await ensureLetta())) return "";
  try {
    return (await playbookBlock(customer))?.value?.trim() ?? "";
  } catch {
    return "";
  }
}
