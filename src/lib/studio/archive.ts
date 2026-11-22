// Archiving a use case (Doug, Nov 22): any use case can be archived from its card in the list, with a closeout
// that is kept on it: 1. approved for production or rejected (with comments), 2. the estimated cost to
// implement, 3. the benefits and the metrics that must be tracked and delivered. Pure rules, no database.

export const ARCHIVE_OUTCOMES = ["approved", "rejected"] as const;
export type ArchiveOutcome = (typeof ARCHIVE_OUTCOMES)[number];

export type Closeout = { outcome: ArchiveOutcome | ""; comments: string; cost: string; benefits: string };

/**
 * THE ONE PLACE who may archive or restore a use case is decided. For now anyone may (Doug, Nov 22). When RBAC
 * arrives, only the use case's author may: change this to `return !!person && person === useCase.createdBy`
 * (plus whatever admin role is wanted). Every caller (the Studio's button, the Archived screen, the connector)
 * goes through here.
 */
export function canArchive(_person: string, _useCase: { createdBy: string }): boolean {
  return true;
}

/**
 * Checks what the person filled in. `required` is the form: a production decision is needed, and a rejection
 * needs its comments. The connector may archive without a closeout (required: false).
 */
export function checkCloseout(input: Partial<Record<keyof Closeout, unknown>>, required: boolean): { ok: true; closeout: Closeout } | { ok: false; error: string } {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const outcome = text(input.outcome, 20);
  if (outcome && !ARCHIVE_OUTCOMES.includes(outcome as ArchiveOutcome)) return { ok: false, error: "Say whether it was approved for production or rejected." };
  const closeout: Closeout = { outcome: outcome as Closeout["outcome"], comments: text(input.comments, 4000), cost: text(input.cost, 200), benefits: text(input.benefits, 6000) };
  if (required) {
    if (!closeout.outcome) return { ok: false, error: "Say whether it was approved for production or rejected." };
    if (closeout.outcome === "rejected" && !closeout.comments) return { ok: false, error: "A rejection needs its comments: say why." };
  }
  return { ok: true, closeout };
}

/** What an archived use case shows, in words (blank fields are said to be blank, never invented). */
export function closeoutSummary(c: Closeout): { decision: string; comments: string; cost: string; benefits: string } {
  return {
    decision: c.outcome === "approved" ? "Approved for production" : c.outcome === "rejected" ? "Rejected" : "No decision recorded",
    comments: c.comments || "No comments recorded",
    cost: c.cost || "No estimate recorded",
    benefits: c.benefits || "No benefits or metrics recorded",
  };
}
