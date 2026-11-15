// The expert-advisor rules the tools enforce (see bmad-module/bacc-expert-advisor/SKILL.md).
// Kept free of imports so it can be tested on its own (tests/advisor-gates.test.mjs).

// Agents that never need advice before they start: the concierge itself, BMAD's guide and Generate.
export const ADVICE_EXEMPT = ["concierge", "bmad", "generator"];

export const ADVISOR_SKILL = "bacc-expert-advisor";
export const AGENTIC_SKILL = "bacc-agentic-advisor";
export const AGENTIC_MAP = "bacc/advisor/agentic-map.md";
// The coded options catalogue: everything the client could pick, each with a number that never changes.
export const OPTIONS_CATALOGUE = "bacc/design/options.md";
export const PICKS_FILE = "bacc/design/picks.md";
// The product floor (bacc-floor skill): everything this kind of product has, written right after intake.
export const FLOOR_FILE = "bacc/floor.md";
export const FLOOR_SKILL = "bacc-floor";

// Returns why set_stage must refuse, or "" when the handover may go ahead.
// Once per agent per use case: the first handover to each BMAD agent waits for advice.
// Winston (architect) also waits for the agentic map (bacc-agentic-advisor skill).
// Sally also waits for the options catalogue, so the client can pick by number.
export function stageGateBlock(opts: {
  agent: string;
  advised: boolean;
  conceptExists: boolean;
  agenticMapExists?: boolean;
  optionsExists?: boolean;
  floorExists?: boolean;
}) {
  const { agent, advised, conceptExists, agenticMapExists = false, optionsExists = false, floorExists = true } = opts;
  if (ADVICE_EXEMPT.includes(agent)) return "";
  const steps: string[] = [];
  if (!floorExists)
    steps.push(
      `write ${FLOOR_FILE}, the product floor (load the ${FLOOR_SKILL} skill): the category, the leading products, everything this kind of product has, and the gap questions, and register it`,
    );
  if (!advised)
    steps.push(
      `call mcp__bacc__advise for "${agent}" with two or three ideas for this use case (load the ${ADVISOR_SKILL} skill, section 1) and offer the best to the client`,
    );
  if (agent === "ux" && !conceptExists)
    steps.push(`write bacc/design/concept.md, the design concept for Sally (${ADVISOR_SKILL} skill, section 2), and register it for the client's approval`);
  if (agent === "ux" && !optionsExists)
    steps.push(
      `write ${OPTIONS_CATALOGUE}, the numbered options catalogue (${ADVISOR_SKILL} skill, section 2a): every layout, component style, animation, type, colour, imagery and feature option worth showing, each with a code number, register it for the client and ask which numbers they like`,
    );
  if (agent === "architect" && !agenticMapExists)
    steps.push(
      `write ${AGENTIC_MAP}, the agentic map (load the ${AGENTIC_SKILL} skill): candidate AI agents and people in the loop traced to the documents, designed in Inngest AgentKit terms, and register it for the client's approval; ask the client its questions one at a time`,
    );
  if (!steps.length) return "";
  return `Not handed over yet. As the client's expert advisor, first ${steps.join("; then ")}. Then call set_stage again.`;
}

// A sign-off review must be a real view of the document, not a placeholder.
export function signoffReviewProblem(review: string) {
  const text = review.trim();
  if (text.length < 60) return `advisor_review is too short. Read the document as a senior architect or design lead would (${ADVISOR_SKILL} skill, section 3) and give your verdict and what you'd change, with reasons.`;
  return "";
}

// Advisor documents the client must approve, whatever review flag the agent passes.
export const CLIENT_APPROVES = ["bacc/design/concept.md", "bacc/design/components.md", AGENTIC_MAP, OPTIONS_CATALOGUE];
export function mustReview(relPath: string) {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  return CLIENT_APPROVES.includes(p);
}

export function adviceFileName(agent: string, when: Date) {
  return `${agent}-${when.toISOString().replace(/[:.]/g, "-")}.md`;
}

export type Gap = { question: string; why: string };

export function adviceMarkdown(agent: string, ideas: { idea: string; why: string; source: string }[], when: Date, gaps: Gap[] = [], noGapsReason = "") {
  const gapText = gaps.length
    ? `\n## What's missing: questions for the client\n\n${gaps.map((g, n) => `${n + 1}. ${g.question}\n   - Why it matters here: ${g.why}`).join("\n")}\n`
    : noGapsReason
      ? `\n## What's missing\n\nNothing found: ${noGapsReason}\n`
      : "";
  return `# Advice for ${agent}, ${when.toISOString()}\n\n${ideas.map((i, n) => `${n + 1}. **${i.idea}**\n   - Why: ${i.why}\n   - From: ${i.source}`).join("\n")}\n${gapText}`;
}

// Doug, Nov 15: "why am I using LLM credits if you're not coming back with a series of questions around what is absent".
// Advice for a BMAD agent must check what is missing: at least three questions, or a stated reason nothing is.
export function gapsProblem(agent: string, gaps: Gap[], noGapsReason: string) {
  if (ADVICE_EXEMPT.includes(agent)) return "";
  if (gaps.length >= 3) return "";
  if (gaps.length === 0 && noGapsReason.trim().length >= 40) return "";
  return 'Check what is missing before this agent starts (bacc-expert-advisor skill, "What\'s missing"): list at least three questions about things this kind of product needs that the documents and BMAD\'s questions have not covered, each with why it matters here. Only if you truly find nothing, leave gaps empty and give no_gaps_reason (what you compared against and why it is complete).';
}

// ---- Options catalogue: rows are "| <code> | <option> | ... |", codes are whole numbers, unique and permanent.
export type CatalogueItem = { code: number; name: string; retired: boolean };

