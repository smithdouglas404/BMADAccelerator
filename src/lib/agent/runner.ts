import { promises as fs } from "fs";
import path from "path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { provisionWorkspace, shadcnLookupDir, syncAcceleratorSkills, writeIntake } from "@/lib/provision";
import { syncBoard } from "@/lib/bmadTickets";
import { agentModel } from "@/lib/docAgent";
import { LimitError, authEnv, authOrder, claudeConfigured, limitMessage, type Auth } from "@/lib/agent/auth";
import { baccTools, type RunTally } from "./tools";
import { fakeAgentTurn } from "./fake";
import { recallForTurn, startMemoryJobs } from "@/lib/memory";
import { withContext } from "@/lib/memory/lettaCore";

// One agent turn at a time per use case. Queued events (messages, card moves,
// feedback, Generate notes) are combined into the next turn, in order.
const running = new Set<string>();

export async function enqueue(useCaseId: string, kind: string, prompt: string) {
  await prisma.agentEvent.create({ data: { useCaseId, kind, prompt } });
  void kick(useCaseId);
}

// Picks up work left in the queue, for example after the server restarted.
export async function resume(useCaseId: string) {
  if (running.has(useCaseId) || !agentsEnabled()) return;
  const waiting = await prisma.agentEvent.count({ where: { useCaseId, status: { in: ["queued", "running"] } } });
  if (waiting) void kick(useCaseId);
}

export function agentsEnabled() {
  return claudeConfigured() || process.env.BACC_FAKE_AGENT === "1";
}

export async function kick(useCaseId: string) {
  if (running.has(useCaseId)) return;
  startMemoryJobs();
  running.add(useCaseId);
  try {
    // Events left "running" by a restart go back in the queue.
    await prisma.agentEvent.updateMany({ where: { useCaseId, status: "running" }, data: { status: "queued" } });
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
      try {
        await runTurn(useCaseId, events.map((e) => e.prompt).join("\n\n---\n\n"));
      } catch (e) {
        ok = false;
        console.error("agent turn failed", e);
        await prisma.useCase.update({
          where: { id: useCaseId },
          data: { agentError: e instanceof Error ? e.message.slice(0, 500) : String(e) },
        });
      }
      await prisma.agentEvent.updateMany({ where: { id: { in: ids } }, data: { status: ok ? "done" : "failed" } });
    }
  } finally {
    running.delete(useCaseId);
    await prisma.useCase.update({ where: { id: useCaseId }, data: { agentBusy: false, agentStatus: "" } }).catch(() => {});
  }
}

export async function conciergeInstructions() {
  const file = path.join(process.cwd(), "bmad-module/bacc-agent-concierge/SKILL.md");
  const md = await fs.readFile(file, "utf8");
  return md.replace(/^---[\s\S]*?---\s*/, "");
}

