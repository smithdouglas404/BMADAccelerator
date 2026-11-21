import { prisma } from "@/lib/db";
import { brand } from "@/lib/brand";
import { numberedOptions, suggestedOption } from "./core";
import { BOARD_LABEL, type BoardStatus } from "./board";

// One item's Traceability (Doug, Nov 20): everything that really happened to a backlog item and the Board
// card made from it, from the record only. What was said and by whom, which skills were loaded and used,
// which specialists were sent, the questions asked, the answers given, every move with who and why, and
// what it changed in the spec. Nothing here is written by hand: no record, no line.

export type TraceKind = "said" | "asked" | "specialist" | "answer" | "signal" | "turn" | "move" | "change";
export type TraceEntry = {
  id: string;
  at: string;
  kind: TraceKind;
  who: string;
  text: string;
  /** For a turn: what it loaded and used; for a change: the node it changed. */
  detail?: { loaded?: string[]; skills?: string[]; agents?: string[]; tools?: string[]; status?: string; error?: string; node?: string; before?: string; after?: string };
};
export type OpenQuestion = { messageId: string; who: string; text: string; at: string; options: { n: number; label: string; suggested: boolean }[] };
export type ItemDecision = { id: string; text: string; who: string; at: string; options: { label: string; value: string }[] };
export type ItemTrace = { nodes: string[]; entries: TraceEntry[]; question: OpenQuestion | null; decisions: ItemDecision[]; working: boolean; counts: { questions: number; answers: number; turns: number; moves: number } };

const SPECIALIST_NAME: Record<string, string> = {
  "business-analyst": "Business analyst",
  "solution-architect": "Solution architect",
  "domain-expert": "Domain expert",
  "use-case-validator": "Use case validator",
  "ux-component-mapper": "UX/UI designer",
  "product-engineer": "Product engineer",
  "category-researcher": "Category researcher",
  "industry-expert": "Industry expert",
  "innovation-scout": "Innovation scout",
};
export const specialistName = (agent: string) => SPECIALIST_NAME[agent] ?? agent;

/** The item and the card made from it (or the item a card came from) count as one thing. */
export async function itemNodes(useCaseId: string, node: string) {
  const nodes = new Set([node]);
  if (node.startsWith("backlog:")) {
    const made = await prisma.truthChange.findMany({ where: { useCaseId, node: { startsWith: "move:" }, kind: "added", causes: { has: node } }, select: { node: true } });
    made.forEach((m) => nodes.add(m.node));
  } else if (node.startsWith("move:")) {
    const origin = await prisma.truthChange.findFirst({ where: { useCaseId, node, kind: "added" }, select: { causes: true } });
    origin?.causes.filter((c) => c.startsWith("backlog:")).forEach((c) => nodes.add(c));
  }
  return [...nodes];
}

