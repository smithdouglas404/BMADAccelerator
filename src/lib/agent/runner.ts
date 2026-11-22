import { STUDIO_TEAM } from "./team";
import { coreInstructions, CORE_SKILLS } from "./instructions";
import path from "path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { currentItems, currentTurnId, setTurnCauses, setTurnId } from "@/lib/studio/truthlog";
import { provisionWorkspace, shadcnLookupDir, syncStudioSkills, writeIntake, STUDIO_SKILLS_DIR } from "@/lib/provision";
import { agentModel } from "@/lib/docAgent";
import { mcpServersFor, mcpSummary } from "@/lib/studio/mcp";
import { ensureRoutes } from "@/lib/studio/state";
import { LimitError, authEnv, authOrder, claudeConfigured, limitMessage, type Auth } from "@/lib/agent/auth";
import { studioTools, type RunTally } from "./tools";
import { fakeAgentTurn } from "./fake";
import { recallForTurn, searchMemory, startMemoryJobs } from "@/lib/memory";
import { resumeBrief } from "@/lib/studio/resume";
import { withContext } from "@/lib/memory/lettaCore";
import { noteGateTurn } from "@/lib/jev";
import { recordUsage } from "@/lib/agent/usage";

// One Socra turn at a time per product. Queued events (messages, captures, pulled-forward
// recommendations, annotations, build notes) are combined into the next turn, in order.
const running = new Set<string>();

// `cause` is the Product Truth Graph node the turn answers (msg:…, ann:…, evidence:…), so every change the
// Socra makes in that turn records why.
/** Studio updates (a build finished, research came back) are marked as such, so Socra never answers them as if a person spoke. */
export function framed(e: { kind: string; prompt: string }) {
  if (e.kind === "user") return e.prompt;
  return `[Studio update, not a message from anyone on the product. Don't mention it as an update or event, and don't tell them nothing arrived: say only what it means for the product, or say nothing if it changes nothing they need to know.]\n\n${e.prompt}`;
}

export async function enqueue(useCaseId: string, kind: string, prompt: string, cause = "") {
  await prisma.agentEvent.create({ data: { useCaseId, kind, prompt, cause } });
  void kick(useCaseId);
}

// Picks up work left in the queue, for example after the server restarted.
export async function resume(useCaseId: string) {
  if (running.has(useCaseId) || !agentsEnabled()) return;
  const waiting = await prisma.agentEvent.count({ where: { useCaseId, status: { in: ["queued", "running"] } } });
  if (waiting) void kick(useCaseId);
}

/**
 * When the Studio starts, take up every use case's unfinished turns (a restart, a rebuild or an outage cut
 * them off), so an item that came in never waits for someone to open its product before Socra asks about it.
 * Work older than three days is left alone. One product at a time, so a restart doesn't start ten turns at once.
 */
/** When this Studio process started: turns marked running from before it were cut off. */
const BOOT = new Date();

export async function resumeAll() {
  if (!agentsEnabled()) return;
  // Nothing runs before this: every turn still marked running was cut off by the restart, in any use case.
  await prisma.agentTurn
    .updateMany({ where: { status: "running", startedAt: { lt: BOOT } }, data: { status: "failed", error: "Cut off by a restart of the Studio; taken up again", endedAt: new Date() } })
    .catch(() => undefined);
  const since = new Date(Date.now() - 3 * 86_400_000);
  const rows = await prisma.agentEvent.findMany({ where: { status: { in: ["queued", "running"] }, createdAt: { gt: since } }, select: { useCaseId: true }, distinct: ["useCaseId"] });
  for (const r of rows) await kick(r.useCaseId).catch((e) => console.error("resume turns", r.useCaseId, e));
}

export function agentsEnabled() {
  return claudeConfigured() || process.env.BACC_FAKE_AGENT === "1";
}

