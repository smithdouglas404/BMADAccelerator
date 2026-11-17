import type { BacklogItem, Capability, ConversationMessage, EvidenceItem, ExecutionItem } from './data'
import type { SpecSection } from './spec'

export type TruthNodeType = 'thought' | 'conversation' | 'evidence' | 'inference' | 'decision' | 'use-case' | 'capability' | 'prd' | 'trd' | 'backlog' | 'prototype' | 'execution'
export type TruthSource = 'owner' | 'muse' | 'evidence' | 'system' | 'prototype'
export type TruthConfidence = 'high' | 'medium' | 'open'
export type TruthEdgeRelation = 'expresses' | 'supports' | 'infers' | 'approves' | 'shapes' | 'specifies' | 'implements' | 'revises'

export interface TruthNode {
  id: string
  type: TruthNodeType
  title: string
  detail: string
  source: TruthSource
  confidence: TruthConfidence
  status: 'active' | 'open' | 'accepted' | 'parked'
  ontologyClass: 'actor' | 'experience' | 'claim' | 'evidence' | 'decision' | 'artifact' | 'work'
  semanticTags: string[]
  section?: string
}

export interface TruthEdge {
  id: string
  from: string
  to: string
  relation: TruthEdgeRelation
  label: string
  source: TruthSource
  confidence: TruthConfidence
  createdAt: string
}

export interface TruthGraphSchema {
  version: string
  purpose: string
  ontology: Record<string, string>
  semanticLayer: { rule: string; nodeIdentity: string; edgeIdentity: string; confidence: string; provenance: string }
  sourceDomains: string[]
  distributedAccess: string
}

export interface RuntimeTruthGraph {
  schema: TruthGraphSchema
  nodes: TruthNode[]
  edges: TruthEdge[]
  readiness: { overall: number; useCase: number; capabilities: Record<string, number>; signals: string[] }
}

export const truthGraphSchema: TruthGraphSchema = {
  version: '0.2.0',
  purpose: 'Keep one Studio source record for human intent, evidence, inference, decision, specification, prototype, and execution while linking out to Git and Linear projections.',
  ontology: {
    actor: 'A person or agent that contributes, interprets, or approves meaning.',
    experience: 'A use case, capability, or prototype surface describing what should change for someone.',
    claim: 'A thought, inferred requirement, or product statement that may need evidence or approval.',
    evidence: 'A conversation, interview, upload, observation, or research signal supporting or challenging a claim.',
    decision: 'An explicit human-approved, rejected, or intentionally open choice.',
    artifact: 'A PRD, TRD, trace, annotation, or generated package materializing meaning.',
    work: 'A backlog, execution, pilot, or code handoff record derived from product truth.',
  },
  semanticLayer: {
    rule: 'Edges explain why a node exists; they are not generic foreign keys.',
    nodeIdentity: 'Stable Studio IDs identify meaning across the Studio record, Git branch, Linear issue, and generated package.',
    edgeIdentity: 'Each edge names the relation, source, confidence, and creation context.',
    confidence: 'Confidence is calculated from graph signals and may change without rewriting history.',
    provenance: 'Every inferred or generated record points back to an event or source that caused it.',
  },
  sourceDomains: ['Studio conversation', 'uploaded evidence', 'research systems', 'prototype annotations', 'Git projection', 'Linear projection'],
  distributedAccess: 'Studio is the shared source record. Git and Linear link back to Studio IDs and project curated projections; they do not become competing sources of meaning.',
}

export const vibeLoopSteps = [
  { id: 'select', label: 'Select', title: 'Point at the experience', detail: 'Click an object, draw a circle, or capture the full screen. The surface becomes a real context object.', artifact: 'VISUAL_ANNOTATIONS.json' },
  { id: 'describe', label: 'Describe', title: 'Say what should feel different', detail: 'Use voice or text. Keep the original language attached; do not force the owner to translate it into a ticket.', artifact: 'annotation note + frame' },
  { id: 'interpret', label: 'Interpret', title: 'Muse separates observation from inference', detail: 'The Muse proposes the product behavior, technical implication, and open question without silently approving them.', artifact: 'SPEC_TRACE.json' },
  { id: 'shape', label: 'Shape', title: 'Owner accepts, revises, or probes', detail: 'The owner decides whether the signal changes the PRD, TRD, backlog, or only remains an open hypothesis.', artifact: 'PRD.md + TRD.md' },
  { id: 'regenerate', label: 'Regenerate', title: 'Generate the next thin slice', detail: 'Claude Code receives the changed spec, annotation, trace, and first move as a repeatable package.', artifact: 'CLAUDE_CODE_PROMPT.md' },
]

