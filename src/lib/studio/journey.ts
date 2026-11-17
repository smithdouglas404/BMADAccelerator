// How far a use case has come, as one percentage, and the one step that moves it to the next one.
// Plain rules, no AI: each step is a fact about the product (a build exists, nothing waits on a person).
// Used by the use case's own screens and by the Home list, so both show the same number.

export type JourneyView = 'conversation' | 'pilot' | 'spec' | 'brief' | 'review' | 'validation'

export type JourneyInput = {
  userMessages: number
  openDecisions: number
  approvedDecisions: number
  /** New backlog items nobody has dealt with yet (the red markers on the Board). */
  needsYou: number
  /** PRD/TRD sections Socra inferred that a person has kept, revised or removed. */
  reviewedSections: number
  /** Inferred sections still waiting for a person. */
  unreviewedSections: number
  /** Cards past the Backlog that carry real detail (acceptance criteria). */
  detailedCards: number
  builds: number
  markups: number
  validationScore: number
}

export type JourneyStep = { key: string; label: string; done: boolean; weight: number; view: JourneyView; cta: string; why: string }

export function journey(j: JourneyInput): { percent: number; steps: JourneyStep[]; next: JourneyStep | null } {
  const steps: JourneyStep[] = [
    { key: 'describe', label: 'Describe what you need', weight: 10, done: j.userMessages >= 1, view: 'conversation', cta: 'Talk to Socra', why: 'Say in a few lines what the product should do and for whom.' },
    { key: 'answer', label: 'Answer Socra’s first questions', weight: 10, done: j.userMessages >= 3, view: 'conversation', cta: 'Answer', why: 'A number, a yes or your own words. Each answer becomes a requirement.' },
    { key: 'decide', label: 'Decide the open checkpoints', weight: 10, done: j.openDecisions === 0 && j.approvedDecisions >= 1, view: 'conversation', cta: 'Decide', why: j.openDecisions ? `${j.openDecisions} ${j.openDecisions === 1 ? 'decision waits' : 'decisions wait'} for a person: approve or reject.` : 'Approve at least one of Socra’s proposals.' },
    { key: 'triage', label: 'Deal with new backlog items', weight: 10, done: j.needsYou === 0, view: 'pilot', cta: 'Open the backlog', why: `${j.needsYou} new ${j.needsYou === 1 ? 'item is' : 'items are'} marked red on the Board: work on it, accept or reject.` },
    { key: 'spec', label: 'Review the requirements (PRD + TRD)', weight: 15, done: j.unreviewedSections === 0 || j.reviewedSections >= 3, view: 'spec', cta: 'Review', why: 'Socra inferred these sections. Keep, revise or remove a few so the build rests on your words.' },
    { key: 'ready', label: 'Get a card ready with detail', weight: 10, done: j.detailedCards >= 1, view: 'pilot', cta: 'Open the Board', why: 'Move a card to Ready to shape and answer Socra’s questions, so the build has something clear to make.' },
    { key: 'build', label: 'Generate the prototype', weight: 20, done: j.builds >= 1, view: 'brief', cta: 'Generate', why: 'Claude Code builds a version you can click through.' },
    { key: 'try', label: 'Try it and mark it up', weight: 10, done: j.markups >= 1, view: 'review', cta: 'Try it', why: 'Click through the prototype and mark anything that should change.' },
    { key: 'prove', label: 'Prove the use case', weight: 5, done: j.validationScore >= 60, view: 'validation', cta: 'Validate', why: 'Confirm the signals that are still soft.' },
  ]
  const percent = Math.min(100, steps.filter((s) => s.done).reduce((n, s) => n + s.weight, 0))
  return { percent, steps, next: steps.find((s) => !s.done) ?? null }
}

/** A backlog item a person still has to deal with: new, not built, not parked, not already handled. */
export function needsTriage(b: { triage?: string; state: string; kind: string }) {
  return !b.triage && b.state !== 'built' && b.kind !== 'distraction'
}

/** A card has real detail when its details or acceptance criteria say more than a line. */
export const hasDetail = (prompt: string) => prompt.trim().length >= 80

/** Days since anything happened on a use case; a use case quiet for this long is flagged on Home. */
export const IDLE_DAYS = 3
export function idleDays(updatedAt: string | Date, now = Date.now()) {
  return Math.floor((now - new Date(updatedAt).getTime()) / 86_400_000)
}