function statusFor(block: { type: string; name?: string; input?: unknown }) {
  if (block.type !== "tool_use") return "";
  const input = (block.input ?? {}) as Record<string, string>;
  switch (block.name) {
    case "Skill":
      return `Running ${input.skill ?? input.command ?? "a BMAD skill"}`;
    case "Read":
    case "Glob":
    case "Grep":
      return "Reading the documents";
    case "Write":
    case "Edit":
      return `Writing ${path.basename(input.file_path ?? "a document")}`;
    case "Bash":
      return "Running BMAD's scripts";
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
// turn starts a fresh session instead: BMAD's files hold the real state.
async function runSdkTurnResuming(opts: TurnOpts) {
  try {
    return await runSdkTurnOnce(opts);
  } catch (e) {
    if (e instanceof LimitError || !opts.resume || opts.tally.spoke > 0) throw e;
    console.error("resume failed, starting a fresh session", e);
    return runSdkTurnOnce({ ...opts, resume: "" });
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
      // A session started under another sign-in may not resume; BMAD's files hold the state anyway.
      return await runSdkTurnOnce({ ...opts, auth }).catch((err) =>
        err instanceof LimitError ? Promise.reject(err) : runSdkTurnOnce({ ...opts, auth, resume: "" }),
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
  tally: RunTally;
  maxTurns?: number;
  auth?: Auth;
  model?: string;
  effort?: "low" | "medium" | "high";
}) {
  const auth = opts.auth ?? authOrder()[0] ?? "key";
  const ws = workspacePath(opts.slug);
  const texts: string[] = [];
  // The official shadcn MCP server (pinned in the image): component, block and chart look-ups.
  const shadcnDir = process.env.BACC_SHADCN_MCP === "0" ? "" : await shadcnLookupDir(opts.slug).catch(() => "");
  await syncAcceleratorSkills(opts.slug).catch((e) => console.error("skill sync", e));
  const q = query({
    prompt: opts.prompt,
    options: {
      cwd: ws,
      model: opts.model || agentModel(),
      ...(opts.effort ? { effort: opts.effort } : {}),
      settingSources: ["project"],
      systemPrompt: { type: "preset", preset: "claude_code", append: opts.appendSystem },
      mcpServers: {
        bacc: baccTools(opts.useCaseId, opts.slug, opts.tally),
        ...(shadcnDir ? { shadcn: { type: "stdio" as const, command: process.env.SHADCN_BIN || "shadcn", args: ["mcp", "--cwd", shadcnDir] } } : {}),
      },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      disallowedTools: ["AskUserQuestion"],
      resume: opts.resume || undefined,
      maxTurns: opts.maxTurns ?? 200,
      env: authEnv(auth),
      stderr: (d) => console.error("[claude]", d.trimEnd()),
    },
  });
  let sessionId = "";
  let lastStatus = "";
  const limited = (resetsAt?: number) => {
    q.interrupt().catch(() => undefined);
    return new LimitError(limitMessage(auth, resetsAt), sessionId, resetsAt);
  };
  for await (const m of q as AsyncIterable<SDKMessage>) {
    if (m.type === "rate_limit_event" && m.rate_limit_info.status === "rejected") throw limited(m.rate_limit_info.resetsAt);
    if (m.type === "assistant" && (m.error === "rate_limit" || m.error === "billing_error")) throw limited();
    if ("session_id" in m && m.session_id && m.session_id !== sessionId) {
      sessionId = m.session_id;
      await opts.onSession(sessionId);
    }
    if (m.type === "assistant") {
      for (const block of m.message.content) {
        if (block.type === "text" && block.text.trim()) texts.push(block.text.trim());
        const s = statusFor(block as { type: string; name?: string; input?: unknown });
        if (s && s !== lastStatus) {
          lastStatus = s;
          await opts.onStatus(s);
        }
      }
    }
    if (m.type === "result" && m.subtype !== "success") {
      throw new Error(`Agent stopped: ${m.subtype}`);
    }
  }
  return { texts, sessionId };
}

const ASK_NUDGE = "[follow-up: the question]";

// A turn that ends by announcing a question, without asking it, would leave the client waiting on
// nothing. A last message that is itself a question becomes the open question; one that only
// promises a question gets one follow-up turn to ask it.
async function settleAnnouncedQuestion(useCaseId: string, since: Date, prompt: string) {
  if (await prisma.question.count({ where: { useCaseId, status: { in: ["open", "waiting"] } } })) return;
  const last = await prisma.message.findFirst({
    where: { useCaseId, createdAt: { gte: since }, role: { in: ["concierge", "bmad-agent"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return;
  const text = last.content.trim();
  if (text.endsWith("?")) {
    const sentence = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean).pop() ?? text;
    await prisma.question.create({
      data: { useCaseId, agent: last.agent || "concierge", question: sentence.slice(0, 500), explanation: "", status: "open" },
    });
    await prisma.useCase.update({ where: { id: useCaseId }, data: { pendingQuestion: sentence.slice(0, 500) } });
    return;
  }
  const promises = /\b(one|a|next|few|quick|some)\s+(more\s+)?questions?\b|\b(I|I'll|I will|let me|she'll|he'll|they'll|we'll)\s+(need to\s+)?ask\b/i.test(text);
  if (promises && !prompt.includes(ASK_NUDGE)) {
    await enqueue(
      useCaseId,
      "followup",
      `${ASK_NUDGE} Your last message said a question was coming, but it was never asked, so the client is waiting. Ask it now with mcp__bacc__ask (one question), then end your turn.`,
    );
  }
}

async function runTurn(useCaseId: string, prompt: string) {
  const turnStart = new Date();
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  if (!uc.provisioned) {
    await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Installing BMAD" } });
    await provisionWorkspace(useCaseId);
  } else {
    await writeIntake(useCaseId);
  }
  const fresh = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const tally: RunTally = { spoke: 0 };

  // Recall once per turn: what earlier use cases taught (Mem0) and each role's top lessons (Letta).
  await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Remembering earlier use cases" } });
  const recalled = await recallForTurn(fresh, prompt).catch(() => "");
  prompt = withContext(prompt, recalled);
  await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Thinking" } });

  if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
    await fakeAgentTurn(fresh, prompt, tally);
  } else {
    const { texts } = await runSdkTurn({
      useCaseId,
      slug: fresh.slug,
      prompt,
      resume: fresh.claudeSessionId,
      appendSystem: await conciergeInstructions(),
      tally,
      onSession: async (id) => {
        if (id !== fresh.claudeSessionId) {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { claudeSessionId: id } });
        }
      },
      onStatus: async (s) => {
        await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: s } });
      },
    });
    // Safety net: if the agent wrote to the person without using `say`, show its last words.
    if (!tally.spoke && texts.length) {
      await prisma.message.create({ data: { useCaseId, role: "concierge", content: texts[texts.length - 1] } });
    }
  }
  await settleAnnouncedQuestion(useCaseId, turnStart, prompt).catch((e) => console.error("question check", e));
  await syncBoard(useCaseId).catch((e) => console.error("board sync", e));
}

// The first turn after intake: the concierge greets the person and starts BMAD.
export const START_PROMPT = `The client just finished intake for this use case. Their own words, their documents and their choices are in bacc/intake.md; their uploads, with text versions, are in bacc/uploads/.

BMAD is installed and set up in this project, and this use case is the active initiative. Start the work now:
1. Read bacc/intake.md.
2. Use the \`bmad\` skill to decide where this work starts (it reads the installed modules and the intake), then load the agent it recommends and follow that agent's workflow as written.
3. Greet the client in one short message, tell them who they will work with first and why, and ask the first question BMAD needs, one question only.`;
