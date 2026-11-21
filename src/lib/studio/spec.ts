// The living specification: the PRD and TRD sections, their states, explainable readiness and diffs.
// Pure (no "@/" imports) so tests can load it directly.

export type SpecTab = "prd" | "trd";
export type SpecBasis = "confirmed" | "recommended" | "inferred" | "open" | "not-researched";
export type SpecStatus =
  | "draft"
  | "exploring"
  | "evidence-backed"
  | "owner-approved"
  | "engineer-reviewed"
  | "ready-prototype"
  | "ready-pilot"
  | "production-ready";
export type SpecReview = "" | "keep" | "revise" | "challenge" | "remove";
export type TraceType = "conversation" | "evidence" | "annotation" | "inference" | "backlog" | "execution";
export type TraceStep = { label: string; detail: string; type: TraceType };

type Def = { key: string; title: string; kicker: string };

export type SpecDef = Def & { tab: SpecTab; ref: string; position: number };

/** A Markdown table under "## <title>" in a skill, as rows of trimmed cells (header row dropped). */
export function skillTable(skillMd: string, title: string): string[][] {
  const lines = skillMd.split("\n");
  const at = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (at < 0) return [];
  const end = lines.findIndex((l, i) => i > at && /^## /.test(l));
  return lines
    .slice(at + 1, end < 0 ? undefined : end)
    .filter((l) => /^\s*\|/.test(l) && !/^[\s|:-]+$/.test(l))
    .slice(1)
    .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((c) => /^[a-z0-9-]+$/.test(c[0] ?? ""));
}

/**
 * The sections of the PRD or TRD, in reading order, from the "## Sections" table of its skill (studio-prd,
 * studio-trd). No section list lives in code (Doug, Nov 20: no hard code). Refs are plain: "PRD 1", "TRD 4".
 */
export function specSectionsFrom(skillMd: string, tab: SpecTab): SpecDef[] {
  return skillTable(skillMd, "Sections")
    .filter((c) => c.length >= 3)
    .map(([key, title, kicker], i) => ({ key, title, kicker, tab, ref: `${tab.toUpperCase()} ${i + 1}`, position: i }));
}

export const specDefsFrom = (prdSkill: string, trdSkill: string): SpecDef[] => [...specSectionsFrom(prdSkill, "prd"), ...specSectionsFrom(trdSkill, "trd")];

export type SpecWalkStep = { key: string; asker: string; ask: string; bar: string; informs: string[] };

/** The guided walkthrough's questions: who asks, the question, its bar, and the sections the answer also informs. */
export function specWalkFrom(skillMd: string): SpecWalkStep[] {
  return skillTable(skillMd, "Walkthrough")
    .filter((c) => c.length >= 4)
    .map(([key, asker, ask, bar, informs = ""]) => ({ key, asker, ask, bar, informs: informs.split(/[,\s]+/).filter((k) => /^[a-z0-9-]+$/.test(k)) }));
}

/** A "## <title>" section of a skill, as Markdown. */
export function skillPart(skillMd: string, title: string) {
  const lines = skillMd.split("\n");
  const at = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && /^## /.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n").trim();
}

export const SPEC_BASIS: { key: SpecBasis; label: string }[] = [
  { key: "confirmed", label: "Confirmed" },
  { key: "recommended", label: "Recommended" },
  { key: "inferred", label: "Inferred" },
  { key: "open", label: "Open decision" },
  { key: "not-researched", label: "Not yet researched" },
];

export const SPEC_STATUSES: { key: SpecStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "exploring", label: "Being explored" },
  { key: "evidence-backed", label: "Evidence-backed" },
  { key: "owner-approved", label: "Owner approved" },
  { key: "engineer-reviewed", label: "Engineer reviewed" },
  { key: "ready-prototype", label: "Ready for prototype" },
  { key: "ready-pilot", label: "Ready for pilot" },
  { key: "production-ready", label: "Production-ready" },
];

export const SPEC_REVIEWS: { key: Exclude<SpecReview, "">; label: string; hint: string }[] = [
  { key: "keep", label: "Keep", hint: "This is right." },
  { key: "revise", label: "Revise", hint: "Close, but change it." },
  { key: "challenge", label: "Challenge", hint: "I'm not sure this is true." },
  { key: "remove", label: "Remove", hint: "This doesn't belong." },
];