export async function kick(useCaseId: string) {
  if (running.has(useCaseId)) return;
  startMemoryJobs();
  running.add(useCaseId);
  try {
    // Events left "running" by a restart go back in the queue, and the turn they were in is recorded as cut off.
    await prisma.agentEvent.updateMany({ where: { useCaseId, status: "running" }, data: { status: "queued" } });
    await prisma.agentTurn
      .updateMany({ where: { useCaseId, status: "running" }, data: { status: "failed", error: "Cut off by a restart of the Studio; taken up again", endedAt: new Date() } })
      .catch(() => undefined);
    // A turn that failed in the last hour is tried again, up to three times in all.
    await prisma.agentEvent.updateMany({
      where: { useCaseId, status: "failed", attempts: { lt: 3 }, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      data: { status: "queued" },
    });
    for (;;) {
      const events = await prisma.agentEvent.findMany({
        where: { useCaseId, status: "queued" },
        orderBy: { createdAt: "asc" },
      });
      if (!events.length) break;
      const ids = events.map((e) => e.id);
      await prisma.agentEvent.updateMany({ where: { id: { in: ids } }, data: { status: "running", attempts: { increment: 1 } } });
      await prisma.useCase.update({
        where: { id: useCaseId },
        data: { agentBusy: true, agentStatus: "Thinking", agentError: "" },
      });
      let ok = true;
      // An event's cause may name several nodes ("msg:… backlog:…"): the message and the item it filed.
      const causes = [...new Set(events.flatMap((e) => e.cause.split(/\s+/)).filter(Boolean))];
      setTurnCauses(useCaseId, causes);
      // The turn as it really runs: what caused it, the core skills loaded, and what it used (Traceability).
      const turn = await prisma.agentTurn.create({ data: { useCaseId, causes, loaded: [...CORE_SKILLS] } }).catch(() => null);
      const used = { skills: new Set<string>(), agents: new Set<string>(), tools: new Set<string>() };
      if (turn) setTurnId(useCaseId, turn.id);
      let failure = "";
      try {
        await runTurn(useCaseId, events.map(framed).join("\n\n---\n\n"), (name, input) => noteTool(used, name, input));
      } catch (e) {
        ok = false;
        failure = e instanceof Error ? e.message.slice(0, 500) : String(e);
        console.error("agent turn failed", e);
        await prisma.useCase.update({
          where: { id: useCaseId },
          data: { agentError: e instanceof Error ? e.message.slice(0, 500) : String(e) },
        });
      }
      setTurnCauses(useCaseId, []);
      setTurnId(useCaseId, "");
      if (turn)
        await prisma.agentTurn
          .update({ where: { id: turn.id }, data: { status: ok ? "done" : "failed", error: failure, skills: [...used.skills], agents: [...used.agents], tools: [...used.tools], endedAt: new Date() } })
          .catch(() => undefined);
      if (ok) await noteGateTurn(causes, [...used.tools], [...used.agents]).catch(() => undefined);
      await prisma.agentEvent.updateMany({ where: { id: { in: ids } }, data: { status: ok ? "done" : "failed" } });
    }
  } finally {
    running.delete(useCaseId);
    await prisma.useCase.update({ where: { id: useCaseId }, data: { agentBusy: false, agentStatus: "" } }).catch(() => {});
  }
}

/** What a turn used, from its tool calls: a Skill names a skill, an Agent/Task names a specialist, mcp__studio__x is a Studio tool. */
export function noteTool(used: { skills: Set<string>; agents: Set<string>; tools: Set<string> }, name: string, input: Record<string, unknown>) {
  if (name === "Skill") {
    const skill = String(input.skill ?? input.command ?? "").trim();
    if (skill) used.skills.add(skill);
  } else if (name === "Agent" || name === "Task") {
    const agent = String(input.subagent_type ?? "").trim();
    if (agent) used.agents.add(agent);
  } else if (name.startsWith("mcp__studio__")) used.tools.add(name.slice("mcp__studio__".length));
  else if (name === "Read" && /\.claude\/skills\/([^/]+)\/SKILL\.md$/.test(String(input.file_path ?? ""))) {
    // A specialist reading a skill file (for example studio-reimagine) counts as using that skill.
    used.skills.add(String(input.file_path).match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/)![1]);
  }
}

export async function museInstructions() {
  return coreInstructions(STUDIO_SKILLS_DIR);
}

