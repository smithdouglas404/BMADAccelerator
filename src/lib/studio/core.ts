// The Agentic Working Backwards Studio's own rules, as plain functions (no database, no network),
// so they can be tested directly (tests/studio.test.mjs).

export type ViewId = "overview" | "conversation" | "validation" | "product" | "evidence" | "readiness" | "brief" | "pilot" | "connections";

export const VIEWS: { id: ViewId; label: string; hint: string; title: string }[] = [
  { id: "overview", label: "Whole product", hint: "See the shape", title: "Whole product" },
  { id: "conversation", label: "Work with Muse", hint: "Move the idea", title: "Work with Muse" },
  { id: "validation", label: "Validate use case", hint: "Test the proof", title: "Validate use case" },
  { id: "product", label: "Product shape", hint: "Living PRFAQ", title: "Product shape" },
  { id: "evidence", label: "Evidence & signals", hint: "Keep the why", title: "Evidence & signals" },
  { id: "readiness", label: "Pilot readiness", hint: "Find the ceiling", title: "Pilot readiness" },
  { id: "brief", label: "Prototype brief", hint: "Prepare Claude Code", title: "Prototype brief" },
  { id: "pilot", label: "Make it real", hint: "Traceable moves", title: "Make it real" },
  { id: "connections", label: "Connections", hint: "Git & Linear", title: "Connections" },
];

/** Capability accents, in order: acid, blue, warm, lilac, then more for larger products. */
export const CAPABILITY_COLORS = ["#d7f58b", "#a9d8ff", "#f5c88a", "#d5b8ff", "#8fe3c8", "#ffb4a8", "#f2e38b", "#b8c4ff"];
export const colorFor = (i: number) => CAPABILITY_COLORS[((i % CAPABILITY_COLORS.length) + CAPABILITY_COLORS.length) % CAPABILITY_COLORS.length];

export const VALIDATION_SIGNALS = [
  { key: "problem", title: "The customer problem is specific", hint: "We know what feels broken before the product enters the room." },
  { key: "customer", title: "The first customer is named", hint: "The owner can describe who needs this now, not everyone who might want it." },
  { key: "evidence", title: "Evidence is attached to the claim", hint: "Conversation, research and uploaded notes point to the same pattern." },
  { key: "proof", title: "The proof point is observable", hint: "We can tell when the customer has felt the promise." },
  { key: "thinSlice", title: "A thin slice is possible", hint: "The first pilot can prove one meaningful customer moment." },
] as const;
export type ValidationKey = (typeof VALIDATION_SIGNALS)[number]["key"];
export type ValidationState = { state: "confirmed" | "probe" | "open"; note?: string };
export type Validation = Partial<Record<ValidationKey, ValidationState>>;

export function validationScore(v: Validation): number {
  const n = VALIDATION_SIGNALS.filter((s) => v[s.key]?.state === "confirmed").length;
  return Math.round((n / VALIDATION_SIGNALS.length) * 100);
}

/** The agent route the Studio shows (AgentKit-style routing, run on the owner's Claude plan). */
export const ROUTE_AGENTS = [
  { agent: "Muse / Interviewer", action: "Elicit product intent" },
  { agent: "Use Case Validator", action: "Test the proof point" },
  { agent: "UX / Component Mapper", action: "Suggest the product surface" },
  { agent: "Product Engineer", action: "Shape the pilot boundary" },
  { agent: "Business Analyst", action: "Pin down flows, rules and acceptance" },
  { agent: "Solution Architect", action: "Shape the system and its data" },
  { agent: "Domain Expert", action: "Bring the industry's practice and risks" },
] as const;

export const BOARD_COLUMNS = [
  { status: "queued", title: "Backlog", hint: "Worth holding" },
  { status: "ready", title: "Ready to shape", hint: "Promise is clear" },
  { status: "building", title: "Being made real", hint: "Agent + human in motion" },
  { status: "review", title: "Human review", hint: "Decide what ships" },
] as const;

const AFFIRM =
  /^\s*(yes|yep|yeah|yup|sure|ok(ay)?|absolutely|definitely|exactly|correct|agreed|perfect|great|go ahead|do it|ship it|sounds good|that'?s (right|it)|that is (right|it)|love (it|that)|let'?s (do|go with) (it|that)|lets do it|keep (it|that)|approved?)\b/i;
const HEDGE = /\b(but|except|however|not sure|maybe|unless|although|instead|rather)\b/i;

/** "Every time you say yes, it's automatically an approval": a plain affirmative, without a hedge. */
export function isAffirmative(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 280) return false;
  return AFFIRM.test(t) && !HEDGE.test(t);
}

/** What a "yes" approves: the Muse's last proposal (its last question or sentence). */
export function proposalFrom(museText: string): string {
  const t = museText.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const q = [...sentences].reverse().find((s) => s.endsWith("?"));
  const pick = q ?? sentences[sentences.length - 1];
  return pick
    .replace(/^(so|and|then|ok|okay|good|great)[,\s]+/i, "")
    .replace(/^(should|shall|do you want|would you like|can) (we|i|it|the product)\s+/i, "")
    .replace(/\?$/, "")
    .trim()
    .slice(0, 300);
}

export const clip = (s: string, n = 58) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export type FloorItem = { id: string; text: string; state: "confirmed" | "assumed" | "out" };

