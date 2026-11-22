import { prisma } from "@/lib/db";
import { pushPendingUsage } from "@/lib/nasiko/usage";
import { currentCauses, currentTurnId } from "@/lib/studio/truthlog";
import { costOf, estimateTokens, nextAttempt, type Call } from "@/lib/llm/ledgerCore";
import { totalsOf, usageDelta, type ResultLike } from "@/lib/agent/usageCore";

// THE ONE PLACE every model call the Studio makes is recorded (Doug, Nov 22): LlmUsage, shown on Settings > Enterprise Harness
// and sent to Nasiko's usage intake. Each call site hands its numbers to recordCall (or wraps the call in tracked); nothing
// else writes the table. Recording never throws: a record must not stop a call.
//
// LiteLLM, later (Doug, Nov 22): if the Studio's model calls are routed through a LiteLLM gateway, this file is the only
// place that changes: point the SDK base URLs at the gateway and read its per-call usage (or its spend log) here instead
// of at each call site. The call sites already hand over provider, model and tokens in one shape (Call, in ledgerCore.ts).
// Not built now.

// Calls come in bursts (a turn recalls memory several times), so the send to Nasiko waits a moment and goes once.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushPendingUsage().catch(() => undefined);
  }, 3000);
  pushTimer.unref?.();
}

export type Where = { useCaseId?: string; sessionId?: string; turnId?: string };

/** Records one model call. `estimated` says the tokens are a guess from text length (a service that does not report them). */
export async function recordCall(c: Call, where: Where = {}, o: { estimated?: boolean; externalId?: string; at?: Date; baseline?: boolean; cum?: { cost: number; input: number; output: number; cache: number }; auth?: string } = {}) {
  try {
    const useCaseId = where.useCaseId ?? "";
    const turnId = where.turnId ?? (useCaseId ? currentTurnId(useCaseId) : "");
    const { usd, source } = costOf(c, Boolean(o.estimated), process.env.BACC_PRICES_JSON ?? "");
    const inTurn = turnId && c.kind === "turn" ? await prisma.llmUsage.count({ where: { turnId, kind: "turn" } }) : 0;
    const row = await prisma.llmUsage.create({
      data: {
        useCaseId,
        turnId,
        sessionId: where.sessionId ?? "",
        agent: c.agent,
        kind: c.kind,
        purpose: c.purpose ?? "",
        provider: c.provider,
        model: c.model,
        auth: o.auth ?? "",
        inputTokens: c.input,
        outputTokens: c.output,
        cacheTokens: c.cache ?? 0,
        costUsd: usd,
        costSource: source,
        ok: c.ok ?? true,
        error: (c.error ?? "").slice(0, 300),
        attempt: nextAttempt(inTurn),
        causes: useCaseId ? currentCauses(useCaseId).join(" ") : "",
        cumCostUsd: o.cum?.cost ?? 0,
        cumInput: o.cum?.input ?? 0,
        cumOutput: o.cum?.output ?? 0,
        cumCache: o.cum?.cache ?? 0,
        baseline: o.baseline ?? false,
        ms: c.ms ?? 0,
        externalId: o.externalId ?? null,
        ...(o.at ? { at: o.at } : {}),
      },
    });
    schedulePush();
    return row;
  } catch (e) {
    console.warn("usage not recorded", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Runs a model call and records it, whether it works or not. `read` pulls the model and tokens out of the answer. */
export async function tracked<T>(meta: Pick<Call, "agent" | "kind" | "provider" | "purpose"> & { model: string }, where: Where, run: () => Promise<T>, read: (r: T) => { model?: string; input: number; output: number; cache?: number; reportedUsd?: number; estimated?: boolean }): Promise<T> {
  const t = Date.now();
  let out: T;
  try {
    out = await run();
  } catch (e) {
    await recordCall({ ...meta, input: 0, output: 0, ms: Date.now() - t, ok: false, error: e instanceof Error ? e.message : String(e) }, where, { estimated: true });
    throw e;
  }
  try {
    const u = read(out);
    await recordCall({ ...meta, model: u.model || meta.model, input: u.input, output: u.output, cache: u.cache, reportedUsd: u.reportedUsd, ms: Date.now() - t }, where, { estimated: u.estimated });
  } catch (e) {
    console.warn("usage not read", e instanceof Error ? e.message : e);
  }
  return out;
}

/** An Anthropic Messages API answer's usage. */
export function anthropicUsage(r: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }) {
  const u = r.usage ?? {};
  return { model: r.model, input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache: (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) };
}

/** The tokens of a text sent to or received from a service that does not report them: an estimate. */
export const guessTokens = estimateTokens;

// ---- Claude Code runs (Socra, builds, the control build, document and speech jobs on the plan) ----

/** Records one finished Claude Code run from its result message. The pure parts, and why a resumed session counts once, are in usageCore.ts. */
export async function recordClaudeRun(o: { useCaseId: string; turnId?: string; sessionId: string; agent: string; kind: "turn" | "build" | "control" | "document" | "speech" | "writer"; purpose?: string; auth: string; resumed: boolean; result: ResultLike; ok?: boolean; error?: string }) {
  try {
    const { totals, model } = totalsOf(o.result);
    const last = o.sessionId ? await prisma.llmUsage.findFirst({ where: { sessionId: o.sessionId }, orderBy: { at: "desc" } }) : null;
    const prev = last ? { cost: last.cumCostUsd, input: last.cumInput, output: last.cumOutput, cache: last.cumCache } : null;
    const { delta, baseline } = usageDelta(prev, totals, o.resumed);
    await recordCall(
      { agent: o.agent, kind: o.kind, purpose: o.purpose, provider: "anthropic", model, input: delta.input, output: delta.output, cache: delta.cache, reportedUsd: delta.cost, ms: o.result.duration_ms ?? 0, ok: o.ok ?? true, error: o.error },
      { useCaseId: o.useCaseId, turnId: o.turnId, sessionId: o.sessionId },
      { baseline, cum: totals, auth: o.auth },
    );
  } catch (e) {
    console.warn("usage not recorded", e instanceof Error ? e.message : e);
  }
}
