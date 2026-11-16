import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  APPROVAL_MAX_CHARS, APPROVAL_QUESTIONS, JEV_MODEL, JEV_URL, LINK_PAIRS_PER_REQUEST, MARK_LABEL, MARK_QUESTIONS,
  approvalVerdict, candidatePairs, decideYes, markVerdict, pairQuestions, pairVerdict,
  type Answers, type LinkGuess, type MarkKind, type Question, type Story,
} from "./core";

export * from "./core";

// TypeSafe's Jev (studio-skills/typesafe-ai): small typed judgments with probabilities. Jev judges,
// code decides, and every call is logged beside what the old method said (JevCall, Settings > Jev).
// A failed call is an error, never an answer: the old method decides and the error is logged.

/** On when a TypeSafe key is saved (Settings > Models and keys); BACC_JEV=off switches it off. */
export const jevEnabled = () => Boolean(process.env.TYPESAFE_API_KEY) && (process.env.BACC_JEV || "on").toLowerCase() !== "off";

type Raw = { answers: Answers; inputTokens: number; ms: number };

/** One request: shared state, questions answered in parallel. Throws on any failure. */
export async function askJev(state: unknown, questions: Record<string, Question>, timeoutMs = 5000): Promise<Raw> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("Jev is not configured: no TypeSafe key on Settings.");
  const t = Date.now();
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: JEV_MODEL, state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Jev answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const body = (await res.json()) as { answers?: Answers; usage?: { input_tokens?: number } };
  if (!body.answers) throw new Error("Jev sent no answers.");
  return { answers: body.answers, inputTokens: body.usage?.input_tokens ?? 0, ms: Date.now() - t };
}

async function log(data: Prisma.JevCallUncheckedCreateInput) {
  return prisma.jevCall.create({ data }).catch((e) => {
    console.error("[jev] could not log a call:", (e as Error).message);
    return null;
  });
}

/** Ties a logged call to what it produced (a decision, a link), so later outcomes can be counted. */
export async function tagJevCall(callId: string | null | undefined, ref: string) {
  if (callId) await prisma.jevCall.update({ where: { id: callId }, data: { ref } }).catch(() => undefined);
}

/** A person's later answer to what a call produced: an approval undone, a link accepted or dismissed. */
export async function jevOutcome(ref: string, outcome: string) {
  await prisma.jevCall.updateMany({ where: { ref }, data: { outcome } }).catch(() => undefined);
}

// ---- 1. Hearing a yes ----

/**
 * Is this short reply a yes to the one proposal on the table? The rules answered already; Jev's clear
 * answer wins, and when Jev is unsettled, failing or off, the rules decide. Returns the call id to tag.
 */
export async function judgeYes(useCaseId: string, proposal: string, reply: string, rulesYes: boolean): Promise<{ yes: boolean; callId: string | null }> {
  if (!jevEnabled() || !proposal.trim() || reply.length > APPROVAL_MAX_CHARS) return { yes: rulesYes, callId: null };
  const input = { socra_proposal: proposal, owner_reply: reply };
  try {
    const r = await askJev(input, APPROVAL_QUESTIONS, 4000);
    const verdict = approvalVerdict(r.answers);
    const d = decideYes(rulesYes, verdict);
    const row = await log({ useCaseId, feature: "approval", input, answers: r.answers as Prisma.InputJsonValue, jev: verdict, old: rulesYes ? "yes" : "no", used: d.used === "jev" ? "jev" : "old", ms: r.ms, inputTokens: r.inputTokens });
    return { yes: d.yes, callId: row?.id ?? null };
  } catch (e) {
    await log({ useCaseId, feature: "approval", input, old: rulesYes ? "yes" : "no", used: "old", error: (e as Error).message.slice(0, 300) });
    return { yes: rulesYes, callId: null };
  }
}

// ---- 2. Sorting a mark-up ----

/** Sorts a mark into new requirement, change or bug at once; Socra's later reading is logged beside it. */
export async function sortMark(useCaseId: string, annotationId: string, screen: string, note: string): Promise<{ kind: MarkKind | ""; p: number; label: string } | null> {
  if (!jevEnabled()) return null;
  const input = { screen: screen || "the product", note };
  try {
    const r = await askJev(input, MARK_QUESTIONS, 5000);
    const v = markVerdict(r.answers);
    await log({ useCaseId, feature: "markup", ref: `ann:${annotationId}`, input, answers: r.answers as Prisma.InputJsonValue, jev: v.kind || "asks_nothing", used: "jev", ms: r.ms, inputTokens: r.inputTokens });
    return { ...v, label: v.kind ? MARK_LABEL[v.kind] : "comment, no change asked" };
  } catch (e) {
    await log({ useCaseId, feature: "markup", ref: `ann:${annotationId}`, input, used: "old", error: (e as Error).message.slice(0, 300) });
    return null;
  }
}

