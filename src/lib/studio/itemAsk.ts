// Every way a requirement enters and every move of an item asks for what is missing (Doug, Nov 20: "are
// the questions being asked by the agents, and are the skills truly being applied in every single case?").
//
// Plain rules decide which specialist looks at an item at each stage (no AI for that); Socra sends that
// specialist with the Agent tool and then asks the person the questions that would make the item clear,
// tied to the item (say with `about`), so they appear in the conversation AND in the item's detail view.
// What the turn really used (skills, specialists, tools) is recorded in AgentTurn and shown in the item's
// Traceability, so nobody has to take it on trust.

export type Stage = "said" | "captured" | "marked" | "accepted" | "working" | "queued" | "ready" | "building" | "review" | "done" | "back";

export type Specialist = { agent: string; name: string; why: string };

const SPECIALISTS = {
  ba: { agent: "business-analyst", name: "Business analyst", why: "pins down who uses it, what done looks like, and the rules and edge cases" },
  architect: { agent: "solution-architect", name: "Solution architect", why: "it touches data, integrations, sign-in, privacy or money" },
  engineer: { agent: "product-engineer", name: "Product engineer", why: "checks it is clear enough to build and where it fits the build" },
  ux: { agent: "ux-component-mapper", name: "UX/UI designer", why: "checks how it looks and works on screen before a person reviews it" },
  validator: { agent: "use-case-validator", name: "Business analyst (validator)", why: "checks it does what the card promised and what it unlocks" },
} as const satisfies Record<string, Specialist>;

const TECHNICAL = /\b(data|database|integrat\w*|api|import|export|sync\w*|sign[- ]?in|log[- ]?in|password|role|permission|secur\w*|privacy|personal data|gdpr|hipaa|payment|pay|price|invoice|refund|card|audit|upload|file|email|sms|notification|webhook|third[- ]party)\b/i;

/** Which specialist looks at an item at this stage. A fixed rule, so it is the same every time. */
export function specialistFor(stage: Stage, text: string): Specialist {
  if (stage === "building") return SPECIALISTS.engineer;
  if (stage === "review") return SPECIALISTS.ux;
  if (stage === "done") return SPECIALISTS.validator;
  if (TECHNICAL.test(text)) return SPECIALISTS.architect;
  return SPECIALISTS.ba;
}

const AGENTIC = /\b(agent\w*|automat\w*|workflow|remind\w*|notif\w*|alert\w*|recommend\w*|summar\w*|insight\w*|triage|route|chase|follow[- ]up)\b/i;

/**
 * Which skill from the library applies to an item at this stage (a fixed rule). studio-reimagine and
 * studio-muse are loaded into every turn already; these are the ones Socra opens with the Skill tool, so
 * using them is on the record.
 */
export function skillFor(stage: Stage, text: string): { skill: string; why: string } {
  if (AGENTIC.test(text)) return { skill: "studio-agentkit", why: "it may need an agentic workflow (AgentKit), so it is designed the Studio's way or kept as plain code" };
  if (stage === "building" || stage === "review" || stage === "done") return { skill: "working-backwards-studio", why: "keeps the card traceable from requirement to build to review" };
  return { skill: "studio-reimagine", why: "facilitate first, keep the proven floor, protect what makes this product different" };
}

/** What an item's own words don't say yet (a hint for Socra; Socra judges, the rule only points). */
export function missingDetail(text: string): string[] {
  const t = text.toLowerCase();
  const gaps: string[] = [];
  if (!/\b(user|customer|client|claimant|adjuster|admin|staff|owner|manager|member|visitor|buyer|seller|team|people|person|patient|driver|technician|agent|stylist|role|who|employee|guest|shopper)s?\b/.test(t)) gaps.push("who uses it, and at what moment");
  if (!/\b(so that|able to|can|done|accept\w*|criteria|should|must|then|result|outcome|see|get)\b/.test(t)) gaps.push('what "done" looks like for them');
  if (!/\b(if|unless|only|limit|rule|edge|exception|never|always|max\w*|min\w*|within|before|after|until|when|\d)\b/.test(t)) gaps.push("the rules, limits and edge cases");
  return gaps;
}

/**
 * The part of Socra's prompt that makes it bring the right specialist in and ask about the item. `node` is
 * the item (backlog:<id> or move:<id>); questions go out with say and about=[node] so they reach the item.
 */
export function itemAsk(o: { node: string; title: string; text: string; stage: Stage; by: string; extraNodes?: string[] }) {
  const s = specialistFor(o.stage, `${o.title} ${o.text}`);
  const gaps = missingDetail(`${o.title} ${o.text}`);
  const k = skillFor(o.stage, `${o.title} ${o.text}`);
  const about = JSON.stringify([o.node, ...(o.extraNodes ?? [])]);
  return [
    `Item: ${o.node} (“${o.title}”). Specialist for this stage: ${s.agent} (${s.name}: ${s.why}). Skill for this stage: ${k.skill} (${k.why}).`,
    `0. Open the ${k.skill} skill with the Skill tool and apply it to this item (also any switched-on library skill whose description fits it: open those with the Skill tool too, so what was applied is on the record).`,
    `1. Send \`${s.agent}\` with the Agent tool to look at this item now (tell it the item id and that it asks nothing itself); let it speak once with share_finding, about ${about}.`,
    gaps.length
      ? `2. Its words don't yet say: ${gaps.join("; ")}. Ask ${o.by} about what is really missing, at most three short questions, most important first, each with numbered options and one marked "(suggested)".`
      : `2. Check whether anything a builder would need is still missing (who uses it and when, what "done" looks like, the rules and edge cases). If something is, ask ${o.by} about it, at most three short questions with numbered options and one marked "(suggested)".`,
    `3. Every message about this item goes out with about ${about} (say, share_finding and signal take it), so it shows in the item's detail view as well as here. If nothing is missing, say so in one line with about ${about} and name what makes it clear. Never pass over an item in silence.`,
    `4. When they answer, write it into the item (the card's details and acceptance criteria, or the backlog item) and the spec sections it touches.`,
  ].join("\n");
}
