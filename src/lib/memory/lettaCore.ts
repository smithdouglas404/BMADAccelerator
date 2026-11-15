/**
 * BMAD role agents on self-hosted Letta. Pure functions, no network, no key.
 *
 * Copied from Capability-Economics-Guide scripts/src/bmad-letta-core.ts (INN-129) and changed only
 * where the accelerator differs. There, the Letta agents do the BMAD work. Here, BMAD runs unmodified
 * in Claude Code for each client use case, so each Letta agent is that role's working mind ACROSS use
 * cases: persona, its status, its top lessons and the shared portfolio block. Mem0 is the archive.
 *
 * - Gates: a person approves a sign-off in the accelerator. The app (the orchestrator) then records the
 *   decision in Mem0, updates the shared block and sends the role a [GATE PASSED] message, and the role
 *   saves what future use cases should learn with save_lesson.
 * - Recall: before each Claude turn the app reads every role's top_lessons block (no model call) and
 *   searches Mem0, and passes both in <retrieved_context>.
 * - Ask: the Claude agents can ask a Letta role for its experience (ask_role from the app); Letta roles
 *   ask each other with the ask_role tool, as in the original.
 */

export const TAG = "bacc";
export const SHARED_BLOCK_LABEL = "bacc_portfolio";
export const LESSONS_BLOCK_LABEL = "top_lessons";
/** Mem0 scope, the same contract as the original: one app id, one user id, an agent id per role. */
export const MEM0_APP_ID = "bmad-accelerator";
export const MEM0_USER_ID = "bacc";

export type RoleKey = "analyst" | "pm" | "ux" | "architect" | "po" | "dev";

export interface Role {
  key: RoleKey;
  /** BMAD role title */
  title: string;
  /** The BMAD persona's name, as the client sees it in the accelerator */
  name: string;
  /** Letta agent name */
  agentName: string;
  /** Mem0 agent_id */
  memAgentId: string;
  persona: string;
}

export const memAgentId = (key: string) => (key === "concierge" ? "bacc-concierge" : `bmad-${key}`);

const COMMON_RULES = [
  "BMAD runs unmodified in Claude Code for each client use case. You do not do that work. You are the role's long-term working mind across all use cases: you remember what worked, what went wrong and what clients decided, and you give advice from it.",
  "Facts from the Mem0 archive arrive inside <retrieved_context>. Search it with search_memory (a focused query; role and kind narrow it) before answering about earlier use cases, decisions or answers. If you need facts you were not given and the search finds nothing, end your reply with one line per need: NEED_CONTEXT: <search query>. Never invent a requirement or a past decision; quote what you rely on and name the use case it came from.",
  "One client's details are private to that use case. Lessons you save must be general (\"retail pilots: ask about payment provider and currency early\"), never one client's prices, names or plans.",
  "Keep your status block current with your memory tools: CURRENT_USE_CASE, CURRENT_TASK, OPEN_QUESTIONS.",
  "The top_lessons block is written by the app from your saved lessons. Do not edit it; save lessons with save_lesson.",
  "A message starting [GATE PASSED] or [APP GENERATED] reports progress in a use case. Decide whether there is a lesson that would help a future, similar use case. If there is, save it with save_lesson (one lesson per call, with a confidence from 0 to 1). Then reply in two or three sentences. Do not call ask_role for these.",
  "When you need something another role knows, ask it with ask_role (role keys: analyst, pm, ux, architect, po, dev; pass your own key as from_role). A message starting [QUESTION from the ...] is another role or the app asking you: answer it directly from your memory and never call ask_role while answering.",
  "Plain language. Things only the owner decides: spending money or prices, secrets or production access, legal or privacy, deleting customer data, messages to people outside the project.",
].join("\n- ");

function persona(name: string, title: string, job: string): string {
  return `You are the memory of ${name}, the ${title} in the BMAD method, for the BMAD Accelerator.\n${job}\n\nRules:\n- ${COMMON_RULES}`;
}