export const TRACE_TYPES: TraceType[] = ["conversation", "evidence", "annotation", "inference", "backlog", "execution"];

export const isBasis = (s: string): s is SpecBasis => SPEC_BASIS.some((b) => b.key === s);
export const isStatus = (s: string): s is SpecStatus => SPEC_STATUSES.some((b) => b.key === s);
export const isReview = (s: string): s is SpecReview => s === "" || SPEC_REVIEWS.some((b) => b.key === s);

export function cleanTrace(steps: unknown): TraceStep[] {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((s) => s as Partial<TraceStep>)
    .filter((s) => s && typeof s.label === "string" && typeof s.detail === "string")
    .map((s) => ({ label: s.label!.slice(0, 80), detail: s.detail!.slice(0, 400), type: TRACE_TYPES.includes(s.type as TraceType) ? (s.type as TraceType) : "inference" }))
    .slice(-24);
}

type SectionLike = { tab: string; key: string; ref?: string; position?: number; title: string; content: string; completeness: number; basis: string; status: string; review?: string; confidence?: string };

/** Completeness of one tab. A removed section still counts (as zero): the owner can see the gap. */
export function tabCompleteness(sections: SectionLike[], tab: SpecTab): number {
  const mine = sections.filter((s) => s.tab === tab);
  if (!mine.length) return 0;
  const total = mine.reduce((sum, s) => sum + Math.max(0, Math.min(100, s.completeness ?? 0)), 0);
  return Math.round(total / mine.length);
}

const APPROVED: SpecStatus[] = ["owner-approved", "engineer-reviewed", "ready-prototype", "ready-pilot", "production-ready"];

export type ReadinessFactor = { key: string; label: string; value: number; detail: string };

/**
 * Explainable readiness: not one opaque number, but the factors behind it. Each is 0-100 with a plain
 * sentence, so the owner sees what to work on next.
 */
export function explainReadiness(input: {
  sections: SectionLike[];
  evidenceCount: number;
  decisions: { status: string }[];
  validation: number;
  capabilities: { readiness: number }[];
  movesTotal: number;
  movesDone: number;
}): { overall: number; factors: ReadinessFactor[] } {
  const { sections } = input;
  const prd = tabCompleteness(sections, "prd");
  const trd = tabCompleteness(sections, "trd");
  const all = sections.filter((s) => s.review !== "remove");
  const evidenced = all.filter((s) => s.basis === "confirmed" || s.status === "evidence-backed" || APPROVED.includes(s.status as SpecStatus)).length;
  const evidenceCoverage = all.length ? Math.round((evidenced / all.length) * 100) : 0;
  const open = input.decisions.filter((d) => d.status === "open").length;
  const decided = input.decisions.filter((d) => d.status === "approved").length;
  const decisionsScore = input.decisions.length ? Math.round((decided / input.decisions.length) * 100) : 0;
  const acceptance = sections.find((s) => s.key === "prd-acceptance");
  const approvals = all.length ? Math.round((all.filter((s) => APPROVED.includes(s.status as SpecStatus)).length / all.length) * 100) : 0;
  const risks = sections.filter((s) => (s.key === "prd-risks" || s.key === "trd-risks" || s.key === "trd-hardening") && s.basis !== "confirmed").length;
  const capability = input.capabilities.length ? Math.round(input.capabilities.reduce((a, c) => a + c.readiness, 0) / input.capabilities.length) : 0;
  const prototype = input.movesTotal ? Math.round((input.movesDone / input.movesTotal) * 100) : 0;
  const factors: ReadinessFactor[] = [
    { key: "capabilities", label: "Capability floor", value: capability, detail: "How much of what the leading products have is shaped and confirmed." },
    { key: "prd", label: "PRD completeness", value: prd, detail: `${sections.filter((s) => s.tab === "prd" && s.completeness >= 60).length} of ${sections.filter((s) => s.tab === "prd").length} product sections are well formed.` },
    { key: "trd", label: "TRD completeness", value: trd, detail: `${sections.filter((s) => s.tab === "trd" && s.completeness >= 60).length} of ${sections.filter((s) => s.tab === "trd").length} technical sections are well formed.` },
    { key: "evidence", label: "Evidence coverage", value: evidenceCoverage, detail: `${input.evidenceCount} sources; ${evidenced} sections are backed by evidence or an approval.` },
    { key: "validation", label: "Use case validation", value: input.validation, detail: "Problem, customer, evidence, proof point and thin slice." },
    { key: "decisions", label: "Decisions made", value: decisionsScore, detail: open ? `${open} decision${open === 1 ? "" : "s"} only you can make ${open === 1 ? "is" : "are"} still open.` : "No open decisions." },
    { key: "acceptance", label: "Acceptance criteria", value: acceptance?.completeness ?? 0, detail: acceptance?.content ? "Written; the proof of value can be checked." : "Not written yet: what proves the promise?" },
    { key: "approvals", label: "Human approval coverage", value: approvals, detail: "Sections you or the engineer approved." },
    { key: "prototype", label: "Prototype coverage", value: prototype, detail: input.movesTotal ? `${input.movesDone} of ${input.movesTotal} build moves are in review or done.` : "No build moves yet." },
    { key: "risks", label: "Risks resolved", value: risks === 0 ? 100 : Math.max(0, 100 - risks * 34), detail: risks ? `${risks} risk or hardening section${risks === 1 ? "" : "s"} still unresolved.` : "Known risks are answered." },
  ];
  // The pilot score leans on what the owner sees most: capabilities, PRD, validation and decisions.
  const weights: Record<string, number> = { capabilities: 3, prd: 2, trd: 1, evidence: 1, validation: 2, decisions: 1, acceptance: 1, approvals: 1, prototype: 1, risks: 0.5 };
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0);
  const overall = Math.round(factors.reduce((a, f) => a + f.value * (weights[f.key] ?? 0), 0) / wsum);
  return { overall, factors };
}

