/**
 * The accelerator's agent memory, in the owner's pattern (letta-mem0-role-agents):
 * Mem0 is the long-term memory, Letta is each role's working mind. Both are self-hosted.
 *
 * The loop, per agent turn:
 *  1. Recall once: search Mem0 across every use case and read each role's top lessons from Letta,
 *     then hand both to the agents inside <retrieved_context>.
 *  2. Work: BMAD runs unmodified.
 *  3. Ask: the agents can search memory, or ask a Letta role what it remembers.
 *  4. Remember: answers, approvals, gate decisions, screen feedback and builds are saved to Mem0 as
 *     they happen, with the same labels every time (contract.ts).
 *  5. Learn: after a gate or a build the role saves general lessons, and the app copies each role's
 *     best lessons into its top_lessons block.
 * Nothing here throws: when Mem0 or Letta is missing or down, the accelerator works as before.
 */
import { AgentMemory, VERBATIM_KINDS, type MemoryHit, type MemoryKind, type MemoryScope } from "./agentMemory";
import { Mem0RestClient } from "./mem0Rest";
import { MEM0_APP_ID, MEM0_USER_ID, ROLES, generatedMessage, gateMessage, memAgentId, roleFor } from "./lettaCore";
import * as letta from "./letta";
import { AGENTS } from "@/lib/bmad";

const client = process.env.MEM0_BASE_URL ? new Mem0RestClient(process.env.MEM0_BASE_URL, process.env.MEM0_API_KEY ?? "") : null;
export const memory = new AgentMemory({ client, log: (m) => console.warn(m) });
export const memoryConfigured = () => memory.configured;

type UseCaseRef = { id: string; name: string };

const clip = (s: string, n = 3000) => (s.length > n ? `${s.slice(0, n)}...` : s);
const nameOf = (agent: string) => {
  const a = AGENTS[agent as keyof typeof AGENTS];
  return a ? `${a.name} (${a.role})` : agent;
};
// Only BMAD roles own memories; the concierge and others write under the concierge.
const ownerKey = (agent: string) => (roleFor(agent) ? agent : "concierge");

function scope(agent: string, uc: UseCaseRef): MemoryScope {
  return { appId: MEM0_APP_ID, agentId: memAgentId(ownerKey(agent)), userId: MEM0_USER_ID, runId: uc.id };
}

function save(agent: string, uc: UseCaseRef, kind: MemoryKind, text: string, source: string, extra: Record<string, unknown> = {}) {
  if (!memory.configured || !text.trim()) return;
  void memory
    .remember({
      text,
      scope: scope(agent, uc),
      metadata: { kind, role: ownerKey(agent), agent_role: ownerKey(agent), source, use_case: uc.id, use_case_title: uc.name, ...extra },
    })
    .then(async (r) => {
      if (r.ok) return;
      // Fact extraction (infer) needs Mem0's model; if that call failed, keep the text verbatim rather than lose it.
      if (r.skipped === "error" && client && !VERBATIM_KINDS.has(kind)) {
        const s = scope(agent, uc);
        const retry = await client
          .add([{ role: "user", content: text }], {
            app_id: s.appId, agent_id: s.agentId, user_id: s.userId, run_id: s.runId, infer: false,
            metadata: { kind, agent_role: ownerKey(agent), source, use_case: uc.id, use_case_title: uc.name, ...extra, infer_failed: true },
          })
          .then(() => true, () => false);
        if (retry) return;
      }
      console.warn(`memory not saved (${kind}): ${r.skipped}${"reason" in r && r.reason ? ` ${r.reason}` : ""}`);
    });
}

/** A question an agent asked and the client's answer. */
export function rememberAnswer(uc: UseCaseRef, agent: string, question: string, answer: string) {
  if (!question.trim() || !answer.trim()) return;
  save(agent, uc, "qa", `[Q&A | ${nameOf(agent)} | use case "${uc.name}"]\nQ: ${clip(question)}\nA: ${clip(answer)}`, "accelerator:question");
}

/** The client approved or declined something (a document, a review item). */
export function rememberDecision(uc: UseCaseRef, agent: string, text: string, source: string) {
  save(agent, uc, "decision", `[Decision | ${nameOf(agent)} | use case "${uc.name}"]\n${clip(text)}`, source);
}