const role = (key: RoleKey, name: string, title: string, job: string): Role => ({
  key,
  name,
  title,
  agentName: `bacc-${key}`,
  memAgentId: memAgentId(key),
  persona: persona(name, title, job),
});

export const ROLES: Role[] = [
  role("analyst", "Mary", "Business Analyst", "In each use case Mary researches the market and users and writes the brief, BRD or PRFAQ. Remember which questions uncovered the real problem and which assumptions turned out wrong."),
  role("pm", "John", "Product Manager", "In each use case John writes and updates the PRD and other planning documents. Remember which requirements clients changed later, and which scope choices made pilots succeed."),
  role("ux", "Sally", "UX Designer", "In each use case Sally records how the product looks and behaves. Remember which screens and flows clients asked to change after seeing the generated app."),
  role("architect", "Winston", "System Architect", "In each use case Winston owns the architecture and its decisions. Remember which technical choices held up in generated pilots and which had to be reversed."),
  role("po", "Sofia", "Product Owner", "In each use case Sofia writes the requirements and the tickets and keeps the board. Remember how work was best sliced, and what feedback typically came back after a Generate."),
  role("dev", "Amelia", "Developer", "In each use case Amelia builds and verifies the stories. Remember what broke in builds, what tests caught, and what clients corrected on screen."),
];

export function roleFor(key: string): Role | undefined {
  return ROLES.find((x) => x.key === key);
}

export function statusBlock(): string {
  return ["CURRENT_USE_CASE: none", "CURRENT_TASK: Waiting for a use case to report progress or ask.", "OPEN_QUESTIONS: none"].join("\n");
}

export interface PortfolioRow {
  useCaseId: string;
  title: string;
  stage: string;
  activeRole: string;
  gatesPassed: string[];
  lastHandoff: string;
}

/** The shared block: one line per use case, read by every role agent. */
export function renderPortfolio(rows: PortfolioRow[]): string {
  if (!rows.length) return "USE_CASES: none yet";
  return [
    "USE_CASES (one per line: id | title | stage | active role | gates passed | last handoff):",
    ...rows.map(
      (r) =>
        `${r.useCaseId} | ${r.title} | ${r.stage} | ${r.activeRole || "-"} | ${r.gatesPassed.length ? r.gatesPassed.join("; ") : "none"} | ${r.lastHandoff || "none"}`,
    ),
  ].join("\n");
}

export function parsePortfolio(value: string): PortfolioRow[] {
  const out: PortfolioRow[] = [];
  for (const line of value.split("\n").slice(1)) {
    const p = line.split(" | ");
    if (p.length < 6) continue;
    out.push({
      useCaseId: p[0].trim(),
      title: p[1].trim(),
      stage: p[2].trim(),
      activeRole: p[3].trim() === "-" ? "" : p[3].trim(),
      gatesPassed: p[4].trim() === "none" ? [] : p[4].split(/;\s*/).filter(Boolean),
      lastHandoff: p.slice(5).join(" | ").trim() === "none" ? "" : p.slice(5).join(" | ").trim(),
    });
  }
  return out;
}

/** Inserts or replaces one use case's row; the block keeps the 40 most recent. */
export function upsertPortfolio(rows: PortfolioRow[], row: PortfolioRow): PortfolioRow[] {
  const clean = (s: string) => s.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();
  const r = { ...row, title: clean(row.title), lastHandoff: clean(row.lastHandoff).slice(0, 300), gatesPassed: row.gatesPassed.map(clean) };
  return [r, ...rows.filter((x) => x.useCaseId !== row.useCaseId)].slice(0, 40);
}

