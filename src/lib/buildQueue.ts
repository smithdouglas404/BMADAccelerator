// What from the review queue goes into the next Generate run. No imports, so it can be tested directly.

export type QueueItem = {
  kind: string;
  title: string;
  detail: string;
  source: string;
  status: string; // open | approved | edited | answered | dismissed
  answer?: string;
  includeInBuild: boolean;
  builtInVersion: number;
  previousAnswer?: string;
  refinedAt?: string | Date | null;
};

// Card moves are board housekeeping and documents reach Generate as documents, so neither is a build decision.
const NOT_DECISIONS = new Set(["move", "document"]);

export const isBuildDecision = (kind: string) => !NOT_DECISIONS.has(kind);

// The tick a decision gets when the client resolves it: decisions go in, a put-off item doesn't.
export const defaultInclude = (status: string) => ["approved", "answered", "edited"].includes(status);

// Items the client ticked that no build has taken in yet.
export function pendingForBuild<T extends QueueItem>(items: T[]): T[] {
  return items.filter((r) => isBuildDecision(r.kind) && r.includeInBuild && r.builtInVersion === 0 && r.status !== "dismissed");
}

// One line per decision, for Generate's prompt.
export function decisionsForPrompt(items: QueueItem[]): string {
  return pendingForBuild(items)
    .map((r, i) => {
      const what = r.status === "open" ? "still open; the client wants it in this build, so use the most sensible answer and list it under Assumptions made" : r.answer?.trim() ? `the client said: "${r.answer.trim()}"` : "the client approved it as written";
      const refined = r.refinedAt && r.previousAnswer?.trim() ? ` (refined; earlier they said "${r.previousAnswer.trim()}", which no longer applies)` : r.refinedAt ? " (refined since an earlier build)" : "";
      return `${i + 1}. [${r.kind}] ${r.title}${r.detail ? `: ${r.detail}` : ""} (from ${r.source}). ${what[0].toUpperCase()}${what.slice(1)}${refined}.`;
    })
    .join("\n");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The sentence on the Generate button: what goes into the next version.
export function buildSummary(decisions: number, markups: number, nextVersion: number): string {
  if (!decisions && !markups) return `Nothing new is ticked for version ${nextVersion}; it builds from BMAD's documents.`;
  const parts = [decisions ? plural(decisions, "decision", "decisions") : "", markups ? plural(markups, "mark-up", "mark-ups") : ""].filter(Boolean);
  return `${parts.join(" and ")} ${decisions + markups === 1 ? "goes" : "go"} into version ${nextVersion}.`;
}