/** Screen feedback the client gave on a generated app: a requirement change. */
export function rememberFeedback(uc: UseCaseRef, ref: string, note: string) {
  save("po", uc, "requirement", `[Screen feedback ${ref} | use case "${uc.name}"]\n${clip(note)}`, "accelerator:feedback", { feedback: ref });
}

/** What a Generate built. */
export function rememberBuild(uc: UseCaseRef, summary: string) {
  save("dev", uc, "run_summary", `[App generated | use case "${uc.name}"]\n${clip(summary)}`, "accelerator:generate");
}

/** A lesson an agent states for future use cases. */
export function rememberLesson(uc: UseCaseRef, agent: string, lesson: string, confidence = 0.7) {
  save(agent, uc, "lesson", lesson.trim(), "accelerator:agent", { confidence: Math.max(0, Math.min(1, confidence)) });
}

function label(h: MemoryHit) {
  const md = (h.metadata ?? {}) as Record<string, unknown>;
  // Mem0's server keeps "role" for the message role, so the agent's role travels as agent_role.
  const r = typeof md.agent_role === "string" ? md.agent_role : "";
  const role = r ? (roleFor(r)?.name ?? (r === "concierge" ? "Concierge" : r)) : "";
  const uc = typeof md.use_case_title === "string" ? `use case "${md.use_case_title}"` : "";
  return [md.kind, role, uc].filter(Boolean).join(" | ");
}

/** Searches every use case's memory; hits from `excludeUseCase` are left out (its own files hold them). */
export async function searchMemory(query: string, opts: { role?: string; kinds?: MemoryKind[]; excludeUseCase?: string; limit?: number; runId?: string } = {}) {
  if (!memory.configured || !query.trim()) return [] as MemoryHit[];
  const agents = opts.role && roleFor(opts.role) ? [memAgentId(opts.role)] : [...ROLES.map((r) => r.memAgentId), memAgentId("concierge")];
  const hits = await memory.recall(query.slice(0, 2000), {
    scope: { appId: MEM0_APP_ID, agentId: agents[0], userId: MEM0_USER_ID, runId: opts.runId },
    alsoAgents: agents.slice(1),
    kinds: opts.kinds,
    limit: (opts.limit ?? 6) + 6,
  });
  return hits.filter((h) => !opts.excludeUseCase || (h.metadata as Record<string, unknown> | undefined)?.use_case !== opts.excludeUseCase).slice(0, opts.limit ?? 6);
}

export function formatHits(hits: MemoryHit[]) {
  return hits.map((h) => `- [${label(h)}] ${clip(h.memory, 1200)}`).join("\n");
}

/**
 * Step 1 of the loop: what the agents should know from earlier use cases, once per turn. Returns ""
 * when there is nothing (or memory is off), so the prompt is unchanged.
 */
export async function recallForTurn(uc: UseCaseRef & { description?: string }, prompt: string): Promise<string> {
  const parts: string[] = [];
  try {
    const query = `${uc.name}. ${uc.description ?? ""}\n${prompt}`.slice(0, 1500);
    const hits = await searchMemory(query, { excludeUseCase: uc.id, limit: 6, runId: `turn-${uc.id}-${Date.now()}` });
    if (hits.length) parts.push(`From earlier use cases (Mem0):\n${formatHits(hits)}`);
  } catch (e) {
    console.warn("memory recall failed", e);
  }
  try {
    const lessons = await letta.topLessons();
    if (lessons.length) parts.push(`Top lessons each role has learned (Letta):\n${lessons.map((l) => `${l.role.name} (${l.role.title}):\n${l.lessons}`).join("\n\n")}`);
  } catch (e) {
    console.warn("letta lessons failed", e);
  }
  if (!parts.length) return "";
  return [
    "Memory from the accelerator's earlier use cases. Use what fits this client and say where it came from. It is not this client's requirement: never copy another client's details, and ask when unsure.",
    ...parts,
  ].join("\n\n");
}

/** The Letta role that owns a gate, from its wording. */
export function roleForGate(gate: string, fallback = "pm") {
  const g = gate.toLowerCase();
  if (/prfaq|brief|brd|research|business case/.test(g)) return "analyst";
  if (/architect/.test(g)) return "architect";
  if (/ux|design|screen/.test(g)) return "ux";
  if (/ticket|stor|epic|backlog|breakdown|retro/.test(g)) return "po";
  if (/build|test|code|review/.test(g)) return "dev";
  if (/prd|requirement|plan|pitch|spec/.test(g)) return "pm";
  return roleFor(fallback) ? fallback : "pm";
}