export type SpecSnapshot = { key: string; ref: string; tab: string; title: string; content: string; basis: string; status: string; review: string }[];

/** The plain-words diff between two spec versions, for SPEC_DIFF.md and the version history. */
export function specDiff(prev: SpecSnapshot, next: SpecSnapshot): string {
  const before = new Map(prev.map((s) => [s.key, s]));
  const lines: string[] = [];
  for (const s of next) {
    const p = before.get(s.key);
    const name = `${s.ref ? `${s.ref} ` : ""}${s.title}`;
    if (!p || (!p.content && s.content)) {
      if (s.content) lines.push(`- Added: ${name}`);
      continue;
    }
    if (s.review === "remove" && p.review !== "remove") lines.push(`- Removed by the owner: ${name}`);
    else if (p.content !== s.content) lines.push(`- Changed: ${name}`);
    if (p.basis !== s.basis) lines.push(`- ${name}: ${label(SPEC_BASIS, p.basis)} → ${label(SPEC_BASIS, s.basis)}`);
    if (p.status !== s.status) lines.push(`- ${name}: ${label(SPEC_STATUSES, p.status)} → ${label(SPEC_STATUSES, s.status)}`);
  }
  return lines.length ? lines.join("\n") : "- No changes to the specification since the last version.";
}

function label(list: { key: string; label: string }[], k: string) {
  return list.find((x) => x.key === k)?.label ?? k;
}

/** The PRD or TRD as markdown, for the package (the design team's shape: a section per heading, then its metadata). */
export function specMarkdown(sections: SectionLike[], tab: SpecTab, productName: string): string {
  const defs = sections.filter((s) => s.tab === tab).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const by = new Map(defs.map((s) => [s.key, s]));
  const head = `# ${tab === "prd" ? "Product requirements" : "Technical requirements"}\n\n${productName}: living ${tab.toUpperCase()}, ${tabCompleteness(sections, tab)}% complete. Each section says whether it is Confirmed, Recommended, Inferred, an Open decision, or Not yet researched.\n`;
  const body = defs.map((d) => {
    const s = by.get(d.key);
    if (!s || !s.content || s.review === "remove") {
      return `## ${d.title}\n\n_${s?.review === "remove" ? "Removed by the owner." : "Not yet researched."}_\n\nCompleteness: 0% · ${s?.review === "remove" ? "Removed" : "Not yet researched"}${s?.ref ? ` · ${s.ref}` : ""}\n`;
    }
    return `## ${d.title}\n\n${s.content}\n\nCompleteness: ${s.completeness}% · ${s.status} · ${s.confidence ?? "open"} confidence · ${label(SPEC_BASIS, s.basis)}${s.ref ? ` · ${s.ref}` : ""}\n`;
  });
  return [head, ...body].join("\n");
}