/** Socra's own reading of the same mark (interpret_annotation), for the agreement rate. */
export async function markReadBySocra(annotationId: string, kind: string) {
  await prisma.jevCall.updateMany({ where: { feature: "markup", ref: `ann:${annotationId}` }, data: { old: kind } }).catch(() => undefined);
}

// ---- 3. Story map link suggestions ----

/** Jev's link guesses for unlinked pairs, strongest first. Null when Jev is off or every request failed. */
export async function guessLinks(useCaseId: string, product: string, stories: Story[], links: { from: string; to: string }[]): Promise<LinkGuess[] | null> {
  if (!jevEnabled()) return null;
  const pairs = candidatePairs(stories, links);
  if (!pairs.length) return [];
  const batches: [Story, Story][][] = [];
  for (let i = 0; i < pairs.length; i += LINK_PAIRS_PER_REQUEST) batches.push(pairs.slice(i, i + LINK_PAIRS_PER_REQUEST));
  const state = { product, stories: Object.fromEntries(stories.map((s) => [s.title, { area: s.capability }])) };
  const guesses: LinkGuess[] = [];
  let answered = 0;
  await Promise.all(
    batches.map(async (batch, bi) => {
      const questions = Object.assign({}, ...batch.map(([a, b], i) => pairQuestions(i, a, b))) as Record<string, Question>;
      try {
        const r = await askJev(state, questions, 15000);
        answered++;
        const found = batch.map(([a, b], i) => pairVerdict(i, a, b, r.answers)).filter((g): g is LinkGuess => !!g);
        guesses.push(...found);
        await log({ useCaseId, feature: "links", ref: `links:${bi}`, input: { pairs: batch.length } as Prisma.InputJsonValue, answers: { found: found.length } as Prisma.InputJsonValue, jev: `${found.length} links`, used: "jev", ms: r.ms, inputTokens: r.inputTokens });
      } catch (e) {
        await log({ useCaseId, feature: "links", input: { pairs: batch.length } as Prisma.InputJsonValue, used: "old", error: (e as Error).message.slice(0, 300) });
      }
    }),
  );
  if (!answered) return null;
  return guesses.sort((x, y) => y.p - x.p);
}

// ---- the value, for Settings > Jev ----

export async function jevStats() {
  const rows = await prisma.jevCall.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
  const linkRows = await prisma.storyLink.findMany({ where: { status: { in: ["confirmed", "dismissed"] } }, select: { by: true, status: true, why: true } });
  const feature = (f: string) => {
    const all = rows.filter((r) => r.feature === f);
    const ok = all.filter((r) => !r.error);
    const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
    const tokens = ok.reduce((s, r) => s + r.inputTokens, 0);
    const compared = ok.filter((r) => r.old && r.jev && r.jev !== "unsettled");
    return {
      calls: all.length,
      errors: all.length - ok.length,
      usedJev: all.filter((r) => r.used === "jev").length,
      compared: compared.length,
      agreed: compared.filter((r) => r.jev === r.old).length,
      medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0,
      p95Ms: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : 0,
      tokens,
    };
  };
  const approval = rows.filter((r) => r.feature === "approval" && !r.error);
  const approvedByJev = approval.filter((r) => r.used === "jev" && r.jev === "yes");
  const ofLinks = (jev: boolean) => {
    const l = linkRows.filter((x) => (x.why.startsWith("Jev:") ? jev : !jev) && x.by !== "" && (jev || /socra/i.test(x.by)));
    return { accepted: l.filter((x) => x.status === "confirmed").length, dismissed: l.filter((x) => x.status === "dismissed").length };
  };
  const disagreements = rows
    .filter((r) => !r.error && r.old && r.jev && r.jev !== "unsettled" && r.jev !== r.old)
    .slice(0, 12)
    .map((r) => ({ feature: r.feature, at: r.createdAt, input: r.input, jev: r.jev, old: r.old, used: r.used, outcome: r.outcome }));
  return {
    configured: Boolean(process.env.TYPESAFE_API_KEY),
    on: jevEnabled(),
    features: { approval: feature("approval"), markup: feature("markup"), links: feature("links") },
    approvals: {
      rescued: approval.filter((r) => r.jev === "yes" && r.old === "no").length,
      blocked: approval.filter((r) => r.jev === "no" && r.old === "yes").length,
      byJev: approvedByJev.length,
      undone: approvedByJev.filter((r) => r.outcome === "undone").length,
    },
    links: { jev: ofLinks(true), socra: ofLinks(false) },
    recentErrors: rows.filter((r) => r.error).slice(0, 5).map((r) => ({ feature: r.feature, at: r.createdAt, error: r.error })),
    disagreements,
  };
}
