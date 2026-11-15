export type ViewId = 'overview' | 'conversation' | 'validation' | 'product' | 'evidence' | 'spec' | 'readiness' | 'brief' | 'pilot' | 'connections'
export type MessageRole = 'muse' | 'user' | 'signal'
export type BacklogKind = 'capture' | 'epic' | 'distraction'

export interface Capability {
  id: string
  label: string
  kicker: string
  readiness: number
  delta: string
  description: string
  signal: string
  color: string
}

export interface ConversationMessage {
  id: string
  role: MessageRole
  label: string
  text: string
  time: string
  accent?: string
}

export interface BacklogItem {
  id: string
  title: string
  note: string
  kind: BacklogKind
  group: string
  source: string
  age: string
}

export interface ExecutionItem {
  id: string
  title: string
  capability: string
  decision: string
  status: 'queued' | 'ready' | 'building' | 'review'
  owner: string
  signal: string
}

export interface EvidenceItem {
  id: string
  source: string
  type: 'interview' | 'research' | 'uploaded' | 'conversation'
  insight: string
  confidence: 'high' | 'medium' | 'open'
  trace: string
}

export interface RecommendationItem {
  id: string
  title: string
  reason: string
  prompt: string
  capability: string
  kind: 'consider' | 'workflow' | 'hitl'
}

export const product = {
  name: 'Kite',
  category: 'Field notes → focused product moves',
  statement: 'A calm product companion that turns half-formed thoughts into the next right thing to build.',
  audience: 'Solo founders & small product teams',
  stage: 'Discovery → pilot',
  lastSaved: '2 min ago',
  customerQuote: '“I can finally see which of my ideas actually belong together.”',
}

export const capabilities: Capability[] = [
  {
    id: 'discovery',
    label: 'Discovery ritual',
    kicker: 'The first ten minutes',
    readiness: 92,
    delta: '+8 this week',
    description: 'The opening moment makes a raw idea feel safe to explore, not like a brief to complete.',
    signal: 'The product is clear about its promise. Keep the welcome human.',
    color: '#d7f58b',
  },
  {
    id: 'companion',
    label: 'Muse companion',
    kicker: 'The living conversation',
    readiness: 76,
    delta: '+14 this week',
    description: 'A conversational guide turns free-form thoughts into a sequence of useful product decisions.',
    signal: 'The next question is strong. Approval should feel like momentum, not a form.',
    color: '#a9d8ff',
  },
  {
    id: 'curation',
    label: 'Idea curation',
    kicker: 'Backlog → shape',
    readiness: 58,
    delta: '+5 this week',
    description: 'Captured thoughts need a visible home, a relationship to the product, and permission to be parked.',
    signal: 'Three notes want to become one capability. Let the Muse do the grouping.',
    color: '#f5c88a',
  },
  {
    id: 'pilot',
    label: 'Pilot handoff',
    kicker: 'Ready to make real',
    readiness: 34,
    delta: '+3 this week',
    description: 'Traceable, production-minded work can start before every question is answered.',
    signal: 'The shape is emerging. A thin-slice pilot is the next honest proof point.',
    color: '#d5b8ff',
  },
]

export const initialMessages: ConversationMessage[] = [
  {
    id: 'muse-1',
    role: 'muse',
    label: 'Muse · Product physician',
    text: 'You said you want Kite to make product work feel less like a queue and more like a clear next move. Let’s stay with that. When someone opens it with a half-formed thought, what should they feel ten minutes later?',
    time: '09:28',
    accent: '#d7f58b',
  },
  {
    id: 'user-1',
    role: 'user',
    label: 'You',
    text: 'Relieved. Like the idea has somewhere to go, even if it is not ready to become a ticket.',
    time: '09:31',
  },
  {
    id: 'signal-1',
    role: 'signal',
    label: 'Decision captured',
    text: 'Kite should make unfinished ideas feel held, not hurried. The Muse will protect the thought before it asks for a plan.',
    time: '09:31',
    accent: '#a9d8ff',
  },
  {
    id: 'muse-2',
    role: 'muse',
    label: 'Muse · Product physician',
    text: 'Good. I’m hearing the product promise underneath the feature list. If that feeling is the north star, which moment deserves the most care in the first pilot: capturing the thought, finding its pattern, or choosing what to make next?',
    time: '09:36',
    accent: '#d7f58b',
  },
]

export const initialBacklog: BacklogItem[] = [
  {
    id: 'idea-1',
    title: 'Let me leave a voice note while walking',
    note: 'Ambient capture · no context switch',
    kind: 'capture',
    group: 'Muse companion',
    source: 'Claude Duet / voice',
    age: '12m ago',
  },
  {
    id: 'idea-2',
    title: 'Show me which thoughts want to merge',
    note: 'Pattern finding across the backlog',
    kind: 'epic',
    group: 'Idea curation',
    source: 'Muse grouping',
    age: '34m ago',
  },
  {
    id: 'idea-3',
    title: 'A beautiful export for the team offsite',
    note: 'Not wrong — just not this week',
    kind: 'distraction',
    group: 'Parked by Muse',
    source: 'Conversation',
    age: '1h ago',
  },
  {
    id: 'idea-4',
    title: 'Keep the original words beside the curated version',
    note: 'Trust the transformation',
    kind: 'capture',
    group: 'Idea curation',
    source: 'Working session',
    age: '2h ago',
  },
]

