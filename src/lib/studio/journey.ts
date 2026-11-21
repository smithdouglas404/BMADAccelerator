// How far a use case has come, as one percentage, and the one step that moves it to the next one.
// Plain rules, no AI: each step is a fact about the product (a build exists, nothing waits on a person).
// Used by the use case's own screens and by the Home list, so both show the same number.
// A step that is about questions is done only when every question in it is answered (Doug, Nov 21): until
// then it shows how many are answered of how many, and counts toward the percentage in proportion.

import { asksSomething } from '../notifyFormat.ts'

type Msg = { id: string; role: string; content: string; createdAt: string | Date; replyTo?: string | null }

/**
 * Socra's (and its specialists') questions, and how many a person has answered: a question is answered when
 * a person replied to it, or spoke after it before the next question came.
 */
export function questionTally(messages: Msg[]): { asked: number; answered: number } {
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const replied = new Set(sorted.filter((m) => m.role === 'user' && m.replyTo).map((m) => m.replyTo as string))
  let asked = 0
  let answered = 0
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]
    if ((m.role !== 'muse' && m.role !== 'agent') || !asksSomething(m.content)) continue
    asked++
    if (replied.has(m.id)) { answered++; continue }
    for (let k = i + 1; k < sorted.length; k++) {
      const n = sorted[k]
      // A reply to one particular question answers that one only.
      if (n.role === 'user' && (!n.replyTo || n.replyTo === m.id)) { answered++; break }
      if ((n.role === 'muse' || n.role === 'agent') && asksSomething(n.content)) break
    }
  }
  return { asked, answered }
}

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
  /** Questions Socra and the specialists asked, and how many a person answered (questionTally). */
  questionsAsked?: number
  questionsAnswered?: number
  /** Decisions a person already approved or rejected. */
  resolvedDecisions?: number
  /** Backlog items a person already accepted, worked on, deferred or rejected. */
  triagedItems?: number
}

export type JourneyStep = { key: string; label: string; done: boolean; weight: number; view: JourneyView; cta: string; why: string; progress?: { done: number; total: number; noun: string } }

export function journey(j: JourneyInput): { percent: number; steps: JourneyStep[]; next: JourneyStep | null } {
  const asked = j.questionsAsked ?? 0
  const answeredQ = Math.min(asked, j.questionsAnswered ?? 0)
  const resolved = j.resolvedDecisions ?? j.approvedDecisions
  const triaged = j.triagedItems ?? 0
  const steps: JourneyStep[] = [
    { key: 'describe', label: 'Describe what you need', weight: 10, done: j.userMessages >= 1, view: 'conversation', cta: 'Talk to Socra', why: 'Say in a few lines what the product should do and for whom.' },
    // Done only when every question asked so far has an answer (before any is asked, it waits for one).
    { key: 'answer', label: 'Answer Socra’s questions', weight: 10, done: asked > 0 && answeredQ >= asked, view: 'conversation', cta: 'Answer', why: asked > answeredQ ? `${asked - answeredQ} of ${asked} ${asked === 1 ? 'question waits' : 'questions wait'} for an answer: a number, a yes or your own words.` : 'A number, a yes or your own words. Each answer becomes a requirement.', progress: asked ? { done: answeredQ, total: asked, noun: 'answered' } : undefined },
    { key: 'decide', label: 'Decide the open checkpoints', weight: 10, done: j.openDecisions === 0 && resolved >= 1, view: 'conversation', cta: 'Decide', why: j.openDecisions ? `${j.openDecisions} of ${j.openDecisions + resolved} ${j.openDecisions === 1 ? 'decision waits' : 'decisions wait'} for a person: approve or reject.` : 'Approve at least one of Socra’s proposals.', progress: j.openDecisions + resolved ? { done: resolved, total: j.openDecisions + resolved, noun: 'decided' } : undefined },
    { key: 'triage', label: 'Deal with new backlog items', weight: 10, done: j.needsYou === 0, view: 'pilot', cta: 'Open the backlog', why: `${j.needsYou} new ${j.needsYou === 1 ? 'item is' : 'items are'} marked red on the Board: work on it, accept or reject.`, progress: j.needsYou + triaged ? { done: triaged, total: j.needsYou + triaged, noun: 'dealt with' } : undefined },
    { key: 'spec', label: 'Answer the PRD and TRD questions', weight: 15, done: j.unreviewedSections === 0 || j.reviewedSections >= 3, view: 'spec', cta: 'Review', why: 'Walk through the PRD and TRD questions, or keep, revise or remove what Socra inferred, so the build rests on your words.', progress: j.reviewedSections + j.unreviewedSections ? { done: j.reviewedSections, total: j.reviewedSections + j.unreviewedSections, noun: 'reviewed' } : undefined },
    { key: 'ready', label: 'Get a card ready with detail', weight: 10, done: j.detailedCards >= 1, view: 'pilot', cta: 'Open the Board', why: 'Move a card to Ready to shape and answer Socra’s questions, so the build has something clear to make.' },
    { key: 'build', label: 'Build the prototype', weight: 20, done: j.builds >= 1, view: 'brief', cta: 'Build', why: 'Claude Code builds a version you can click through.' },
    { key: 'try', label: 'Try it and mark it up', weight: 10, done: j.markups >= 1, view: 'review', cta: 'Try it', why: 'Click through the prototype and mark anything that should change.' },
    { key: 'prove', label: 'Prove the use case', weight: 5, done: j.validationScore >= 60, view: 'validation', cta: 'Validate', why: 'Confirm the signals that are still soft.' },
  ]
  // A step counts in full when done, and in proportion to its answered share while it isn't.
  const percent = Math.min(100, Math.round(steps.reduce((n, s) => n + (s.done ? s.weight : s.progress && s.progress.total ? (s.weight * s.progress.done) / s.progress.total : 0), 0)))
  return { percent, steps, next: steps.find((s) => !s.done) ?? null }
}

/** A backlog item a person still has to deal with: new, not built, not parked, not already handled. */
export function needsTriage(b: { triage?: string; state: string; kind: string; deferUntil?: string | Date | null }) {
  const now = new Date()
  const back = b.triage === 'deferred' && !!b.deferUntil && new Date(b.deferUntil) <= now
  return (!b.triage || back) && b.state !== 'built' && b.kind !== 'distraction'
}

/** A deferred item that is still waiting for its day (it keeps its place, greyed). */
export function deferredUntil(b: { triage?: string; deferUntil?: string | Date | null }): Date | null {
  const now = new Date()
  if (b.triage !== 'deferred') return null
  const d = b.deferUntil ? new Date(b.deferUntil) : null
  return d && d > now ? d : d ? null : new Date(8.64e15)
}

/** "Mon, Dec 3" for a defer date. */
export const dayLabel = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** A card has real detail when its details or acceptance criteria say more than a line. */
export const hasDetail = (prompt: string) => prompt.trim().length >= 80

/** Days since anything happened on a use case; a use case quiet for this long is flagged on Home. */
export const IDLE_DAYS = 3
export function idleDays(updatedAt: string | Date, now = Date.now()) {
  return Math.floor((now - new Date(updatedAt).getTime()) / 86_400_000)
}
