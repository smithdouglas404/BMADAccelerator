import { prisma } from "@/lib/db";
import { getLink, listAgents, nasiko } from "@/lib/nasiko/client";
import { intakeVerdicts, usageEvent } from "@/lib/nasiko/core";
import { pullServiceUsage } from "@/lib/llm/service";

// Sends the Studio's recorded Claude runs (LlmUsage) to Nasiko's coding-agent intake, so Nasiko's usage and cost pages show them.
// Best effort: when Nasiko is off or away nothing is lost; unsent runs go out on the next try.

let sending = false;

/** What still has to go to Nasiko. A call that failed before using anything has nothing for Nasiko to price, so it stays in the Studio's ledger only. */
export const pendingWhere = { sentToNasiko: false, baseline: false, NOT: { ok: false, inputTokens: 0, outputTokens: 0 } } as const;

export type PushResult = { sent: number; failed: number; pending: number; error: string };

export async function pushPendingUsage(limit = 100): Promise<PushResult> {
  if (sending) return { sent: 0, failed: 0, pending: 0, error: "already sending" };
  sending = true;
  try {
    // The agent service's own calls (product agents, Letta, Mem0) come into the ledger first, so they go out with the rest.
    await pullServiceUsage();
    const link = await getLink();
    if (!link.enabled || !link.url || !link.cipher) return { sent: 0, failed: 0, pending: 0, error: "Nasiko is not connected" };
    const rows = await prisma.llmUsage.findMany({ where: pendingWhere, orderBy: { at: "asc" }, take: limit });
    if (rows.length === 0) return { sent: 0, failed: 0, pending: 0, error: "" };
    const names = new Map((await prisma.useCase.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    // Nasiko's intake accepts only a registered coding-agent connection. Ours is the Claude Code one (id "claude").
    const agents = await listAgents();
    const conn = (agents.ok ? agents.body : []).find((a) => !a.name.startsWith("studio-") && /claude-code$/.test(a.name));
    if (!conn) return { sent: 0, failed: 0, pending: rows.length, error: "Nasiko has no Claude Code connection yet. Register one (Nasiko: POST /api/agents/coding-integrations {\"integration_id\":\"claude\"}), then send again." };
    const events = rows.map((r) => ({ row: r, ev: usageEvent({ id: r.id, useCaseId: r.useCaseId, productName: names.get(r.useCaseId) ?? "", agent: r.agent, kind: r.kind, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheTokens: r.cacheTokens, at: r.at, ms: r.ms, provider: r.provider, purpose: r.purpose }, "claude", conn.name) }));
    const r = await nasiko("POST", "/api/telemetry/coding-agent/events/batch", { events: events.map((e) => e.ev) });
    if (!r.ok) return { sent: 0, failed: rows.length, pending: rows.length, error: r.error };
    // Nasiko answers 200 even when it turns an event down: a run counts as sent only when its own verdict says so.
    const verdicts = intakeVerdicts(r.body);
    const done = events.filter((e) => ["accepted", "duplicate"].includes(verdicts.get(e.ev.event_id) ?? "")).map((e) => e.row.id);
    if (done.length) await prisma.llmUsage.updateMany({ where: { id: { in: done } }, data: { sentToNasiko: true } });
    const rejected = rows.length - done.length;
    const pending = await prisma.llmUsage.count({ where: pendingWhere });
    return { sent: done.length, failed: rejected, pending, error: rejected ? `Nasiko did not accept ${rejected} of ${rows.length} runs (${typeof r.body === "string" ? "no verdicts in its answer" : JSON.stringify(r.body).slice(0, 200)})` : "" };
  } catch (e) {
    return { sent: 0, failed: 0, pending: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    sending = false;
  }
}
