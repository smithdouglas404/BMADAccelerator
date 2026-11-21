// Every specialist is an agent plus a skill (Doug, Nov 21): the skill lists the questions it asks of any
// product, area by area, and what "enough" means for each. The people's answers fill those areas in; when
// every area is covered (or assumed on purpose) the specialist stops asking. Nothing here is fixed content:
// the areas come from the skill files (the domain expert derives its own for the field) and the statuses
// only from what a specialist recorded about real answers.

export type Area = { key: string; label: string; enough: string };
export type CoverageStatus = "open" | "partly" | "covered" | "assumed";
export type CoverageRow = { specialist: string; area: string; label: string; status: string; note: string; updatedAt?: string | Date };
export type AreaState = Area & { status: CoverageStatus; note: string };
export type TeamMemberCoverage = { key: string; name: string; skill: string; areas: AreaState[]; done: number; total: number; complete: boolean };

export const COVERAGE_STATUSES: CoverageStatus[] = ["open", "partly", "covered", "assumed"];
const DONE = new Set<string>(["covered", "assumed"]);

/** The areas under "## Question areas" in a skill: lines like - `key` **Label**: Enough when ... */
export function parseAreas(md: string): Area[] {
  const section = md.split(/^## /m).find((s) => /^Question areas\b/.test(s));
  if (!section) return [];
  const out: Area[] = [];
  for (const m of section.matchAll(/^- `([a-z0-9-]+)` \*\*([^*]+)\*\*: (.+)$/gm)) out.push({ key: m[1], label: m[2].trim(), enough: m[3].trim() });
  return out;
}

const statusOf = (s: string): CoverageStatus => (COVERAGE_STATUSES.includes(s as CoverageStatus) ? (s as CoverageStatus) : "open");

/** Each specialist's areas (from its skill, plus any it recorded itself) with what the records say of them. */
export function coverageOf(team: { key: string; name: string; skill: string; areas: Area[] }[], rows: CoverageRow[]): TeamMemberCoverage[] {
  return team.map((t) => {
    const mine = rows.filter((r) => r.specialist === t.key);
    const areas: AreaState[] = t.areas.map((a) => {
      const r = mine.find((x) => x.area === a.key);
      return { ...a, status: r ? statusOf(r.status) : "open", note: r?.note ?? "" };
    });
    for (const r of mine) if (!areas.some((a) => a.key === r.area)) areas.push({ key: r.area, label: r.label || r.area, enough: "", status: statusOf(r.status), note: r.note });
    const done = areas.filter((a) => DONE.has(a.status)).length;
    return { key: t.key, name: t.name, skill: t.skill, areas, done, total: areas.length, complete: areas.length > 0 && done === areas.length };
  });
}

/** One line per specialist for a tooltip or a prompt: "3 of 8 answered; open: Business rules, Exceptions". */
export function coverageLine(c: TeamMemberCoverage): string {
  if (!c.total) return "No questions yet: it works out this field's areas the first time it joins in.";
  if (c.complete) return `All ${c.total} areas answered: it asks again only if something changes them.`;
  const open = c.areas.filter((a) => !DONE.has(a.status)).map((a) => (a.status === "partly" ? `${a.label} (partly)` : a.label));
  return `${c.done} of ${c.total} areas answered; still open: ${open.join(", ")}.`;
}

/**
 * The part of Socra's prompt that makes every specialist listen to every conversation and step in when the
 * words touch one of its open areas (Doug, Nov 21: "every agent is involved in every conversation. And
 * depending on what someone says, that agent more than likely is going to engage and ask questions").
 */
export function teamListens(cov: TeamMemberCoverage[], o: { agentOf: (key: string) => string; about?: string[]; msg?: string }) {
  const about = o.about?.length ? ` with about ${JSON.stringify(o.about)}` : "";
  const lines = cov.map((c) => `- ${c.key} (${c.name}; send \`${o.agentOf(c.key)}\`; its skill .claude/skills/${c.skill}/SKILL.md): ${coverageLine(c)}`);
  const all = cov.length > 0 && cov.every((c) => c.complete);
  return [
    `Your team listens to every conversation. Each specialist is an agent plus its own skill of questions; what each still has open:`,
    ...lines,
    all
      ? `Every specialist's areas are answered. Say once, in one line, that the product is clear enough to build and suggest Build; send a specialist only if these words change one of its answered areas.`
      : `Read these words against those open areas and send, in parallel in one message with the Agent tool, every specialist whose open areas they touch (usually one to three; none if nothing is touched; never one whose areas are all answered unless the words change them). Tell each one the words${o.msg ? ` (${o.msg})` : ""} and the item ids if any: it opens its own skill, records what the words settled, and asks its own one or two questions in its own name with share_finding${about}. The domain expert, the first time, also works out the field's areas. Don't ask again what a specialist asked: after they speak, connect it in one line or say nothing more.`,
    `If someone says that's enough questions (or "use your judgment"), send each specialist with open areas to record them as assumed with its suggested default, and say in one line what was assumed. Don't boil the ocean: enough to call it complete, not everything.`,
  ].join("\n");
}