export function catalogueItems(md: string): CatalogueItem[] {
  const items: CatalogueItem[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(\d{1,4})\s*\|\s*([^|]+?)\s*\|/);
    if (!m) continue;
    const raw = m[2];
    items.push({ code: Number(m[1]), name: raw.replace(/\s*\(retired\)\s*$/i, "").replace(/[*_~]/g, "").trim(), retired: /\(retired\)/i.test(raw) });
  }
  return items;
}

// Why a catalogue can't be registered, or "". `previous` is the last registered version: its codes keep their meaning.
export function catalogueProblems(md: string, previous = "") {
  const items = catalogueItems(md);
  const problems: string[] = [];
  if (items.length < 10) problems.push(`it lists ${items.length} options; show the client everything worth picking (at least 10, usually 20 to 40)`);
  const seen = new Set<number>();
  for (const i of items) {
    if (seen.has(i.code)) problems.push(`code ${i.code} is used twice`);
    seen.add(i.code);
  }
  const now = new Map(items.map((i) => [i.code, i]));
  for (const old of catalogueItems(previous)) {
    const cur = now.get(old.code);
    if (!cur) problems.push(`code ${old.code} (${old.name}) disappeared; keep it and mark it "(retired)" instead`);
    else if (cur.name.toLowerCase() !== old.name.toLowerCase())
      problems.push(`code ${old.code} was "${old.name}" and is now "${cur.name}"; codes never change meaning, give the new option the next free number`);
  }
  return problems.length ? `The options catalogue needs fixing: ${problems.join("; ")}.` : "";
}

// Splits the codes the client picked into known options and unknown or retired numbers.
export function resolvePicks(codes: number[], md: string) {
  const items = new Map(catalogueItems(md).map((i) => [i.code, i]));
  const picked: CatalogueItem[] = [];
  const unknown: number[] = [];
  for (const c of [...new Set(codes)]) {
    const it = items.get(c);
    if (it && !it.retired) picked.push(it);
    else unknown.push(c);
  }
  return { picked, unknown };
}

export function picksMarkdown(picked: CatalogueItem[], clientWords: string, when: Date) {
  return `\n## Picks, ${when.toISOString()}\n\nClient's words: "${clientWords.replace(/"/g, "'")}"\n\n${picked.map((p) => `- ${p.code}: ${p.name}`).join("\n")}\n`;
}

export const DESIGN_CONCEPT = "bacc/design/concept.md";

// Why a design concept can't be registered, or "". It must name the product category and the leading
// products it is measured against (Doug, Nov 15: "you should have assessed if they're selling something").
export function conceptProblems(md: string) {
  const problems: string[] = [];
  if (!/^\s*(#+\s*|\d+\.\s*\**\s*|\**)\s*(product )?(category|what kind of product)/im.test(md))
    problems.push('add point 0, "What kind of product this is": name its category (online shop, booking site, SaaS app...)');
  const links = new Set(md.match(/https?:\/\/[^\s)>\]]+/g) ?? []);
  if (links.size < 3) problems.push(`link the three leading products in that category you measured it against (found ${links.size} links)`);
  if (!/font|typeface/i.test(md)) problems.push("name the display and body fonts and why each fits the category and audience");
  if (!/client'?s? references|references from the client|brand and references/i.test(md))
    problems.push('add a "Client references" section: what the client gave when asked for brand guidelines or a template, sample screens, and sites they like (with what you took from each), or "none given" for each');
  return problems.length ? `The design concept needs fixing: ${problems.join("; ")}.` : "";
}

// The product floor: "- [assumed] ...", "- [confirmed] ...", "- [out] ..." items under "### Area" headings.
export type FloorItem = { area: string; state: "assumed" | "confirmed" | "out"; text: string };

export function floorItems(md: string): FloorItem[] {
  const out: FloorItem[] = [];
  let area = "";
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^###\s+(.+)/);
    if (h) {
      area = h[1].trim();
      continue;
    }
    if (/^##\s/.test(line)) area = "";
    const m = line.match(/^\s*[-*]\s*\[(assumed|confirmed|out)\]\s*(.+)/i);
    if (m && area) out.push({ area, state: m[1].toLowerCase() as FloorItem["state"], text: m[2].trim() });
  }
  return out;
}

function section(md: string, name: string) {
  const m = md.match(new RegExp(`^##\\s+${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "im"));
  return m ? m[1].trim() : "";
}

// Returns why the floor isn't ready, or "" when it is.
export function floorProblems(md: string) {
  const problems: string[] = [];
  if (!section(md, "Category")) problems.push('a "## Category" section naming what kind of product this is and its industry');
  const leaders = section(md, "Leading products").split(/\r?\n/).filter((l) => /^\s*([-*]|\d+\.)\s+\S/.test(l));
  if (leaders.length < 3) problems.push('"## Leading products" listing at least three real leading products, each with what it does best');
  const items = floorItems(md);
  const areas = new Set(items.map((i) => i.area));
  if (areas.size < 6) problems.push("the scaffold under at least six \"### Area\" headings (for a shop: catalogue, product page, basket and checkout, delivery and returns, trust and support, account, marketing, legal)");
  if (items.length < 30) problems.push(`at least 30 scaffold items marked [assumed], [confirmed] or [out] (found ${items.length}); a leading product has far more than a few`);
  const gaps = section(md, "Gap questions").split(/\r?\n/).filter((l) => /^\s*([-*]|\d+\.)\s+\S/.test(l));
  if (gaps.length < 5) problems.push('"## Gap questions": at least five questions the client hasn\'t answered, each with why it matters and a suggested answer');
  if (!section(md, "Ideas")) problems.push('an "## Ideas" section: what leading products do that this one could do better, or what nobody does yet');
  return problems.length ? `The product floor needs ${problems.join("; ")}.` : "";
}