export function gateMessage(useCaseTitle: string, gate: string, summary: string, clientSaid: string): string {
  return [
    `[GATE PASSED] Use case "${useCaseTitle}"`,
    `Gate: ${gate}`,
    `What was approved: ${summary || "(no summary)"}`,
    `The client said: ${clientSaid || "approved"}`,
    "",
    "Update your status block. Save any lesson a future, similar use case should learn with save_lesson, then reply briefly.",
  ].join("\n");
}

export function generatedMessage(useCaseTitle: string, built: string, feedbackBuilt: string): string {
  return [
    `[APP GENERATED] Use case "${useCaseTitle}"`,
    `What was built: ${built || "(no summary)"}`,
    `Client feedback this build answered: ${feedbackBuilt || "none"}`,
    "",
    "Update your status block. Save any lesson a future, similar use case should learn with save_lesson, then reply briefly.",
  ].join("\n");
}

export function questionMessage(fromTitle: string, question: string): string {
  return `[QUESTION from the ${fromTitle}]\n${question.trim()}\n\nAnswer directly and briefly, from what you remember across use cases. Do not call ask_role while answering this question.`;
}

/**
 * Picks the Letta model handle. `preferred` wins when Letta offers it; otherwise the
 * newest Anthropic Claude handle, Opus before Sonnet before Haiku. (Unchanged from the original.)
 */
export function pickModel(handles: string[], preferred?: string): string | null {
  if (preferred && handles.includes(preferred)) return preferred;
  const claude = handles.filter((h) => /^anthropic\/claude-/.test(h));
  if (!claude.length) return null;
  const tier = (h: string) => (/opus/.test(h) ? 3 : /sonnet/.test(h) ? 2 : /haiku/.test(h) ? 1 : 0);
  const version = (h: string) => {
    const m = h.replace(/-\d{8}$/, "").match(/(\d+)(?:[-.](\d+))?(?!.*\d)/);
    return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
  };
  return [...claude].sort((a, b) => version(b) - version(a) || tier(b) - tier(a) || b.localeCompare(a))[0];
}

/**
 * OpenAI text-embedding-3-small, the same embedder as Mem0 and Doug's other systems. An explicit
 * BACC_LETTA_EMBEDDING wins (like LETTA_EMBEDDING in Capability-Economics-Guide).
 */
export function pickEmbedding(handles: string[], preferred?: string): string | null {
  if (preferred && handles.includes(preferred)) return preferred;
  return (
    handles.find((h) => h === "openai/text-embedding-3-small") ??
    handles.find((h) => h.startsWith("openai/")) ??
    handles.find((h) => !h.startsWith("letta/")) ??
    null
  );
}

export interface LettaMessage {
  message_type?: string;
  content?: unknown;
  tool_call?: { name?: string | null; arguments?: string | null } | null;
  tool_calls?: Array<{ name?: string | null; arguments?: string | null }> | null;
}

/** The text the agent said. (Unchanged from the original.) */
export function assistantText(messages: LettaMessage[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.message_type !== "assistant_message") continue;
    if (typeof m.content === "string") out.push(m.content);
    else if (Array.isArray(m.content)) for (const c of m.content) if (c && typeof c === "object" && "text" in c) out.push(String((c as { text: unknown }).text));
  }
  return out.join("\n").trim();
}

/** Names of the tools the agent called in a response. */
export function toolCalls(messages: LettaMessage[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.message_type !== "tool_call_message") continue;
    for (const c of [...(m.tool_call ? [m.tool_call] : []), ...(Array.isArray(m.tool_calls) ? m.tool_calls : [])]) if (c?.name) out.push(c.name);
  }
  return out;
}

/** Message with Mem0 facts injected ahead of it. (Unchanged from the original.) */
export function withContext(message: string, context: string): string {
  const c = context.trim();
  return c ? `<retrieved_context>\n${c}\n</retrieved_context>\n\n${message}` : message;
}