export async function itemTrace(useCaseId: string, node: string): Promise<ItemTrace> {
  const nodes = await itemNodes(useCaseId, node);
  const [own, caused, turns, pending] = await Promise.all([
    prisma.truthChange.findMany({ where: { useCaseId, node: { in: nodes } }, orderBy: { createdAt: "asc" } }),
    // What the item changed elsewhere (spec sections, decisions, cards) because of it.
    prisma.truthChange.findMany({ where: { useCaseId, node: { notIn: nodes }, causes: { hasSome: nodes } }, orderBy: { createdAt: "asc" }, take: 60 }),
    prisma.agentTurn.findMany({ where: { useCaseId, causes: { hasSome: nodes } }, orderBy: { startedAt: "asc" } }),
    prisma.agentEvent.count({ where: { useCaseId, status: { in: ["queued", "running"] }, OR: nodes.map((n) => ({ cause: { contains: n } })) } }),
  ]);
  // The messages about the item, and the words that started it (the message its first record names).
  const originMsgs = own.filter((c) => c.kind === "added").flatMap((c) => c.causes).filter((c) => c.startsWith("msg:")).map((c) => c.slice(4));
  const answerMsgs = own.filter((c) => c.kind === "answered").flatMap((c) => c.causes).filter((c) => c.startsWith("msg:")).map((c) => c.slice(4));
  const messages = await prisma.message.findMany({ where: { useCaseId, OR: [{ about: { hasSome: nodes } }, { id: { in: [...originMsgs, ...answerMsgs] } }] }, orderBy: { createdAt: "asc" } });

  const entries: TraceEntry[] = [];
  const shown = new Set<string>();
  for (const m of messages) {
    if (shown.has(m.id)) continue;
    shown.add(m.id);
    const who = m.role === "user" ? (m.author ? `${m.author}${m.authorRole ? ` (${m.authorRole})` : ""}` : m.authorRole || "A person") : brand(m.agent);
    const kind: TraceKind =
      m.role === "user" ? (m.about.length && !originMsgs.includes(m.id) ? "answer" : "said") : m.role === "agent" ? "specialist" : m.role === "signal" ? "signal" : /\?/.test(m.content) ? "asked" : "signal";
    entries.push({ id: `msg:${m.id}`, at: m.createdAt.toISOString(), kind, who, text: m.content });
  }
  for (const c of own) {
    const move = c.kind === "moved" || c.kind === "moved back" || c.kind === "added" || c.kind === "withdrawn";
    // Answers are already shown as the person's message when it exists; the record keeps answers given without one.
    if (c.kind === "answered" && c.causes.some((x) => x.startsWith("msg:") && shown.has(x.slice(4)))) continue;
    entries.push({ id: `change:${c.id}`, at: c.createdAt.toISOString(), kind: c.kind === "answered" ? "answer" : move ? "move" : "change", who: brand(c.by || "The Studio"), text: brand(c.summary), detail: { node: c.node, before: c.before, after: c.after } });
  }
  for (const c of caused) entries.push({ id: `change:${c.id}`, at: c.createdAt.toISOString(), kind: "change", who: brand(c.by || "Socra"), text: brand(c.summary), detail: { node: c.node } });
  for (const t of turns)
    entries.push({
      id: `turn:${t.id}`,
      at: t.startedAt.toISOString(),
      kind: "turn",
      who: "Socra",
      text: t.status === "running" ? "Working on it" : t.status === "failed" ? "Its turn failed" : "Took a turn on it",
      detail: { loaded: t.loaded, skills: t.skills, agents: t.agents.map(specialistName), tools: t.tools, status: t.status, error: t.error },
    });
  entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  // The question still waiting: the latest one asked about the item with no answer about it since.
  const lastAnswer = [...messages].reverse().find((m) => m.role === "user" && !originMsgs.includes(m.id));
  const lastAnswerRecord = [...own].reverse().find((c) => c.kind === "answered");
  const answeredAt = Math.max(lastAnswer?.createdAt.getTime() ?? 0, lastAnswerRecord?.createdAt.getTime() ?? 0);
  const q = [...messages].reverse().find((m) => (m.role === "muse" || m.role === "agent") && /\?/.test(m.content) && m.createdAt.getTime() > answeredAt);
  const marked = q ? suggestedOption(q.content) : null;
  const question = q
    ? { messageId: q.id, who: brand(q.agent), text: q.content, at: q.createdAt.toISOString(), options: numberedOptions(q.content).map((o) => ({ ...o, suggested: o.n === marked })) }
    : null;
  // Checkpoints Socra raised while working on this item (their record names the item as a cause): still open,
  // they are this item's questions too.
  const decisionIds = [...new Set(caused.filter((c) => c.node.startsWith("decision:")).map((c) => c.node.slice(9)))];
  const open = decisionIds.length ? await prisma.decision.findMany({ where: { id: { in: decisionIds }, status: "open" }, orderBy: { createdAt: "asc" } }) : [];
  const decisions = open.map((d) => ({
    id: d.id,
    text: brand(d.text),
    who: brand(d.agent),
    at: d.createdAt.toISOString(),
    options: (Array.isArray(d.options) ? (d.options as { label?: string; value?: string }[]) : []).filter((o) => o && o.label).map((o) => ({ label: brand(String(o.label)), value: String(o.value ?? o.label) })),
  }));
  return {
    nodes,
    entries,
    question,
    decisions,
    working: pending > 0,
    counts: {
      questions: entries.filter((e) => e.kind === "asked" || (e.kind === "specialist" && /\?/.test(e.text))).length,
      answers: entries.filter((e) => e.kind === "answer").length,
      turns: turns.length,
      moves: own.filter((c) => c.kind === "moved" || c.kind === "moved back").length,
    },
  };
}

export const columnLabel = (s: string) => BOARD_LABEL[s as BoardStatus] ?? s;