export const initialExecution: ExecutionItem[] = [
  {
    id: 'build-1',
    title: 'Voice capture becomes a held thought',
    capability: 'Muse companion',
    decision: 'Unfinished ideas feel held, not hurried',
    status: 'building',
    owner: 'Claude Code',
    signal: 'thin slice',
  },
  {
    id: 'build-2',
    title: 'Group three related thoughts into one capability',
    capability: 'Idea curation',
    decision: 'Kite shows patterns before it creates tickets',
    status: 'ready',
    owner: 'UX agent',
    signal: 'traceable',
  },
  {
    id: 'build-3',
    title: 'Protect original language in the living PRFAQ',
    capability: 'Discovery ritual',
    decision: 'The product voice remains visible as it gets shaped',
    status: 'review',
    owner: 'Product owner',
    signal: 'human review',
  },
  {
    id: 'build-4',
    title: 'Decide when a capability is ready for beta',
    capability: 'Pilot handoff',
    decision: 'Readiness is a conversation, not a gate',
    status: 'queued',
    owner: 'Architecture agent',
    signal: 'open question',
  },
]

export const initialEvidence: EvidenceItem[] = [
  { id: 'evidence-1', source: 'Working session 04', type: 'conversation', insight: 'Unfinished ideas should feel held, not hurried.', confidence: 'high', trace: 'PRFAQ / Why customers care' },
  { id: 'evidence-2', source: 'Founder interview · 03', type: 'interview', insight: 'People lose valuable product context between the walk and the desk.', confidence: 'high', trace: 'Muse companion / voice capture' },
  { id: 'evidence-3', source: 'Product research brief', type: 'research', insight: 'Most backlog tools optimize for sorting work after the decision, not forming the decision.', confidence: 'medium', trace: 'Validated use case / differentiation' },
  { id: 'evidence-4', source: 'Uploaded notes / offsite.md', type: 'uploaded', insight: 'The product owner wants to see what belongs together before creating a task.', confidence: 'medium', trace: 'Idea curation / grouping' },
]

export const recommendations: RecommendationItem[] = [
  { id: 'rec-1', title: 'Ask for the customer’s “after” moment', reason: 'The promise is clear, but the first proof point is still soft.', prompt: 'What should be observably different for the customer after one use?', capability: 'Discovery ritual', kind: 'consider' },
  { id: 'rec-2', title: 'Treat capture → curation as a workflow', reason: 'A thought moves through interpretation before it becomes a work item.', prompt: 'Where should the Muse pause and ask the owner to steer the grouping?', capability: 'Muse companion', kind: 'workflow' },
  { id: 'rec-3', title: 'Keep grouping decisions human-controlled', reason: 'The system can suggest relationships, but the product owner owns meaning.', prompt: 'What would make you trust a suggested merge?', capability: 'Idea curation', kind: 'hitl' },
]

export const agentRoutes = [
  { id: 'route-1', agent: 'Muse / Interviewer', action: 'Elicit product intent', state: 'complete', detail: 'Conversation → product promise' },
  { id: 'route-2', agent: 'Use Case Validator', action: 'Test the proof point', state: 'active', detail: 'Evidence → readiness recommendation' },
  { id: 'route-3', agent: 'UX / Component Mapper', action: 'Suggest the product surface', state: 'ready', detail: 'Use case → shadcn/ui map' },
  { id: 'route-4', agent: 'Product Engineer', action: 'Shape the pilot boundary', state: 'waiting', detail: 'Technical requirements → Claude Code' },
]

export const humanDecisions = [
  { id: 'decision-1', question: 'Should suggested thought merges be automatically accepted?', answer: 'No — the Muse recommends, the Product Owner decides.', status: 'resolved' },
  { id: 'decision-2', question: 'When should an agentic workflow pause?', answer: 'Before meaning changes: grouping, priority, or customer promise.', status: 'resolved' },
  { id: 'decision-3', question: 'What should the first pilot prove?', answer: 'A captured thought can become a confident next move.', status: 'open' },
]

export const navItems: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: 'overview', label: 'Whole product', hint: 'See the shape' },
  { id: 'conversation', label: 'Work with Muse', hint: 'Move the idea' },
  { id: 'validation', label: 'Validate use case', hint: 'Test the proof' },
  { id: 'product', label: 'Product shape', hint: 'Living PRFAQ' },
  { id: 'evidence', label: 'Evidence & signals', hint: 'Keep the why' },
  { id: 'spec', label: 'Living specification', hint: 'PRD + TRD, traced' },
  { id: 'readiness', label: 'Pilot readiness', hint: 'Find the ceiling' },
  { id: 'brief', label: 'Prototype brief', hint: 'Prepare Claude Code' },
  { id: 'pilot', label: 'Make it real', hint: 'Trace the build' },
  { id: 'connections', label: 'Connections', hint: 'Repository & Linear' },
]
