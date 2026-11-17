'use client'
// The Studio's live data: the server state for one product, polled, and adapters that turn it into the
// shapes the design team's screens already use (data.ts and spec.ts types), so their components stay as
// they are and show real products instead of the sample.
import { ownerBacklogState } from '@/lib/studio/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BacklogItem, Capability, ConversationMessage, EvidenceItem, ExecutionItem, RecommendationItem } from './data'
import type { SpecSection } from './spec'

export type Trace = { label: string; detail: string; type: string }
export type LiveSpec = {
  id: string; key: string; ref: string; tab: 'prd' | 'trd'; title: string; kicker: string; content: string; completeness: number
  confidence: 'high' | 'medium' | 'open'; basis: string; status: string; review: string; reviewNote: string; source: string
  capability: string; related: string[]; trace: Trace[]; updatedAt: string; updatedBy: string
}
export type LiveDecision = { id: string; text: string; status: 'approved' | 'assumed' | 'open' | 'rejected'; capability: string; words: string; agent: string; options: unknown; answer: string; includeInBuild: boolean; builtInVersion: number; createdAt: string }
export type LiveBacklog = { id: string; title: string; note: string; kind: BacklogItem['kind']; group: string; source: string; recKind: string; probe: string; state: string; hidden: string; includeInBuild: boolean; builtInVersion: number; createdAt: string; trackerUrl: string; annotationId?: string }
export type LiveMove = { id: string; title: string; capability: string; decision: string; status: string; owner: string; signal: string; hidden: string; components: string[]; routes: string[]; trackerUrl: string; movedBy?: string; moveReason?: string }
export type LiveCapability = { id: string; key: string; label: string; kicker: string; description: string; readiness: number; delta: string; signal: string; color: string; items: { id: string; text: string; state: string }[] }
export type LiveMessage = { id: string; role: string; agent: string; content: string; accent: string; createdAt: string; author: string; authorRole: string; addressed: string; raw: string; ref: string }
export type LiveMember = { id: string; name: string; role: string }
export type LiveEvidence = { id: string; source: string; type: string; insight: string; confidence: string; trace: string; createdAt: string }
export type LiveRoute = { id: string; agent: string; action: string; state: string; detail: string }
export type LiveFeedback = { id: string; comment: string; target: string; shape: string; status: string; imageUrl: string; createdAt: string; interpretation?: { observation?: string; behaviour?: string; acceptance?: string[]; component?: string; prd?: string[]; trd?: string[]; question?: string } }
export type ReadinessFactor = { key: string; label: string; value: number; detail: string }
export type LiveRevision = { id: string; version: number; reason: string; diff: string; createdAt: string }