type BuildInput = {
  product: { name: string; statement: string }
  messages: ConversationMessage[]
  backlog: BacklogItem[]
  evidence: EvidenceItem[]
  capabilities: Capability[]
  execution: ExecutionItem[]
  visualAnnotations: Array<{ target: string; note: string; shape: string; frame?: string }>
  specSections: SpecSection[]
}

const confidenceFor = (signalCount: number, openCount: number): TruthConfidence => signalCount >= 4 && openCount === 0 ? 'high' : signalCount >= 2 ? 'medium' : 'open'
const sourceForMessage = (message: ConversationMessage): TruthSource => message.role === 'user' ? 'owner' : message.role === 'muse' ? 'muse' : 'system'

export function buildTruthGraph(input: BuildInput): RuntimeTruthGraph {
  const latestUser = [...input.messages].reverse().find((message) => message.role === 'user')
  const latestMessage = input.messages[input.messages.length - 1]
  const firstEvidence = input.evidence[0]
  const firstBacklog = input.backlog[0]
  const firstCapability = input.capabilities[0]
  const prd = input.specSections.find((section) => section.tab === 'prd')
  const trd = input.specSections.find((section) => section.tab === 'trd')
  const annotation = input.visualAnnotations[0]
  const execution = input.execution[0]
  const nodes: TruthNode[] = [
    { id: latestUser?.id ?? 'studio-thought', type: 'thought', title: latestUser?.text.slice(0, 58) ?? 'Current Studio thought', detail: latestUser?.text ?? 'The Studio is waiting for the first product thought.', source: 'owner', confidence: latestUser ? 'high' : 'open', status: 'active', ontologyClass: 'claim', semanticTags: ['runtime', 'owner-language'] },
    { id: latestMessage?.id ?? 'studio-conversation', type: 'conversation', title: 'Current Muse conversation', detail: latestMessage?.text ?? 'The Studio conversation has not started yet.', source: sourceForMessage(latestMessage ?? { role: 'muse' } as ConversationMessage), confidence: latestMessage ? 'medium' : 'open', status: 'active', ontologyClass: 'experience', semanticTags: ['runtime', 'conversation'] },
    { id: firstEvidence?.id ?? 'studio-evidence', type: 'evidence', title: firstEvidence?.source ?? 'Evidence awaiting capture', detail: firstEvidence?.insight ?? 'Upload research or let the conversation become evidence.', source: 'evidence', confidence: firstEvidence?.confidence ?? 'open', status: 'active', ontologyClass: 'evidence', semanticTags: ['runtime', 'evidence'] },
    { id: `use-case-${input.product.name.toLowerCase()}`, type: 'use-case', title: `Use case · ${input.product.name}`, detail: input.product.statement, source: 'owner', confidence: confidenceFor(input.messages.length + input.evidence.length, input.backlog.length === 0 ? 1 : 0), status: 'active', ontologyClass: 'experience', semanticTags: ['runtime', 'use-case', 'thin-slice'] },
    { id: firstCapability?.id ?? 'studio-capability', type: 'capability', title: firstCapability?.label ?? 'Emerging capability', detail: firstCapability?.description ?? 'A capability will form as signals are curated.', source: 'owner', confidence: firstCapability ? 'medium' : 'open', status: 'active', ontologyClass: 'experience', semanticTags: ['runtime', 'capability'] },
    { id: prd?.id ?? 'studio-prd', type: 'prd', title: `PRD · ${prd?.title ?? 'Primary customer flow'}`, detail: prd?.content ?? 'The living PRD will be shaped by conversation and evidence.', source: 'system', confidence: prd?.confidence ?? 'open', status: 'active', ontologyClass: 'artifact', semanticTags: ['runtime', 'prd'], section: prd?.title },
    { id: trd?.id ?? 'studio-trd', type: 'trd', title: `TRD · ${trd?.title ?? 'Data and state transitions'}`, detail: trd?.content ?? 'The TRD will be inferred from accepted product behavior.', source: 'system', confidence: trd?.confidence ?? 'open', status: 'open', ontologyClass: 'artifact', semanticTags: ['runtime', 'trd'], section: trd?.title },
    { id: firstBacklog?.id ?? 'studio-backlog', type: 'backlog', title: firstBacklog?.title ?? 'No backlog signal yet', detail: firstBacklog?.note ?? 'A signal appears here after the owner captures a thought.', source: 'muse', confidence: firstBacklog ? 'medium' : 'open', status: firstBacklog?.kind === 'distraction' ? 'parked' : 'active', ontologyClass: 'work', semanticTags: ['runtime', 'backlog'] },
    { id: annotation ? `annotation-${annotation.target}` : 'studio-prototype', type: 'prototype', title: annotation ? `Annotation · ${annotation.target}` : 'Current prototype surface', detail: annotation?.note ?? 'The prototype surface is ready to receive a vibe annotation.', source: 'prototype', confidence: annotation ? 'medium' : 'open', status: 'active', ontologyClass: 'artifact', semanticTags: ['runtime', 'prototype', 'vibe-coding'] },
    { id: execution?.id ?? 'studio-execution', type: 'execution', title: execution?.title ?? 'First thin-slice build', detail: execution?.decision ?? 'The first build move will be generated from the current Studio record.', source: 'system', confidence: execution ? 'medium' : 'open', status: 'open', ontologyClass: 'work', semanticTags: ['runtime', 'execution'] },
  ]
  const id = (type: TruthNodeType) => nodes.find((node) => node.type === type)?.id ?? ''
  const edges: TruthEdge[] = [
    { id: 'runtime-thought-conversation', from: id('thought'), to: id('conversation'), relation: 'expresses', label: 'owner language becomes the conversation', source: 'owner', confidence: latestUser ? 'high' : 'open', createdAt: latestUser?.time ?? 'runtime' },
    { id: 'runtime-evidence-thought', from: id('evidence'), to: id('thought'), relation: 'supports', label: 'evidence supports the thought', source: 'evidence', confidence: firstEvidence?.confidence ?? 'open', createdAt: firstEvidence?.id ?? 'runtime' },
    { id: 'runtime-conversation-use-case', from: id('conversation'), to: id('use-case'), relation: 'shapes', label: 'conversation shapes the use case', source: 'muse', confidence: latestMessage ? 'medium' : 'open', createdAt: latestMessage?.time ?? 'runtime' },
    { id: 'runtime-use-case-capability', from: id('use-case'), to: id('capability'), relation: 'specifies', label: 'use case becomes a capability', source: 'system', confidence: 'medium', createdAt: 'runtime' },
    { id: 'runtime-capability-prd', from: id('capability'), to: id('prd'), relation: 'specifies', label: 'capability writes the experience', source: 'system', confidence: prd?.confidence ?? 'open', createdAt: 'runtime' },
    { id: 'runtime-prd-trd', from: id('prd'), to: id('trd'), relation: 'revises', label: 'product behavior creates technical consequence', source: 'system', confidence: trd?.confidence ?? 'open', createdAt: 'runtime' },
    { id: 'runtime-thought-backlog', from: id('thought'), to: id('backlog'), relation: 'shapes', label: 'thought becomes a curated signal', source: 'muse', confidence: firstBacklog ? 'medium' : 'open', createdAt: firstBacklog?.id ?? 'runtime' },
    { id: 'runtime-prd-prototype', from: id('prd'), to: id('prototype'), relation: 'implements', label: 'PRD becomes a visible surface', source: 'prototype', confidence: annotation ? 'medium' : 'open', createdAt: annotation?.target ?? 'runtime' },
    { id: 'runtime-prototype-trd', from: id('prototype'), to: id('trd'), relation: 'supports', label: 'prototype feedback creates a state implication', source: 'prototype', confidence: annotation ? 'medium' : 'open', createdAt: annotation?.target ?? 'runtime' },
    { id: 'runtime-trd-execution', from: id('trd'), to: id('execution'), relation: 'implements', label: 'technical consequence becomes the next build move', source: 'system', confidence: execution ? 'medium' : 'open', createdAt: execution?.id ?? 'runtime' },
  ]
  const evidenceScore = Math.min(100, input.evidence.length * 20 + input.messages.filter((message) => message.role === 'user').length * 10)
  const decisionScore = Math.min(100, input.messages.filter((message) => message.role === 'signal').length * 18)
  const backlogScore = Math.min(100, input.backlog.length * 12)
  const prototypeScore = input.visualAnnotations.length ? 100 : 30
  const useCase = Math.round((evidenceScore * .3) + (decisionScore * .25) + (backlogScore * .2) + (prototypeScore * .25))
  const capabilities = Object.fromEntries(input.capabilities.map((capability, index) => [capability.id, Math.round(Math.min(100, useCase * (1 - index * .12) + edges.length * 1.5))]))
  return { schema: truthGraphSchema, nodes, edges, readiness: { overall: Math.round(Object.values(capabilities).reduce((sum, value) => sum + value, 0) / Math.max(1, Object.values(capabilities).length)), useCase, capabilities, signals: [`${input.messages.filter((message) => message.role === 'user').length} owner statements`, `${input.evidence.length} evidence records`, `${input.visualAnnotations.length} real prototype annotations`, `${input.backlog.length} Studio backlog records`] } }
}