function statusFor(block: { type: string; name?: string; input?: unknown }) {
  if (block.type !== "tool_use") return "";
  const input = (block.input ?? {}) as Record<string, string>;
  switch (block.name) {
    case "Skill":
      return `Using the ${input.skill ?? input.command ?? ""} skill`;
    case "Task":
    case "Agent":
      return `Sending out ${input.subagent_type ?? "a helper"}`;
    case "Read":
    case "Glob":
    case "Grep":
      return "Reading the documents";
    case "Write":
    case "Edit":
      return `Writing ${path.basename(input.file_path ?? "a document")}`;
    case "Bash":
      return "Running a command";
    case "WebSearch":
    case "WebFetch":
      return "Researching";
    default:
      return "";
  }
}

type TurnOpts = Parameters<typeof runSdkTurnOnce>[0];

// Runs a turn, resuming the use case's Claude session. If that session can't be
// resumed (for example its history was lost when the container was rebuilt), the
// turn starts a fresh session instead: the Studio's database holds the real state.
async function runSdkTurnResuming(opts: TurnOpts) {
  try {
    return await runSdkTurnOnce(opts);
  } catch (e) {
    if (e instanceof LimitError || !opts.resume || opts.tally.spoke > 0) throw e;
    console.error("resume failed, starting a fresh session", e);
    return runSdkTurnOnce({ ...opts, resume: "", prompt: opts.freshPrompt ?? opts.prompt });
  }
}

// Signs in with the owner's plan first when one is set up. When the plan's usage limit stops the
// turn, the same session carries on with the API key (unless BACC_CLAUDE_AUTH says plan only).
export async function runSdkTurn(opts: TurnOpts) {
  const order = authOrder();
  for (let i = 0; ; i++) {
    const auth = order[i] ?? "key";
    try {
      if (i === 0) return await runSdkTurnResuming({ ...opts, auth });
      // A session started under another sign-in may not resume; the Studio holds the state anyway.
      return await runSdkTurnOnce({ ...opts, auth }).catch((err) =>
        err instanceof LimitError ? Promise.reject(err) : runSdkTurnOnce({ ...opts, auth, resume: "", prompt: opts.freshPrompt ?? opts.prompt }),
      );
    } catch (e) {
      if (!(e instanceof LimitError) || i + 1 >= order.length) throw e;
      console.warn(`claude ${auth} limit reached, continuing with ${order[i + 1]}`);
      await opts.onStatus("Plan limit reached, continuing with the API key");
      if (e.sessionId) {
        opts = { ...opts, resume: e.sessionId };
        await opts.onSession(e.sessionId);
      }
    }
  }
}

