// TypeSafe's Jev in the Studio (Doug, Nov 16): Jev answers small typed judgments, code decides.
// Every question, option, criterion and threshold Jev is asked lives here, so they can be read and
// changed in one place (studio-skills/typesafe-ai). Pure: no database, so tests load it directly.

export const JEV_MODEL = "jev-latest";
export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
/** TypeSafe's list price (docs.typesafe.ai/go/models, Nov 2026): $0.042 per million input tokens; output is free. */
export const JEV_USD_PER_MTOK = 0.042;
export const jevCostUsd = (inputTokens: number) => (inputTokens / 1_000_000) * JEV_USD_PER_MTOK;

/** Noul thresholds: above YES reads as yes, below NO as no, between is unsettled (the old method decides). */
export const YES = 0.7;
export const NO = 0.3;

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };
export type Answer = { type: string; noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number> };
export type Answers = Record<string, Answer>;

// ---- 1. Hearing a yes ----------------------------------------------------------------------------
// The rules (isAffirmative) stay the first check. Jev judges whether a short reply agrees to the one
// proposal on the table, and whether it adds something new (then it is a new thought, not a bare yes).

/** Replies longer than this are never a bare yes: they are held as requirements without asking Jev. */
export const APPROVAL_MAX_CHARS = 200;

export const APPROVAL_QUESTIONS: Record<string, Question> = {
  agrees: {
    type: "noul",
    instructions: "Does `owner_reply` agree to `socra_proposal`?",
    criteria: {
      true: "The owner says yes to the proposal, in any words: yes, yeah, sure, go for it, sounds good, let's do it.",
      false: "The owner says no or not yet, is unsure, or asks a question instead of answering.",
    },
  },
  adds_new: {
    type: "noul",
    instructions: "Does `owner_reply` ask for something beyond what `socra_proposal` says?",
    criteria: {
      true: "The owner adds a new request or changes the proposal, such as 'and add video too' or 'but make it daily'.",
      false: "The owner only answers the proposal, or only gives a reason for the answer.",
    },
  },
};

export type Verdict = "yes" | "no" | "unsettled";

/** The truth table: a yes needs agreement and nothing new; a clear no or something new is not a yes. */
export function approvalVerdict(a: Answers): Verdict {
  const agrees = a.agrees?.noul;
  const adds = a.adds_new?.noul;
  if (agrees === undefined || adds === undefined) return "unsettled";
  if (agrees <= NO || adds >= YES) return "no";
  if (agrees >= YES && adds <= NO) return "yes";
  return "unsettled";
}

/** What the Studio does: Jev's clear answer wins; when Jev is unsettled, failed or off, the rules decide. */
export function decideYes(rulesYes: boolean, verdict: Verdict | null): { yes: boolean; used: "jev" | "rules" } {
  if (verdict === "yes") return { yes: true, used: "jev" };
  if (verdict === "no") return { yes: false, used: "jev" };
  return { yes: rulesYes, used: "rules" };
}

// ---- 2. Sorting a mark-up ------------------------------------------------------------------------

