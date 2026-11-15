import { promises as fs } from "fs";
import path from "path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { provisionWorkspace, writeIntake } from "@/lib/provision";
import { syncBoard } from "@/lib/bmadTickets";
import { MODEL } from "@/lib/docAgent";
import { baccTools, type RunTally } from "./tools";
import { fakeAgentTurn } from "./fake";

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
  return Boolean(process.env.ANTHROPIC_API_KEY) || process.env.BACC_FAKE_AGENT === "1";
}

export async function kick(useCaseId: string) {
  if (running.has(useCaseId)) return;
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

export async function runSdkTurn(opts: {
  useCaseId: string;
  slug: string;
  prompt: string;
  resume: string;
  appendSystem: string;
  onSession: (id: string) => Promise<void>;
  onStatus: (s: string) => Promise<void>;
  tally: RunTally;
  maxTurns?: number;
}) {
  const ws = workspacePath(opts.slug);
  const texts: string[] = [];
  const q = query({
    prompt: opts.prompt,
    options: {
      cwd: ws,
      model: MODEL,
      settingSources: ["project"],
      systemPrompt: { type: "preset", preset: "claude_code", append: opts.appendSystem },
      mcpServers: { bacc: baccTools(opts.useCaseId, opts.slug, opts.tally) },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      disallowedTools: ["AskUserQuestion"],
      resume: opts.resume || undefined,
      maxTurns: opts.maxTurns ?? 200,
      env: { ...process.env, IS_SANDBOX: "1" } as Record<string, string>,
      stderr: (d) => console.error("[claude]", d.trimEnd()),
    },
  });
  let sessionId = "";
  let lastStatus = "";
  for await (const m of q as AsyncIterable<SDKMessage>) {
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
    await prisma.useCase.update({ where: { id: useCaseId }, data: { agentStatus: "Installing BMAD" } });
    await provisionWorkspace(useCaseId);
  } else {
    await writeIntake(useCaseId);
  }
  const fresh = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const tally: RunTally = { spoke: 0 };

  if (process.env.BACC_FAKE_AGENT === "1" && !process.env.ANTHROPIC_API_KEY) {
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
  await syncBoard(useCaseId).catch((e) => console.error("board sync", e));
}

// The first turn after intake: the concierge greets the person and starts BMAD.
export const START_PROMPT = `The client just finished intake for this use case. Their own words, their documents and their choices are in bacc/intake.md; their uploads, with text versions, are in bacc/uploads/.

BMAD is installed and set up in this project, and this use case is the active initiative. Start the work now:
1. Read bacc/intake.md.
2. Use the \`bmad\` skill to decide where this work starts (it reads the installed modules and the intake), then load the agent it recommends and follow that agent's workflow as written.
3. Greet the client in one short message, tell them who they will work with first and why, and ask the first question BMAD needs, one question only.`;