async function runSdkTurnOnce(opts: {
  useCaseId: string;
  slug: string;
  prompt: string;
  resume: string;
  appendSystem: string;
  onSession: (id: string) => Promise<void>;
  onStatus: (s: string) => Promise<void>;
  onTool?: (name: string, input: Record<string, unknown>) => void;
  /** The prompt to use if the session can't be resumed: it carries the conversation (resume.ts). */
  freshPrompt?: string;
  tally: RunTally;
  maxTurns?: number;
  auth?: Auth;
  model?: string;
  effort?: "low" | "medium" | "high";
  speaker?: string;
  /** What the run is, for the usage record: a conversation turn (default) or a build. */
  kind?: "turn" | "build";
  /** Stop the run when nothing has happened for this long (a command stuck waiting for input). */
  idleMs?: number;
}) {
  const auth = opts.auth ?? authOrder()[0] ?? "key";
  const ws = workspacePath(opts.slug);
  const texts: string[] = [];
  // The official shadcn MCP server (pinned in the image): component, block and chart look-ups.
  const shadcnDir = process.env.BACC_SHADCN_MCP === "0" ? "" : await shadcnLookupDir(opts.slug).catch(() => "");
  await syncStudioSkills(opts.useCaseId, opts.slug).catch((e) => console.error("skill sync", e));
  const connectors = await mcpServersFor(opts.useCaseId).catch(() => ({}));
  const abort = new AbortController();
  const q = query({
    prompt: opts.prompt,
    options: {
      abortController: abort,
      cwd: ws,
      model: opts.model || agentModel(),
      ...(opts.effort ? { effort: opts.effort } : {}),
      settingSources: ["project"],
      systemPrompt: { type: "preset", preset: "claude_code", append: opts.appendSystem },
      mcpServers: {
        ...connectors,
        studio: studioTools(opts.useCaseId, opts.slug, opts.tally, { speaker: opts.speaker }),
        ...(shadcnDir ? { shadcn: { type: "stdio" as const, command: process.env.SHADCN_BIN || "shadcn", args: ["mcp", "--cwd", shadcnDir] } } : {}),
      },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      disallowedTools: ["AskUserQuestion"],
      // Socra's team: validator, UX / component mapper, product engineer and the research team.
      agents: STUDIO_TEAM,
      resume: opts.resume || undefined,
      maxTurns: opts.maxTurns ?? 200,
      // No shell command may run for ever: 3 minutes unless it asks for more, never more than 7.
      env: { ...authEnv(auth), BASH_DEFAULT_TIMEOUT_MS: "180000", BASH_MAX_TIMEOUT_MS: "420000" },
      stderr: (d) => console.error("[claude]", d.trimEnd()),
    },
  });
  let sessionId = "";
  let lastStatus = "";
  const limited = (resetsAt?: number) => {
    q.interrupt().catch(() => undefined);
    return new LimitError(limitMessage(auth, resetsAt), sessionId, resetsAt);
  };
  let lastActivity = Date.now();
  let stalled = false;
  const watchdog = opts.idleMs
    ? setInterval(() => {
        if (Date.now() - lastActivity < opts.idleMs!) return;
        stalled = true;
        console.warn(`[claude] no activity for ${Math.round(opts.idleMs! / 60000)} min, stopping the run`);
        q.interrupt().catch(() => undefined);
        setTimeout(() => abort.abort(), 30_000).unref?.();
      }, 15_000)
    : null;
  try {
  for await (const m of q as AsyncIterable<SDKMessage>) {
    lastActivity = Date.now();
    if (stalled) break;
    if (m.type === "rate_limit_event" && m.rate_limit_info.status === "rejected") throw limited(m.rate_limit_info.resetsAt);
    if (m.type === "assistant" && (m.error === "rate_limit" || m.error === "billing_error")) throw limited();
    if ("session_id" in m && m.session_id && m.session_id !== sessionId) {
      sessionId = m.session_id;
      await opts.onSession(sessionId);
    }
    if (m.type === "assistant") {
      for (const block of m.message.content) {
        if (block.type === "text" && block.text.trim()) texts.push(block.text.trim());
        if (block.type === "tool_use") opts.onTool?.(block.name, (block.input ?? {}) as Record<string, unknown>);
        const s = statusFor(block as { type: string; name?: string; input?: unknown });
        if (s && s !== lastStatus) {
          lastStatus = s;
          await opts.onStatus(s);
        }
      }
    }
    if (m.type === "result") {
      await recordUsage({ useCaseId: opts.useCaseId, turnId: opts.kind === "build" ? "" : currentTurnId(opts.useCaseId), sessionId, agent: opts.kind === "build" ? "Claude Code" : "Socra", kind: opts.kind ?? "turn", auth, resumed: Boolean(opts.resume), result: m });
    }
    if (m.type === "result" && m.subtype !== "success" && !stalled) {
      throw new Error(`Agent stopped: ${m.subtype}`);
    }
  }
  } catch (e) {
    if (!stalled) throw e;
  } finally {
    if (watchdog) clearInterval(watchdog);
  }
  return { texts, sessionId, stalled };
}