/** Floor items keep their id for life; new ones get the next number for the use case. */
export function numberItems(items: { id?: string; text: string; state?: string }[], seq: number): { items: FloorItem[]; seq: number } {
  const out: FloorItem[] = [];
  for (const it of items) {
    const text = it.text.trim();
    if (!text) continue;
    let id = (it.id ?? "").trim().toUpperCase();
    if (!/^F\d+$/.test(id)) id = `F${++seq}`;
    const state = it.state === "confirmed" || it.state === "out" ? it.state : "assumed";
    out.push({ id, text, state });
  }
  return { items: out, seq };
}

/**
 * Readiness never goes down on its own: the floor is the minimum. A capability's ceiling moves with
 * what the owner confirmed and with the Muse's honest read; a "yes" carries it forward a little.
 */
export function bumpReadiness(current: number, approved: boolean): number {
  return Math.max(0, Math.min(100, current + (approved ? 4 : 1)));
}

export function overallReadiness(caps: { readiness: number }[]): number {
  if (!caps.length) return 0;
  return Math.round(caps.reduce((s, c) => s + c.readiness, 0) / caps.length);
}

/** The honest read: when to beta test. */
export function readinessRead(pct: number): { label: string; note: string } {
  if (pct >= 85) return { label: "ready for a beta", note: "Every capability can stand in front of real customers. Put it in their hands." };
  if (pct >= 65) return { label: "ready for a thin-slice pilot", note: "The promise is clear. A pilot with a few real customers is the next honest proof point." };
  if (pct >= 40) return { label: "shape is emerging", note: "The idea holds together. Keep shaping the weakest capability before a pilot." };
  return { label: "still discovering", note: "The product is still finding its promise. Keep talking; nothing needs to be a ticket yet." };
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "product"
  );
}

export const kindLabels: Record<string, string> = {
  capture: "new thought",
  epic: "capability signal",
  distraction: "parked for later",
};

export const recKindLabels: Record<string, string> = {
  consider: "Consider",
  workflow: "Agentic workflow",
  hitl: "Human decision",
};

/** The people who can work on a product. Several people share one product; each has a role. */
export const ROLES = ["Product owner", "Business analyst", "Product engineer", "UX/UI designer", "Architect", "Subject-matter expert", "Stakeholder"] as const;

/**
 * The Muse's specialists. The Muse leads; it brings these in visibly, and anyone on the product can
 * address one directly. `agent` is the team member that does the work (src/lib/agent/team.ts).
 * The domain expert is named for the product's field ("Claims expert") by the Muse.
 */
export const SPECIALISTS = [
  { key: "business-analyst", name: "Business analyst", agent: "business-analyst", focus: "requirements, flows, rules and acceptance" },
  { key: "architect", name: "Solution architect", agent: "solution-architect", focus: "system shape, data, integrations, security and scale" },
  { key: "engineer", name: "Product engineer", agent: "product-engineer", focus: "the pilot boundary, build moves, workflows and human checkpoints" },
  { key: "ux", name: "UX/UI designer", agent: "ux-component-mapper", focus: "screens, components, layout and the feel" },
  { key: "domain", name: "Domain expert", agent: "domain-expert", focus: "the industry's rules, practice and risks" },
] as const;
export type SpecialistKey = (typeof SPECIALISTS)[number]["key"];
export const specialistByKey = (k: string) => SPECIALISTS.find((s) => s.key === k);

/** A working name from the owner's first words, until the Muse names the product. */
export function workingName(description: string): string {
  const words = description
    .split(/[:.,;!?\n]|\s[-–—]\s/)[0]
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const skip = /^(a|an|the|i|we|my|our|want|wants|need|needs|to|build|make|create|for|that|which|where|app|tool|platform|something|some|like|it|is|its|of|and|with|let|lets|people)$/i;
  const kept = words.filter((w) => !skip.test(w)).slice(0, 3);
  const name = kept.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return name || "New product";
}

/** The numbered choices in a Muse message ("1. Calm entry", "2) Dashboard first"), in order. */
export function numberedOptions(text: string): { n: number; label: string }[] {
  const out: { n: number; label: string }[] = [];
  for (const line of text.split(/\n/)) {
    const m = line.match(/^\s*(?:\*\*)?(\d{1,2})[.)](?:\*\*)?\s+(.+?)\s*$/);
    if (m) out.push({ n: Number(m[1]), label: m[2].replace(/\*\*/g, "").trim() });
  }
  return out;
}

/** "2", "2 and 5", "1, 3" or "2. Calm entry": the option numbers someone picked, or null if it isn't a pick. */
export function pickedNumbers(content: string): number[] | null {
  const t = content.trim();
  const only = t.match(/^(?:option|options|number|numbers|#)?\s*(\d{1,2}(?:\s*(?:,|and|&|\+)\s*\d{1,2})*)\.?$/i);
  if (only) return [...new Set(only[1].split(/\s*(?:,|and|&|\+)\s*/i).map(Number))];
  const lead = t.match(/^(\d{1,2})[.)]\s+\S/);
  return lead ? [Number(lead[1])] : null;
}

/**
 * Spoken words as clean natural language, without changing what was said: fillers out, stutters and
 * repeated words collapsed, sentences capitalised and closed. The model-based clean-up does more;
 * this is the floor that always works.
 */
export function tidySpeech(text: string): string {
  let t = ` ${text.replace(/\s+/g, " ").trim()} `;
  t = t.replace(/[\s,]+\b(um+|uh+|erm+|er|ah+|hmm+|you know|i mean|like,|sort of like|kind of like)\b(?=[\s,.!?])/gi, " ");
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  t = t.replace(/\s+([,.!?])/g, "$1").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  t = t.replace(/^,\s*/, "");
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  t = t.replace(/\bi\b/g, "I");
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t;
}