/** Step 5 of the loop: the role saves lessons, then the app refreshes its top lessons block. */
async function reflect(roleKey: string, message: string) {
  try {
    const r = await letta.tellRole(roleKey, message);
    if (r) await promoteLessons(roleKey);
  } catch (e) {
    console.warn(`letta ${roleKey} reflection failed`, e instanceof Error ? e.message : e);
  }
}

/** A sign-off gate passed: remember the decision, update the shared block, let the role learn. */
export function onGatePassed(uc: UseCaseRef & { stage?: string }, gate: string, summary: string, clientSaid: string, agent?: string) {
  const roleKey = agent && roleFor(agent) ? agent : roleForGate(gate);
  rememberDecision(uc, roleKey, `Gate passed: ${gate}\nWhat was approved: ${summary}\nThe client said: ${clientSaid || "approved"}`, "accelerator:gate");
  void (async () => {
    try {
      const rows = await letta.portfolio();
      const prev = rows.find((r) => r.useCaseId === uc.id);
      await letta.updatePortfolio({
        useCaseId: uc.id,
        title: uc.name,
        stage: uc.stage ?? prev?.stage ?? "",
        activeRole: roleFor(roleKey)?.title ?? "",
        gatesPassed: [...(prev?.gatesPassed ?? []), gate].slice(-12),
        lastHandoff: summary,
      });
    } catch (e) {
      console.warn("letta portfolio update failed", e instanceof Error ? e.message : e);
    }
    await reflect(roleKey, gateMessage(uc.name, gate, summary, clientSaid));
  })();
}

/** A Generate finished: remember what was built, let the developer and product owner learn. */
export function onAppGenerated(uc: UseCaseRef & { stage?: string }, built: string, feedbackBuilt: string) {
  rememberBuild(uc, `${built}${feedbackBuilt ? `\nFeedback this build answered: ${feedbackBuilt}` : ""}`);
  void (async () => {
    await reflect("dev", generatedMessage(uc.name, built, feedbackBuilt));
    if (feedbackBuilt) await reflect("po", generatedMessage(uc.name, built, feedbackBuilt));
  })();
}

/**
 * Copies a role's best lessons from Mem0 into its Letta top_lessons block (the original's daily
 * promote job, also run right after the role reflects). Highest confidence first, at most ten.
 */
export async function promoteLessons(roleKey: string): Promise<number> {
  const role = roleFor(roleKey);
  if (!role || !memory.configured) return 0;
  const hits = await memory.recall("lessons for future use cases", {
    scope: { appId: MEM0_APP_ID, agentId: role.memAgentId, userId: MEM0_USER_ID },
    kinds: ["lesson"],
    limit: 30,
    threshold: 0,
  });
  if (memory.lastRecallFailed || !hits.length) return 0;
  const conf = (h: MemoryHit) => Number((h.metadata as Record<string, unknown> | undefined)?.confidence ?? 0.5);
  const seen = new Set<string>();
  const best = [...hits]
    .sort((a, b) => conf(b) - conf(a))
    .filter((h) => {
      const k = h.memory.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .filter((h) => conf(h) >= 0.4)
    .slice(0, 10);
  await letta.setTopLessons(roleKey, best.map((h) => `- ${clip(h.memory.replace(/\s+/g, " ").trim(), 400)}`).join("\n"));
  return best.length;
}

export async function promoteAllLessons() {
  let n = 0;
  for (const r of ROLES) n += await promoteLessons(r.key).catch(() => 0);
  return n;
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Starts the daily lesson promotion and the Letta setup, once per server process. */
export function startMemoryJobs() {
  if (timer || (!memory.configured && !letta.lettaConfigured())) return;
  void letta.ensureLetta();
  timer = setInterval(() => void promoteAllLessons(), 24 * 60 * 60 * 1000);
  setTimeout(() => void promoteAllLessons(), 60_000);
}

export async function memoryStatus() {
  const mem0Up = client ? await client.health() : false;
  const l = await letta.lettaStatus().catch((e) => ({ up: false, agents: [], note: String(e) }));
  return { mem0: { configured: memory.configured, up: mem0Up }, letta: l };
}

export { letta };
