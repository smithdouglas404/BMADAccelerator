import { createAgent, createTool, anthropic, openai, gemini } from "@inngest/agent-kit";
import { z } from "zod";
import { DEFAULT_MODEL, KEY_FOR, memoryScope, systemPrompt, type AgentConfig, type ToolConfig } from "./config.ts";
import type { Store, UseCaseRow } from "./store.ts";
import type { Letta, Mem0 } from "./memory.ts";

// One agent run. AgentKit does the thinking and the tools; Letta keeps the persona and its memory of
// the person; Mem0 keeps long-term facts; a person approves what the configuration says needs approval.
// When Inngest runs it (step is set), waits for approvals are durable; without Inngest they poll.

type StepLike = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  waitForEvent: (id: string, o: { event: string; timeout: string; if?: string }) => Promise<unknown>;
};
export type Deps = { store: Store; mem0: Mem0; letta: Letta; step?: StepLike; pollMs?: number };

export const APPROVAL_EVENT = "agent-service/approval.decided";

/** Waits for a person to approve or reject; on timeout the configured default applies. */
export async function waitForDecision(d: Deps, approvalId: string, a: AgentConfig): Promise<{ approved: boolean; comment: string }> {
  if (d.step) await d.step.waitForEvent(`wait-${approvalId}`, { event: APPROVAL_EVENT, timeout: `${a.approvals.timeoutMinutes}m`, if: `async.data.approvalId == '${approvalId}'` });
  else {
    for (;;) {
      const ap = await d.store.approval(approvalId);
      if (!ap || ap.status !== "pending") break;
      if (new Date(ap.expires_at).getTime() < Date.now()) break;
      await new Promise((r) => setTimeout(r, d.pollMs ?? 1000));
    }
  }
  const ap = await d.store.approval(approvalId);
  if (ap?.status === "pending") {
    const status = a.approvals.onTimeout === "approve" ? "approved" : "expired";
    await d.store.decide(approvalId, status, "No answer in time", "timeout");
    return { approved: status === "approved", comment: "No answer in time" };
  }
  return { approved: ap?.status === "approved", comment: ap?.comment ?? "" };
}

function modelFor(a: AgentConfig) {
  const key = process.env[KEY_FOR[a.model.provider]];
  if (!key) return null;
  const model = a.model.name || process.env[`AGENT_SERVICE_${a.model.provider.toUpperCase()}_MODEL`] || DEFAULT_MODEL[a.model.provider];
  if (a.model.provider === "anthropic") return anthropic({ model: model as never, apiKey: key, defaultParameters: { max_tokens: 2048 } });
  if (a.model.provider === "openai") return openai({ model: model as never, apiKey: key });
  return gemini({ model: model as never, apiKey: key });
}

function zodFor(t: ToolConfig) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, p] of Object.entries(t.parameters)) {
    const base = p.type === "number" ? z.number() : p.type === "boolean" ? z.boolean() : z.string();
    const v = p.description ? base.describe(p.description) : base;
    shape[k] = p.optional ? v.optional() : v;
  }
  return z.object(shape);
}

