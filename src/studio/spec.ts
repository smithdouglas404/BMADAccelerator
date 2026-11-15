export type SpecTab = 'prd' | 'trd'
export type SpecStatus = 'draft' | 'exploring' | 'evidence-backed' | 'owner-approved' | 'engineer-reviewed'

export interface SpecTraceStep {
  label: string
  detail: string
  type: 'conversation' | 'evidence' | 'annotation' | 'inference' | 'backlog' | 'execution'
}

export interface SpecSection {
  id: string
  tab: SpecTab
  title: string
  kicker: string
  content: string
  completeness: number
  confidence: 'high' | 'medium' | 'open'
  status: SpecStatus
  source: string
  related: string[]
  trace: SpecTraceStep[]
}

export const specSections: SpecSection[] = [
  {
    id: 'prd-use-case', tab: 'prd', title: 'Validated use case', kicker: 'Product truth',
    content: 'Turn an unfinished product thought into a confident next move, without forcing the owner to write a ticket before the meaning is clear.',
    completeness: 92, confidence: 'high', status: 'evidence-backed', source: 'Working session + Muse conversation', related: ['idea-1', 'build-1'],
    trace: [
      { label: 'Conversation', detail: '“I want one clear next move.”', type: 'conversation' },
      { label: 'Evidence', detail: 'Founder interview confirms context is lost between the walk and the desk.', type: 'evidence' },
      { label: 'Muse inference', detail: 'A held thought should become a next move, not a ticket.', type: 'inference' },
      { label: 'Backlog', detail: 'Voice capture becomes a held thought', type: 'backlog' },
      { label: 'Execution', detail: 'build-1 · Claude Code · thin slice', type: 'execution' },
    ],
  },
  {
    id: 'prd-primary-flow', tab: 'prd', title: 'Primary customer flow', kicker: 'Experience shape',
    content: 'Capture a thought by voice or text → let Muse reflect the meaning → answer one probing question → approve or revise the proposed next move → keep the original words beside the curated version.',
    completeness: 78, confidence: 'medium', status: 'exploring', source: 'Vibe annotation + Muse probing', related: ['idea-4', 'recommendation-3'],
    trace: [
      { label: 'Annotation', detail: 'Circle region on Thought input: “Make this feel less like a form.”', type: 'annotation' },
      { label: 'Muse inference', detail: 'Reduce context switching and ask only one question at a time.', type: 'inference' },
      { label: 'Backlog', detail: 'Keep original words beside the curated version', type: 'backlog' },
    ],
  },
  {
    id: 'prd-acceptance', tab: 'prd', title: 'Acceptance criteria', kicker: 'Proof of value',
    content: 'A first-time product owner can move from a half-formed thought to an approved, traceable thin-slice decision in one session, without learning ticket vocabulary.',
    completeness: 61, confidence: 'medium', status: 'draft', source: 'Validation checklist', related: ['build-2'],
    trace: [
      { label: 'Validation', detail: 'Problem, customer, evidence, and thin-slice signals are present.', type: 'evidence' },
      { label: 'Open question', detail: 'What is the smallest customer-visible proof of value?', type: 'inference' },
      { label: 'Execution', detail: 'Group three related thoughts into one capability', type: 'execution' },
    ],
  },
  {
    id: 'prd-edge-cases', tab: 'prd', title: 'Edge cases and non-goals', kicker: 'Boundaries',
    content: 'Voice capture may be incomplete, contradictory, or intentionally parked. The Studio must preserve the signal, expose uncertainty, and avoid creating external work until the owner has shaped it.',
    completeness: 44, confidence: 'open', status: 'draft', source: 'Muse recommendation · human decision open', related: ['idea-3'],
    trace: [
      { label: 'Recommendation', detail: 'Ask how parked thoughts should resurface.', type: 'inference' },
      { label: 'Backlog', detail: 'A beautiful export for the team offsite — parked, not deleted.', type: 'backlog' },
    ],
  },
  {
    id: 'trd-system', tab: 'trd', title: 'System context', kicker: 'Technical boundary',
    content: 'A conversational Studio owns product truth and projects curated intent into prototype generation, a Git handoff, and optional Linear synchronization. External systems remain projections, not sources of meaning.',
    completeness: 70, confidence: 'medium', status: 'engineer-reviewed', source: 'Technical interpretation', related: ['build-4'],
    trace: [
      { label: 'Product decision', detail: 'Studio remains the conversational source of truth.', type: 'conversation' },
      { label: 'Agent route', detail: 'capture → probe → curate → generate', type: 'inference' },
      { label: 'Execution', detail: 'Decide when a capability is ready for beta', type: 'execution' },
    ],
  },
  {
    id: 'trd-data', tab: 'trd', title: 'Data and state transitions', kicker: 'Durable model',
    content: 'Persist the use case, evidence, inference, decision, backlog, annotation, spec revision, and generated artifact as linked records. Every transformation keeps its source and confidence.',
    completeness: 53, confidence: 'medium', status: 'exploring', source: 'Backlog + package contract', related: ['idea-2', 'idea-4'],
    trace: [
      { label: 'Package', detail: 'BACKLOG.json and VISUAL_ANNOTATIONS.json already preserve source context.', type: 'annotation' },
      { label: 'Inference', detail: 'A requirement can be inferred without being approved.', type: 'inference' },
    ],
  },
  {
    id: 'trd-agents', tab: 'trd', title: 'Agent and human boundaries', kicker: 'Orchestration',
    content: 'AgentKit routes discovery, probing, curation, and generation. The owner remains the authority for meaning changes, scope, external synchronization, and production hardening.',
    completeness: 66, confidence: 'high', status: 'evidence-backed', source: 'AgentKit routing + human register', related: ['build-3'],
    trace: [
      { label: 'AgentKit', detail: 'Routes are visible as calm supporting context.', type: 'inference' },
      { label: 'Human decision', detail: 'One production-hardening decision remains open.', type: 'conversation' },
      { label: 'Execution', detail: 'Protect original language in the living PRFAQ', type: 'execution' },
    ],
  },
  {
    id: 'trd-hardening', tab: 'trd', title: 'Production hardening', kicker: 'Not yet researched',
    content: 'Authentication, retention, observability, performance, security, test strategy, deployment environments, and connector conflict handling still require explicit decisions before production.',
    completeness: 28, confidence: 'open', status: 'draft', source: 'Maturity assessment', related: [],
    trace: [
      { label: 'Gap', detail: 'The current prototype uses local UI state and mock integrations.', type: 'inference' },
      { label: 'Next question', detail: 'Which external data should be durable, private, or disposable?', type: 'conversation' },
    ],
  },
]
