import { prisma } from "@/lib/db";
import { totalsOf, usageDelta, type ResultLike } from "@/lib/agent/usageCore";

// Records what each Claude run used and cost (the pure parts, and why a resumed session is counted once, are in usageCore.ts).

/** Records one finished run. Never throws: usage is a record, it must not stop a run. */
export async function recordUsage(o: { useCaseId: string; turnId?: string; sessionId: string; agent: string; kind: "turn" | "build"; auth: string; resumed: boolean; result: ResultLike }) {
  try {
    const { totals, model } = totalsOf(o.result);
    const last = o.sessionId ? await prisma.llmUsage.findFirst({ where: { sessionId: o.sessionId }, orderBy: { at: "desc" } }) : null;
    const prev = last ? { cost: last.cumCostUsd, input: last.cumInput, output: last.cumOutput, cache: last.cumCache } : null;
    const { delta, baseline } = usageDelta(prev, totals, o.resumed);
    await prisma.llmUsage.create({
      data: { useCaseId: o.useCaseId, turnId: o.turnId ?? "", sessionId: o.sessionId, agent: o.agent, kind: o.kind, model, auth: o.auth, inputTokens: delta.input, outputTokens: delta.output, cacheTokens: delta.cache, costUsd: delta.cost, cumCostUsd: totals.cost, cumInput: totals.input, cumOutput: totals.output, cumCache: totals.cache, baseline, ms: o.result.duration_ms ?? 0 },
    });
  } catch (e) {
    console.warn("usage not recorded", e instanceof Error ? e.message : e);
  }
}

