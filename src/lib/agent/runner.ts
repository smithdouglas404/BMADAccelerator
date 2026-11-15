import { promises as fs } from "fs";
import { STUDIO_TEAM } from "./team";
import path from "path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { provisionWorkspace, shadcnLookupDir, syncStudioSkills, writeIntake, STUDIO_SKILLS_DIR } from "@/lib/provision";
import { agentModel } from "@/lib/docAgent";
import { mcpServersFor, mcpSummary } from "@/lib/studio/mcp";
import { ensureRoutes } from "@/lib/studio/state";
import { LimitError, authEnv, authOrder, claudeConfigured, limitMessage, type Auth } from "@/lib/agent/auth";
import { studioTools, type RunTally } from "./tools";
import { fakeAgentTurn } from "./fake";
import { recallForTurn, startMemoryJobs } from "@/lib/memory";
import { withContext } from "@/lib/memory/lettaCore";

// One Muse turn at a time per product. Queued events (messages, captures, pulled-forward
// recommendations, annotations, build notes) are combined into the next turn, in order.
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

export async function museInstructions() {
  const md = await fs.readFile(path.join(STUDIO_SKILLS_DIR, "studio-muse", "SKILL.md"), "utf8");
  return md.replace(/^---[\s\S]*?---\s*/, "");
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
      // A session started under another sign-in may not resume; the Studio holds the state anyway.
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
  speaker?: string;
}) {
  const auth = opts.auth ?? authOrder()[0] ?? "key";
  const ws = workspacePath(opts.slug);
  const texts: string[] = [];
  // The official shadcn MCP server (pinned in the image): component, block and chart look-ups.
  const shadcnDir = process.env.BACC_SHADCN_MCP === "0" ? "" : await shadcnLookupDir(opts.slug).catch(() => "");
  await syncStudioSkills(opts.useCaseId, opts.slug).catch((e) => console.error("skill sync", e));
  const connectors = await mcpServersFor(opts.useCaseId).catch(() => ({}));
  const q = query({
    prompt: opts.prompt,
    options: {
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
      // The Muse's team: validator, UX / component mapper, product engineer and the research team.
      agents: STUDIO_TEAM,
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

async function runTurn(useCaseId: string, prompt: string) {
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
  prompt = withContext(prompt, recalled);
  await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Thinking" } });

  if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
    await fakeAgentTurn(fresh, prompt, tally);
  } else {
    const connectorNote = await mcpSummary(useCaseId).catch(() => "");
    const { texts } = await runSdkTurn({
      useCaseId,
      slug: fresh.slug,
      prompt,
      resume: fresh.claudeSessionId,
      appendSystem: `${await museInstructions()}${connectorNote ? `\n\n${connectorNote}` : ""}`,
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
    // Safety net: if the Muse wrote to the owner without using `say`, show its last words.
    if (!tally.spoke && texts.length) {
      await prisma.message.create({ data: { useCaseId, role: "muse", agent: "Muse · Product physician", content: texts[texts.length - 1] } });
    }
  }
}

// The Muse's first turn for a product: it opens the studio.
export const START_PROMPT = `[opening] The owner just described a new product. Their own words, documents and choices are in studio/intake.md; their uploads, with text versions, are in studio/uploads/.

Open the studio now, as your skill's "The opening" section says: name the category, write the product in one breath, the capability floor (four to eight capabilities, at least 30 items, everything the leading products of this kind have), the first PRFAQ, the evidence and validation you already have, and five to eight recommendations; start the first build; send your whole team out in parallel; then greet the owner in one short message with the single most important question and your suggested answer. Speed matters: the owner should see their product's shape within a minute and a working first version within minutes.`;