export type Live = {
  id: string; slug: string; name: string; description: string; statement: string; category: string; audience: string; stageLabel: string
  customerQuote: string; prfaq: string; prfaqUpdatedAt: string | null; validatedUseCase: string
  validation: Record<string, { state: string; note?: string }>; validationScore: number; overallReadiness: number
  readiness: { overall: number; factors: ReadinessFactor[] }
  components: { name: string; why?: string }[]; techNotes: string[]; focus: string; lens: 'owner' | 'engineer'; session: number
  repoUrl: string; gitBranch: string; gitStatus: string; gitPushedAt: string | null; linearTeam: string; linearStatus: string; linearSyncedAt: string | null
  agentBusy: boolean; agentStatus: string; agentError: string; generateBusy: boolean; generateStatus: string; generateCount: number; packageCount: number
  lastGeneratedAt: string | null; updatedAt: string; pending: number; agentsEnabled: boolean; connections: { linear: boolean; github: boolean; voice: boolean }
  preview: { hasApp: boolean; port: number | null; running: boolean; starting: boolean }
  packageFiles: string[]
  capabilities: LiveCapability[]; decisions: LiveDecision[]; backlog: LiveBacklog[]; evidence: LiveEvidence[]; moves: LiveMove[]; routes: LiveRoute[]
  messages: LiveMessage[]; members: LiveMember[]; feedback: LiveFeedback[]; spec: LiveSpec[]; specRevisions: LiveRevision[]
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(url, json === undefined ? rest : { ...rest, method: rest.method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`)
  return body as T
}

/** The product's state, refreshed every couple of seconds while the page is open. */
export function useLive(id: string) {
  const [data, setData] = useState<Live | null>(null)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const reload = useCallback(async () => {
    try {
      const d = await api<Live>(`/api/use-cases/${id}`, { cache: 'no-store' })
      if (alive.current) { setData(d); setError('') }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    alive.current = true
    void reload()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 2500)
    return () => { alive.current = false; window.clearInterval(t) }
  }, [reload])
  return { data, error, reload }
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'not yet'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·'

export function toCapabilities(d: Live): Capability[] {
  return d.capabilities.map((c) => ({ id: c.key, label: c.label, kicker: c.kicker, readiness: c.readiness, delta: c.delta || 'new', description: c.description, signal: c.signal, color: c.color }))
}

export function colorOf(d: Live, accent: string): string | undefined {
  if (!accent) return undefined
  if (accent.startsWith('#')) return accent
  return d.capabilities.find((c) => c.key === accent)?.color
}

/** A conversation message with what the team's type doesn't carry: who spoke, a specialist, an undo. */
export type StudioMessage = ConversationMessage & { specialist?: string; author?: string; authorRole?: string; addressed?: string; raw?: string; ref?: string }

export function toMessages(d: Live, me?: { name?: string }): StudioMessage[] {
  return d.messages.map((m) => ({
    id: m.id,
    role: m.role === 'user' ? 'user' : m.role === 'signal' ? 'signal' : 'muse',
    label: m.role === 'user' ? (m.author && m.author !== me?.name ? `${m.author} · ${m.authorRole || 'Product owner'}` : 'You') : m.agent || (m.role === 'signal' ? 'Signal' : 'Socra · Product physician'),
    text: m.content,
    time: ago(m.createdAt),
    accent: colorOf(d, m.accent),
    specialist: m.role === 'agent' && m.addressed ? m.addressed : undefined,
    author: m.author || undefined,
    authorRole: m.authorRole || undefined,
    addressed: m.role === 'user' ? m.addressed || undefined : undefined,
    raw: m.raw || undefined,
    ref: m.ref || undefined,
  }))
}

export function toBacklog(d: Live): (BacklogItem & { ownerState: string; annotationId: string })[] {
  return d.backlog
    .filter((b) => b.state !== 'suggested' && b.state !== 'probing')
    .map((b) => ({ id: b.id, title: b.title, note: b.note, kind: b.kind, group: b.group || 'Unsorted signal', source: b.source, age: ago(b.createdAt), ownerState: ownerBacklogState(b), annotationId: b.annotationId || '' }))
}

export function toRecommendations(d: Live): RecommendationItem[] {
  return d.backlog
    .filter((b) => b.state === 'suggested' || b.state === 'probing')
    .map((b) => ({ id: b.id, title: b.title, reason: b.note, prompt: b.probe, capability: b.group, kind: (['consider', 'workflow', 'hitl'].includes(b.recKind) ? b.recKind : 'consider') as RecommendationItem['kind'] }))
}

const SIGNALS: Record<string, string> = { queued: 'OPEN QUESTION', ready: 'TRACEABLE', building: 'THIN SLICE', review: 'HUMAN REVIEW', done: 'SHIPPED' }

export function toExecution(d: Live): ExecutionItem[] {
  return d.moves
    .filter((m) => m.status !== 'done')
    .map((m) => ({ id: m.id, title: m.title, capability: m.capability, decision: m.decision, status: (['queued', 'ready', 'building', 'review'].includes(m.status) ? m.status : 'queued') as ExecutionItem['status'], owner: m.owner, signal: m.signal || SIGNALS[m.status] || 'TRACEABLE' }))
}

export function toEvidence(d: Live): EvidenceItem[] {
  return d.evidence.map((e) => ({ id: e.id, source: e.source, type: e.type as EvidenceItem['type'], insight: e.insight, confidence: (['high', 'medium', 'open'].includes(e.confidence) ? e.confidence : 'open') as EvidenceItem['confidence'], trace: e.trace }))
}

export function toSpec(d: Live): (SpecSection & { ref: string; basis: string; review: string; reviewNote: string; key: string; updatedAt: string })[] {
  return d.spec.map((s) => ({
    id: s.key, key: s.key, ref: s.ref, tab: s.tab, title: s.title, kicker: s.kicker, content: s.content, completeness: s.completeness,
    confidence: s.confidence, status: s.status as SpecSection['status'], source: s.source || (s.content ? 'Socra inference' : 'Not yet researched'),
    related: s.related, trace: s.trace as SpecSection['trace'], basis: s.basis, review: s.review, reviewNote: s.reviewNote, updatedAt: s.updatedAt,
  }))
}

/** The live product's address on this machine (the preview runs on its own port). */
export function previewUrl(port: number | null | undefined, path = '/') {
  if (!port || typeof window === 'undefined') return ''
  const h = window.location.hostname
  // Through a public domain (studio.innume.com) only ports 80/443 pass, so each app gets its own hostname:
  // https://p4107.innume.com. On this computer (localhost, IP address, .local) the app's own port is used.
  const local = h === 'localhost' || h === '[::1]' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.endsWith('.local') || !h.includes('.')
  if (!local) {
    const parent = h.split('.').slice(-2).join('.')
    return `https://p${port}.${parent}${path.startsWith('/') ? path : `/${path}`}`
  }
  return `${window.location.protocol}//${h}:${port}${path}`
}

const DAY_PARTS = ['night', 'morning', 'afternoon', 'evening']
export function sessionLine(n: number) {
  const now = new Date()
  const part = DAY_PARTS[Math.floor(((now.getHours() + 6) % 24) / 6)]
  return `Working session ${String(Math.max(1, n)).padStart(2, '0')} · ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${part}`
}
