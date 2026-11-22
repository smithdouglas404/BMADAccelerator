import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rollup } from "@/lib/agent/usageCore";
import { messagesOf, runsPerMessage } from "@/lib/llm/ledgerCore";
import { pullServiceUsage } from "@/lib/llm/service";

export const dynamic = "force-dynamic";

// What every model call the Studio makes used and cost (the ledger, src/lib/llm/ledger.ts): Socra's turns and builds, document
// reading, spoken-words clean-up, writers, images, Letta, Mem0, Jev and the agent service's product agents. Per agent, per kind of call,
// per product, and how many Claude runs each message cost (retries flagged). Cost is the provider's own figure where it gives one,
// otherwise tokens times a price table, and the part that is an estimate is shown as such.
export async function GET() {
  await pullServiceUsage();
  const rows = await prisma.llmUsage.findMany({ orderBy: { at: "desc" }, take: 5000 });
  const r = rollup(rows);
  const names = new Map((await prisma.useCase.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  // Runs per message: only conversation runs count (builds and side jobs are not answers to a message).
  const perMessage = runsPerMessage(rows.map((x) => ({ id: x.id, useCaseId: x.useCaseId, turnId: x.turnId, agent: x.agent, kind: x.kind, ok: x.ok, attempt: x.attempt, causes: x.causes, costUsd: x.costUsd, baseline: x.baseline, at: x.at })));
  const msgs = await prisma.message.findMany({ where: { id: { in: perMessage.slice(0, 40).map((m) => m.message) } }, select: { id: true, useCaseId: true, content: true, author: true, createdAt: true } });
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const messages = perMessage.slice(0, 40).map((m) => {
    const msg = byId.get(m.message);
    return { ...m, product: names.get(msg?.useCaseId ?? "") ?? "", author: msg?.author ?? "", text: (msg?.content ?? "").slice(0, 140), at: msg?.createdAt ?? m.firstAt };
  });
  const turnRuns = rows.filter((x) => !x.baseline && x.kind === "turn");
  const answered = new Set(turnRuns.flatMap((x) => messagesOf(x.causes)));
  const perMessageSummary = { messages: answered.size, runs: turnRuns.filter((x) => messagesOf(x.causes).length).length, retries: perMessage.reduce((n, m) => n + m.retries, 0), failed: perMessage.reduce((n, m) => n + m.failed, 0) };

  const recent = rows.filter((x) => !x.baseline).slice(0, 12).map((x) => ({ at: x.at, agent: x.agent, product: names.get(x.useCaseId) ?? "", model: x.model, provider: x.provider, purpose: x.purpose, tokens: x.inputTokens + x.outputTokens + x.cacheTokens, usd: x.costUsd, estimated: x.costSource === "estimated", ok: x.ok, attempt: x.attempt, error: x.error, kind: x.kind }));
  return NextResponse.json({ ...r, byAgentProduct: r.byAgentProduct.map((x) => ({ ...x, product: x.useCaseId ? (names.get(x.useCaseId) ?? "Removed product") : "Not tied to a product" })), byProduct: r.byProduct.map((p) => ({ ...p, name: p.useCaseId ? (names.get(p.useCaseId) ?? "Removed product") : "Not tied to a product" })), recent, messages, perMessage: perMessageSummary });
}
