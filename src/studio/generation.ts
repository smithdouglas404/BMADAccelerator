import { zipSync, strToU8 } from 'fflate'
import type { BacklogItem, Capability, ConversationMessage, ExecutionItem } from './data'

export interface PrototypePackageInput {
  repositoryUrl: string
  productName: string
  productStatement: string
  useCase: string
  readiness: number
  prfaq: string
  technicalRequirements: string
  messages: ConversationMessage[]
  backlog: BacklogItem[]
  execution: ExecutionItem[]
  capabilities: Capability[]
  components: string[]
  agenticWorkflows: string[]
  humanDecisions: string[]
  evidence: string[]
  visualAnnotations: Array<{ target: string; note: string; shape: string; frame?: string }>
  prd: Array<{ title: string; content: string; completeness: number; status: string; confidence: string }>
  trd: Array<{ title: string; content: string; completeness: number; status: string; confidence: string }>
  specTrace: Array<{ section: string; label: string; detail: string; type: string }>
  truthGraph: { schema: unknown; nodes: unknown[]; edges: unknown[] }
  vibeLoop: unknown[]
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function assemblePrototypePackage(input: PrototypePackageInput) {
  const packageManifest = {
    packageVersion: '0.2.0',
    generatedFor: input.productName,
    generatedAt: new Date().toISOString(),
    target: 'claude-code',
    repositoryUrl: input.repositoryUrl || 'not-connected',
    sourceOfTruth: ['PRFAQ.md', 'VALIDATED_USE_CASE.md', 'PRD.md', 'TRD.md', 'SPEC_TRACE.json', 'TRUTH_GRAPH.json', 'VIBE_LOOP.json', 'TECHNICAL_REQUIREMENTS.md', 'KANBAN.json'],
    agentKit: {
      router: '@inngest/agent-kit',
      workflows: input.agenticWorkflows,
      humanInTheLoop: input.humanDecisions,
    },
    uiBaseline: ['shadcn/ui', ...input.components],
  }

  const files: Record<string, string> = {
    'README.md': `# ${input.productName} — Claude Code Prototype Package\n\nThis package was assembled by Agentic Working Backwards Studio. It keeps product intent, evidence, decisions, technical interpretation, and traceable execution together so Claude Code can generate a thin-slice pilot without losing the why.\n\n## Start here\n1. Read PRFAQ.md, VALIDATED_USE_CASE.md, and PRD.md.\n2. Review TRD.md, SPEC_TRACE.json, TECHNICAL_REQUIREMENTS.md, and COMPONENT_MAP.json.\n3. Inspect KANBAN.json for the initial build lane.\n4. Run the prompt in CLAUDE_CODE_PROMPT.md.\n\nRepository: ${input.repositoryUrl || 'Connect a repository in Studio settings before pushing.'}\n`,
    'PRFAQ.md': input.prfaq,
    'VALIDATED_USE_CASE.md': `# Validated use case\n\n## Use case\n${input.useCase}\n\n## Product promise\n${input.productStatement}\n\n## Readiness\n${input.readiness}% ready for a thin-slice prototype. This is a recommendation, not a gate.\n\n## Evidence\n${input.evidence.map((item) => `- ${item}`).join('\n')}\n\n## Open questions\n- What is the smallest customer-visible proof of value?\n- Which decision should remain human-controlled in the first pilot?\n`,
    'TECHNICAL_REQUIREMENTS.md': input.technicalRequirements,
    'COMPONENT_MAP.json': json({ baseline: 'shadcn/ui', components: input.components, rationale: 'Suggested from the conversation and validated use case.' }),
    'AGENT_KIT_ROUTING.json': json({ framework: '@inngest/agent-kit', workflows: input.agenticWorkflows, humanInTheLoop: input.humanDecisions }),
    'KANBAN.json': json(input.execution),
    'EVIDENCE.json': json(input.evidence),
    'VISUAL_ANNOTATIONS.json': json(input.visualAnnotations),
    'PRD.md': input.prd.map((section) => `## ${section.title}\n\n${section.content}\n\nCompleteness: ${section.completeness}% · ${section.status} · ${section.confidence} confidence\n`).join('\n'),
    'TRD.md': input.trd.map((section) => `## ${section.title}\n\n${section.content}\n\nCompleteness: ${section.completeness}% · ${section.status} · ${section.confidence} confidence\n`).join('\n'),
    'SPEC_TRACE.json': json(input.specTrace),
    'TRUTH_GRAPH.json': json(input.truthGraph),
    'VIBE_LOOP.json': json(input.vibeLoop),
    'CONVERSATION.json': json(input.messages),
    'BACKLOG.json': json(input.backlog),
    'PACKAGE_MANIFEST.json': json(packageManifest),
    'CLAUDE_CODE_PROMPT.md': `# Claude Code execution prompt\n\nYou are the implementation agent for ${input.productName}. Build the thinnest production-minded pilot that proves the validated use case. Do not invent product scope outside the files in this package.\n\n## Guardrails\n- Preserve the customer language in PRFAQ.md.\n- Use shadcn/ui primitives for the interface.\n- Use the Agent Kit route definitions as the prototype orchestration baseline.\n- Keep human-in-the-loop decisions explicit and reversible.\n- Trace every implemented story to a capability in KANBAN.json.\n- Prefer a working vertical slice over broad scaffolding.\n\n## First move\n${input.execution.find((item) => item.status === 'building')?.title ?? 'Implement the highest-confidence thin slice.'}\n`,
  }
  return files
}

export function downloadPrototypeZip(files: Record<string, string>, filename = 'agentic-working-backwards-prototype.zip') {
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])), { level: 6 })
  const blob = new Blob([archive], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