/** Searches the agent asked for with NEED_CONTEXT lines. (Unchanged from the original.) */
export function contextRequests(text: string): string[] {
  return [...text.matchAll(/^NEED_CONTEXT:\s*(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
}

const ROLE_KEYS = ROLES.map((r) => r.key).join(", ");
const TITLES = `{${ROLES.map((r) => `"${r.key}": "${r.title}"`).join(", ")}}`;

/**
 * Letta tool: search the self-hosted Mem0 archive. Standard library only. MEM0_API_KEY and
 * MEM0_BASE_URL reach it as agent secrets. The self-hosted server wants flat filters and X-API-Key.
 */
export const SEARCH_TOOL_SOURCE = `def search_memory(query: str, role: str = "", kind: str = "", top_k: int = 6) -> str:
    """Search the accelerator's Mem0 archive: decisions, answered questions, lessons and requirement changes from every use case.

    Args:
        query (str): What you need to know, in plain words (for example "how did retail pilots handle payments").
        role (str): Optional role filter: ${ROLE_KEYS}. Empty searches every role.
        kind (str): Optional memory kind: decision, qa, lesson, requirement or run_summary.
        top_k (int): How many results to return, 1 to 10.

    Returns:
        str: The matching memories, best first, each with its kind, role and use case.
    """
    import json
    import os
    import urllib.request

    key = os.environ.get("MEM0_API_KEY", "")
    if not key:
        return "Mem0 is not configured for this agent (MEM0_API_KEY secret missing). Say so and continue without it."
    filters = {"user_id": "${MEM0_USER_ID}", "app_id": "${MEM0_APP_ID}"}
    if role:
        filters["agent_id"] = "bmad-" + role.strip().lower()
    if kind:
        filters["kind"] = kind.strip().lower()
    body = json.dumps({"query": query, "filters": filters, "top_k": max(1, min(int(top_k), 10))}).encode()
    req = urllib.request.Request(
        os.environ.get("MEM0_BASE_URL", "http://mem0:8000").rstrip("/") + "/search",
        data=body,
        headers={"X-API-Key": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
    except Exception as e:
        return "Mem0 search failed: " + str(e)[:200]
    rows = data if isinstance(data, list) else data.get("results", [])
    if not rows:
        return "No matching memories."
    out = []
    for m in rows:
        md = m.get("metadata") or {}
        label = " | ".join(x for x in [md.get("kind", ""), md.get("agent_role", ""), md.get("use_case_title", "")] if x)
        out.append("- [" + label + "] " + (m.get("memory") or "")[:1500])
    return "\\n".join(out)
`;

/** Letta tool: save one general lesson to Mem0 under this role (kind "lesson"). */
export const LESSON_TOOL_SOURCE = `def save_lesson(role: str, lesson: str, confidence: float = 0.7) -> str:
    """Save one general lesson that would help a future, similar use case.

    Write it so it makes sense without the use case: no client names, prices or private details.

    Args:
        role (str): Your own role key: ${ROLE_KEYS}.
        lesson (str): One lesson in one or two sentences.
        confidence (float): How sure you are it generalizes, 0 to 1.

    Returns:
        str: Whether the lesson was saved.
    """
    import json
    import os
    import urllib.request

    key = os.environ.get("MEM0_API_KEY", "")
    if not key:
        return "Mem0 is not configured for this agent (MEM0_API_KEY secret missing). The lesson was not saved."
    role = role.strip().lower()
    if role not in ${TITLES}:
        return "Unknown role. Use one of: ${ROLE_KEYS}."
    if not lesson.strip():
        return "The lesson is empty."
    c = max(0.0, min(float(confidence), 1.0))
    body = json.dumps({
        "messages": [{"role": "user", "content": lesson.strip()}],
        "user_id": "${MEM0_USER_ID}",
        "agent_id": "bmad-" + role,
        "infer": True,
        "metadata": {"app_id": "${MEM0_APP_ID}", "kind": "lesson", "agent_role": role, "source": "letta:save_lesson", "confidence": c},
    }).encode()
    req = urllib.request.Request(
        os.environ.get("MEM0_BASE_URL", "http://mem0:8000").rstrip("/") + "/memories",
        data=body,
        headers={"X-API-Key": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            json.loads(r.read().decode())
    except Exception:
        # Fact extraction needs Mem0's model; if that failed, keep the lesson verbatim rather than lose it.
        payload = json.loads(body.decode())
        payload["infer"] = False
        payload["metadata"]["infer_failed"] = True
        req = urllib.request.Request(req.full_url, data=json.dumps(payload).encode(), headers=req.headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                json.loads(r.read().decode())
        except Exception as e:
            return "Saving the lesson failed: " + str(e)[:200]
    return "Lesson saved."
`;

/**
 * Letta tool: one role asks another and waits for the answer (unchanged from the original except the
 * tag, the role list and the server password, which reaches the tool as the LETTA_SERVER_PASSWORD secret).
 */
export const ASK_TOOL_SOURCE = `def ask_role(role: str, question: str, from_role: str) -> str:
    """Ask another BMAD role agent a question and wait for its answer.

    Use this when you need something another role remembers. Do not use it to answer a
    question another role asked you.

    Args:
        role (str): The role to ask: ${ROLE_KEYS}.
        question (str): The question, with enough context for that role to answer on its own.
        from_role (str): Your own role: ${ROLE_KEYS}.

    Returns:
        str: The other role's answer.
    """
    import json
    import os
    import urllib.request

    titles = ${TITLES}
    role = role.strip().lower()
    from_role = from_role.strip().lower()
    if role not in titles:
        return "Unknown role. Use one of: ${ROLE_KEYS}."
    if role == from_role:
        return "You cannot ask yourself. Answer from your own memory."
    base = os.environ.get("LETTA_INTERNAL_URL", "http://localhost:8283").rstrip("/")
    pw = os.environ.get("LETTA_SERVER_PASSWORD", "")
    auth = {"Authorization": "Bearer " + pw} if pw else {}
    try:
        req = urllib.request.Request(base + "/v1/agents/?tags=${TAG}-role:" + role + "&limit=5", headers=auth)
        with urllib.request.urlopen(req, timeout=30) as r:
            agents = json.loads(r.read().decode())
    except Exception as e:
        return "Could not reach the other role: " + str(e)[:200]
    if isinstance(agents, dict):
        agents = agents.get("items") or agents.get("agents") or []
    if not agents:
        return "No agent found for the " + titles[role] + "."
    text = ("[QUESTION from the " + titles.get(from_role, from_role) + "]\\n" + question.strip() +
            "\\n\\nAnswer directly and briefly. Do not call ask_role while answering this question.")
    body = json.dumps({"messages": [{"role": "user", "content": text}], "stream_tokens": False}).encode()
    req = urllib.request.Request(base + "/v1/agents/" + agents[0]["id"] + "/messages/stream", data=body,
                                 headers={"Content-Type": "application/json", **auth}, method="POST")
    out = []
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            for line in r.read().decode().split("\\n"):
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                m = json.loads(line[6:])
                if m.get("message_type") == "error_message":
                    return "The " + titles[role] + " could not answer: " + str(m.get("message", ""))[:200]
                if m.get("message_type") == "assistant_message":
                    c = m.get("content")
                    if isinstance(c, str):
                        out.append(c)
                    elif isinstance(c, list):
                        out.extend(str(x.get("text", "")) for x in c if isinstance(x, dict))
    except Exception as e:
        return "The " + titles[role] + " did not answer: " + str(e)[:200]
    answer = "\\n".join(out).strip()
    return ("Answer from the " + titles[role] + ":\\n" + answer) if answer else "The " + titles[role] + " gave no answer."
`;

export function toolSources(): string[] {
  return [SEARCH_TOOL_SOURCE, LESSON_TOOL_SOURCE, ASK_TOOL_SOURCE];
}