export const MARK_KINDS = ["new_requirement", "change_request", "bug_report"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export const MARK_LABEL: Record<MarkKind, string> = { new_requirement: "new requirement", change_request: "change", bug_report: "bug" };

export const MARK_QUESTIONS: Record<string, Question> = {
  kind: {
    type: "choice",
    instructions: "What is the person asking for in `note` about `screen`?",
    criteria: {
      new_requirement: "Something the app does not do yet, such as a new filter, export, field or screen.",
      change_request: "Something the app already does, done differently, such as another colour, order, size or wording.",
      bug_report: "Something that should already work but is broken or wrong, such as a button that does nothing or a wrong total.",
    },
  },
  asks_anything: {
    type: "noul",
    instructions: "Does `note` ask for anything about the app to be different?",
    criteria: { true: "The note asks for a change, an addition or a fix.", false: "The note only praises, agrees or comments, such as 'this looks great'." },
  },
};

/** The kind, or "" when the note asks for nothing (or Jev can't tell). */
export function markVerdict(a: Answers): { kind: MarkKind | ""; p: number } {
  const asks = a.asks_anything?.noul;
  const choice = a.kind?.choice as MarkKind | undefined;
  if (asks === undefined || !choice || !MARK_KINDS.includes(choice)) return { kind: "", p: 0 };
  if (asks <= NO) return { kind: "", p: 1 - asks };
  return { kind: choice, p: a.kind?.probabilities?.[choice] ?? 0 };
}

// ---- 3. Story map link suggestions ---------------------------------------------------------------

export type Story = { id: string; title: string; capability: string };
/** Stories Jev looks at per run, and pairs per request (three questions each). */
export const LINK_MAX_STORIES = 30;
export const LINK_PAIRS_PER_REQUEST = 40;
export const LINK_DEPENDS_MIN = 0.75;
export const LINK_RELATED_MIN = 0.8;

export function pairQuestions(i: number, a: Story, b: Story): Record<string, Question> {
  return {
    [`p${i}_a_needs_b`]: {
      type: "noul",
      instructions: `Does the story “${a.title}” need the story “${b.title}” to be built first?`,
      criteria: { true: `“${a.title}” can't work, or can't be tested, until “${b.title}” exists.`, false: `“${a.title}” could be built and used without “${b.title}”.` },
    },
    [`p${i}_b_needs_a`]: {
      type: "noul",
      instructions: `Does the story “${b.title}” need the story “${a.title}” to be built first?`,
      criteria: { true: `“${b.title}” can't work, or can't be tested, until “${a.title}” exists.`, false: `“${b.title}” could be built and used without “${a.title}”.` },
    },
    [`p${i}_related`]: {
      type: "noul",
      instructions: `Are “${a.title}” and “${b.title}” part of the same feature or workflow?`,
      criteria: { true: "Someone using the product would meet both in the same task or screen.", false: "They serve different tasks or different people." },
    },
  };
}

export type LinkGuess = { from: string; to: string; kind: "depends_on" | "related"; p: number; why: string };

/** Reads one pair's answers: a clear dependency wins (in its stronger direction), else a strong relation. */
export function pairVerdict(i: number, a: Story, b: Story, ans: Answers): LinkGuess | null {
  const ab = ans[`p${i}_a_needs_b`]?.noul ?? 0;
  const ba = ans[`p${i}_b_needs_a`]?.noul ?? 0;
  const rel = ans[`p${i}_related`]?.noul ?? 0;
  if (Math.max(ab, ba) >= LINK_DEPENDS_MIN) {
    const [from, to, p] = ab >= ba ? [a, b, ab] : [b, a, ba];
    return { from: from.id, to: to.id, kind: "depends_on", p, why: `Jev: ${Math.round(p * 100)}% that “${from.title}” needs “${to.title}” first` };
  }
  if (rel >= LINK_RELATED_MIN) return { from: a.id, to: b.id, kind: "related", p: rel, why: `Jev: ${Math.round(rel * 100)}% that they are part of the same feature or workflow` };
  return null;
}

/** Unordered pairs not yet linked in any state (a dismissed link is never offered again). */
export function candidatePairs(stories: Story[], links: { from: string; to: string }[]): [Story, Story][] {
  const seen = new Set(links.flatMap((l) => [`${l.from}|${l.to}`, `${l.to}|${l.from}`]));
  const s = stories.slice(0, LINK_MAX_STORIES);
  const out: [Story, Story][] = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (!seen.has(`${s[i].id}|${s[j].id}`)) out.push([s[i], s[j]]);
  return out;
}

// ---- 4. The gate on messages to Socra (log-only, Doug Nov 21) --------------------------------------
// The questions, thresholds and what counts as a "light" turn are data (studio-skills/typesafe-ai/gate.json).

export type GateConfig = { enabled: boolean; maxChars: number; yes: number; no: number; lightTools: string[]; questions: Record<string, Question> };
export type GateVerdict = "light" | "full" | "unsettled";

/** A message needs a full turn when it gives work or asks something; neither, clearly, means a light reply would do. */
export function gateVerdict(a: Answers, cfg: Pick<GateConfig, "yes" | "no">): GateVerdict {
  const work = a.gives_work?.noul;
  const ask = a.asks_question?.noul;
  if (work === undefined || ask === undefined) return "unsettled";
  if (work >= cfg.yes || ask >= cfg.yes) return "full";
  if (work <= cfg.no && ask <= cfg.no) return "light";
  return "unsettled";
}

/** What a turn really was: light when it used no specialist and only the light tools (talking, reading). */
export function turnWeight(tools: string[], agents: string[], lightTools: string[]): "light" | "full" {
  return agents.length === 0 && tools.every((t) => lightTools.includes(t)) ? "light" : "full";
}
