// The expert-advisor rules the tools enforce (see bmad-module/bacc-expert-advisor/SKILL.md).
// Kept free of imports so it can be tested on its own (tests/advisor-gates.test.mjs).

// Agents that never need advice before they start: the concierge itself, BMAD's guide and Generate.
export const ADVICE_EXEMPT = ["concierge", "bmad", "generator"];

export const ADVISOR_SKILL = "bacc-expert-advisor";

// Returns why set_stage must refuse, or "" when the handover may go ahead.
// Once per agent per use case: the first handover to each BMAD agent waits for advice.
export function stageGateBlock(opts: { agent: string; advised: boolean; conceptExists: boolean }) {
  const { agent, advised, conceptExists } = opts;
  if (ADVICE_EXEMPT.includes(agent)) return "";
  const steps: string[] = [];
  if (!advised)
    steps.push(
      `call mcp__bacc__advise for "${agent}" with two or three ideas for this use case (load the ${ADVISOR_SKILL} skill, section 1) and offer the best to the client`,
    );
  if (agent === "ux" && !conceptExists)
    steps.push(`write bacc/design/concept.md, the design concept for Sally (${ADVISOR_SKILL} skill, section 2), and register it for the client's approval`);
  if (!steps.length) return "";
  return `Not handed over yet. As the client's expert advisor, first ${steps.join("; then ")}. Then call set_stage again.`;
}

// A sign-off review must be a real view of the document, not a placeholder.
export function signoffReviewProblem(review: string) {
  const text = review.trim();
  if (text.length < 60) return `advisor_review is too short. Read the document as a senior architect or design lead would (${ADVISOR_SKILL} skill, section 3) and give your verdict and what you'd change, with reasons.`;
  return "";
}

export function adviceFileName(agent: string, when: Date) {
  return `${agent}-${when.toISOString().replace(/[:.]/g, "-")}.md`;
}

export function adviceMarkdown(agent: string, ideas: { idea: string; why: string; source: string }[], when: Date) {
  return `# Advice for ${agent}, ${when.toISOString()}\n\n${ideas.map((i, n) => `${n + 1}. **${i.idea}**\n   - Why: ${i.why}\n   - From: ${i.source}`).join("\n")}\n`;
}