/** Calls the app back to take an action: POST {callbackUrl}/api/agent-actions/{tool}. */
async function callApp(uc: UseCaseRow, tool: string, input: unknown, runId: string, agent: string) {
  if (!uc.callback_url) return { ok: false, note: "This app has no action endpoint registered, so nothing was changed." };
  const res = await fetch(`${uc.callback_url.replace(/\/+$/, "")}/api/agent-actions/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Service-Secret": uc.callback_secret },
    body: JSON.stringify({ input, runId, agent }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, note: text.slice(0, 500) };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, result: text.slice(0, 2000) };
  }
}

export async function runAgent(d: Deps, runId: string) {
  const { store, mem0, letta } = d;
  const once = <T>(id: string, fn: () => Promise<T>) => (d.step ? d.step.run(id, fn) : fn());
  let calls = 0; // step ids must be the same on every replay, so they count calls in order
  const run = await store.run(runId);
  if (!run) return;
  const uc = await store.useCase(run.use_case);
  const a = await store.agent(run.use_case, run.agent);
  if (!uc || !a) {
    await store.setRun(runId, { status: "failed", error: "The agent or its use case is no longer registered." }, true);
    return;
  }
  await once("start", () => store.setRun(runId, { status: "running" }));
  const scope = memoryScope(uc.id, uc.customer);

  try {
    // Memory first: the persona and the person (Letta), long-term facts (Mem0).
    const mind = await once("memory", async () => {
      let persona: string | undefined, human: string | undefined, lettaId = "";
      if (a.persona.enabled && letta.on) {
        try {
          lettaId = await letta.agentFor(uc.id, a.key, run.person, a.persona.text);
          ({ persona, human } = await letta.blocks(lettaId));
          await store.step(runId, "persona", "Letta persona and its memory of this person loaded");
        } catch (e) {
          await store.step(runId, "persona", `Letta unavailable, using the configured persona (${(e as Error).message.slice(0, 160)})`);
        }
      } else if (a.persona.enabled) await store.step(runId, "persona", "Letta is not connected here; using the configured persona");
      let facts: string[] = [];
      if (a.memory.facts && mem0.on) {
        facts = await mem0.recall(scope, a.key, run.input).catch(async (e) => {
          await store.step(runId, "memory", `Mem0 unavailable (${(e as Error).message.slice(0, 160)})`);
          return [] as string[];
        });
        if (facts.length) await store.step(runId, "memory", `Recalled ${facts.length} fact${facts.length === 1 ? "" : "s"} from Mem0`);
      }
      return { persona, human, facts, lettaId };
    });

    const model = modelFor(a);
    let output: string;
    if (!model) {
      // Demo mode: every flow still works, clearly labelled, with no model key.
      output = `[Demo, no ${KEY_FOR[a.model.provider]} set] ${a.name} would ${a.purpose.replace(/\.$/, "").toLowerCase()} for: "${run.input.slice(0, 200)}".`;
      await store.setRun(runId, { demo: true });
      await store.step(runId, "demo", "No model key, so the answer is a labelled demo");
    } else {
      const tools = a.tools.map((t) =>
        createTool({
          name: t.name,
          description: t.description,
          parameters: zodFor(t),
          handler: async (input: unknown) => {
            const n = ++calls;
            if (t.approval) {
              const apId = await once(`ask-${t.name}-${n}`, () =>
                store.createApproval({ run: runId, useCase: uc.id, agent: a.key, kind: "action", title: `${a.name} wants to ${t.description.replace(/\.$/, "").toLowerCase()}`, detail: JSON.stringify(input, null, 2), timeoutMinutes: a.approvals.timeoutMinutes }),
              );
              await store.setRun(runId, { status: "waiting" });
              await store.step(runId, "approval", `Waiting for a person to approve: ${t.name}`);
              const v = await waitForDecision(d, apId, a);
              await store.setRun(runId, { status: "running" });
              await store.step(runId, "approval", `${v.approved ? "Approved" : "Rejected"}: ${t.name}${v.comment ? ` (“${v.comment}”)` : ""}`);
              if (!v.approved) return { ok: false, note: `A person rejected this action${v.comment ? `: ${v.comment}` : ""}. Do not retry it; tell them what you would do instead.` };
            }
            const r = await once(`act-${t.name}-${n}`, () => callApp(uc, t.name, input, runId, a.key));
            await store.step(runId, "action", `${t.name} → ${JSON.stringify(r).slice(0, 300)}`);
            return r;
          },
        }),
      );
      const remember = createTool({
        name: "remember",
        description: "Keep one fact for later visits (a preference, a decision, something learned). Never secrets.",
        parameters: z.object({ fact: z.string().min(3) }),
        handler: async ({ fact }: { fact: string }) => {
          if (!mem0.on || !a.memory.facts) return "Long-term memory is off for this agent.";
          await mem0.remember(scope, a.key, [{ role: "user", content: fact }], { kind: "fact", run: runId });
          await store.step(runId, "memory", `Remembered: ${fact}`);
          return "Remembered.";
        },
      });
      const agent = createAgent({ name: a.name, description: a.purpose, system: systemPrompt(a, mind), model, tools: [...tools, remember] });
      const result = await agent.run(run.input, d.step ? { step: d.step as never } : undefined);
      output = result.output
        .map((m) => (m.type === "text" ? (typeof m.content === "string" ? m.content : m.content.map((c) => c.text).join("")) : ""))
        .join("\n")
        .trim();
      await store.step(runId, "answer", `${a.name} answered (${output.length} characters)`);
    }

    if (a.approvals.output) {
      const apId = await once("ask-output", () =>
        store.createApproval({ run: runId, useCase: uc.id, agent: a.key, kind: "output", title: `Check ${a.name}'s answer before it is used`, detail: output, timeoutMinutes: a.approvals.timeoutMinutes }),
      );
      await store.setRun(runId, { status: "waiting", output });
      await store.step(runId, "approval", "Waiting for a person to approve the answer");
      const v = await waitForDecision(d, apId, a);
      await store.step(runId, "approval", `${v.approved ? "Approved" : "Rejected"}${v.comment ? ` (“${v.comment}”)` : ""}`);
      if (!v.approved) {
        await store.setRun(runId, { status: "rejected", output }, true);
        return;
      }
    }

    await store.setRun(runId, { status: "done", output }, true);
    // Afterwards, in the background of the run: Mem0 keeps the exchange; the Letta persona updates its own memory.
    await once("after", async () => {
      if (a.memory.facts && mem0.on)
        await mem0.remember(scope, a.key, [{ role: "user", content: run.input }, { role: "assistant", content: output }], { kind: "exchange", run: runId }).catch(() => undefined);
      if (mind.lettaId) await letta.reflect(mind.lettaId, run.input, output).catch(() => undefined);
    });
  } catch (e) {
    await store.setRun(runId, { status: "failed", error: (e as Error).message.slice(0, 1000) }, true);
  }
}