async function runTurn(useCaseId: string, prompt: string, onTool?: (name: string, input: Record<string, unknown>) => void) {
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  if (!uc.provisioned) {
    await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Setting up the workspace" } });
    await provisionWorkspace(useCaseId);
  } else {
    await writeIntake(useCaseId);
  }
  await ensureRoutes(useCaseId);
  const fresh = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const tally: RunTally = { spoke: 0 };

  // Recall once per turn: what earlier products taught (Mem0) and each role's top lessons (Letta).
  await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Remembering earlier products" } });
  const recalled = await recallForTurn(fresh, prompt).catch(() => "");
  // Coming back after a long gap, or without a session: the record of the conversation leads the turn.
  const resume = await resumeInput(fresh, prompt).catch(() => null);
  const briefNow = resume ? resumeBrief({ ...resume, sessionLost: !fresh.claudeSessionId }) : "";
  const briefLost = resume ? resumeBrief({ ...resume, sessionLost: true }) : "";
  const base = prompt;
  prompt = withContext(briefNow ? `${briefNow}\n\n---\n\n${base}` : base, recalled);
  const freshPrompt = withContext(briefLost ? `${briefLost}\n\n---\n\n${base}` : base, recalled);
  await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Thinking" } });

  if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
    await fakeAgentTurn(fresh, prompt, tally, onTool);
  } else {
    const connectorNote = await mcpSummary(useCaseId).catch(() => "");
    const { texts, stalled } = await runSdkTurn({
      useCaseId,
      slug: fresh.slug,
      prompt,
      resume: fresh.claudeSessionId,
      freshPrompt,
      appendSystem: `${await museInstructions()}${connectorNote ? `\n\n${connectorNote}` : ""}`,
      tally,
      onTool,
      // A turn that goes silent this long is stopped and tried again, so no item waits on it forever.
      idleMs: 8 * 60_000,
      onSession: async (id) => {
        if (id !== fresh.claudeSessionId) {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { claudeSessionId: id } });
        }
      },
      onStatus: async (s) => {
        await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: s } });
      },
    });
    // A stopped turn counts as failed, so the queue tries it again (up to three times within the hour).
    if (stalled && !tally.spoke) throw new Error("Socra's turn went quiet for 8 minutes and was stopped; trying again");
    // Safety net: if Socra wrote to the owner without using `say`, show its last words.
    if (!tally.spoke && texts.length) {
      const items = currentItems(useCaseId);
      const one = items.filter((n) => n.startsWith("backlog:")).length <= 1 && items.filter((n) => n.startsWith("move:")).length <= 1;
      await prisma.message.create({ data: { useCaseId, role: "muse", agent: "Socra · Product physician", content: texts[texts.length - 1], about: one ? items : [], turnId: currentTurnId(useCaseId) } });
    }
  }
}

// Socra's first turn for a product: it opens the studio.
export const START_PROMPT = `[opening] The owner just described a new product. Their own words, documents and choices are in studio/intake.md; their uploads, with text versions, are in studio/uploads/.

Open the studio now, as your skill's "The opening" section says: name the category, write the product in one breath, the capability floor (four to eight capabilities, at least 30 items, everything the leading products of this kind have), the first PRFAQ, the evidence and validation you already have, and five to eight recommendations; start the first build; send your whole team out in parallel; then greet the owner in one short message with the single most important question and your suggested answer. Speed matters: the owner should see their product's shape within a minute and a working first version within minutes.`;

/** What the "where we left off" brief needs, read from the Studio's record of this product. */
async function resumeInput(uc: { id: string; name: string; customer: string; businessArea: string; description: string }, prompt: string) {
  const [messages, open, approved, held, last] = await Promise.all([
    prisma.message.findMany({ where: { useCaseId: uc.id, role: { in: ["user", "muse", "agent"] } }, orderBy: { createdAt: "asc" }, select: { role: true, agent: true, author: true, content: true, createdAt: true } }),
    prisma.decision.findMany({ where: { useCaseId: uc.id, status: "open" }, orderBy: { createdAt: "asc" }, select: { text: true, createdAt: true } }),
    prisma.decision.findMany({ where: { useCaseId: uc.id, status: "approved" }, orderBy: { createdAt: "asc" }, select: { text: true } }),
    prisma.backlogItem.findMany({ where: { useCaseId: uc.id, kind: "capture", state: "held" }, orderBy: { createdAt: "asc" }, select: { title: true } }),
    prisma.useCase.findUnique({ where: { id: uc.id }, select: { generateCount: true, lastGeneratedAt: true } }),
  ]);
  const remembered = (await searchMemory(`${uc.name}. ${prompt}`.slice(0, 1500), { onlyUseCase: uc.id, limit: 6 }).catch(() => [])).map((h) => h.memory);
  return {
    now: new Date(),
    name: uc.name,
    customer: uc.customer,
    businessArea: uc.businessArea,
    messages,
    openDecisions: open,
    approved,
    held,
    lastBuild: last?.generateCount ? { version: last.generateCount, at: last.lastGeneratedAt } : null,
    remembered,
  };
}
