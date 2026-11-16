'use client'
import { brand } from '@/lib/brand'
// The Product Truth Graph view (the design team's v7 screen), filled from this product's real records:
// every node is something that happened, every statement says what kind of truth it is, inferences are
// in plain words with the technical reading in a side panel, every change says why, and the use case's
// confidence is calculated from the graph. The vibe loop follows the real marks on the prototype.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, FileText, GitBranch, History, MousePointer2, Network, Wand2, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, PageHeader, Row, Section, SectionBody, StatusBadge } from './kit'
import { vibeLoopSteps, type TruthEdge, type TruthNode } from './graph'
import { api, ago, type Live } from './live'
import type { StudioView } from './flow'

export type Statement = 'fact' | 'evidence' | 'inference' | 'recommendation' | 'decision' | 'open' | 'rejected' | 'generated'
export type TNode = TruthNode & { statement: Statement; at: string; by: string; view: StudioView; interpretations: { plain: string; technical: string }[] }
export type TChange = { id: string; node: string; kind: string; summary: string; before: string; after: string; by: string; createdAt: string; title: string; because: { id: string; title: string; type: string; statement: Statement; relation: string }[]; affects: { id: string; title: string; type: string }[] }
export type TFactor = { key: string; label: string; value: number; because: string[] }
export type Truth = { nodes: TNode[]; edges: TruthEdge[]; timeline: TChange[]; confidence: { overall: number; factors: TFactor[] } }

export const STATEMENT_LABEL: Record<Statement, string> = {
  fact: 'said by a person', evidence: 'outside evidence', inference: 'Socra inference', recommendation: 'recommendation',
  decision: 'human decision', open: 'open question', rejected: 'rejected', generated: 'built',
}
const KIND_LABEL: Record<string, string> = { said: 'Said', added: 'Added', changed: 'Changed', approved: 'Approved', rejected: 'Rejected', undone: 'Undone', reviewed: 'Review asked', interpreted: 'Interpreted', observed: 'Seen in the pilot', built: 'Built', moved: 'Moved', 'moved back': 'Moved back', withdrawn: 'Withdrawn' }

/** The graph for a product, refreshed whenever the product changes. */
export function useTruth(live: Live) {
  const [t, setT] = useState<Truth | null>(null)
  const key = `${live.id}|${live.updatedAt}|${live.messages.length}|${live.feedback.length}|${live.evidence.length}|${live.decisions.length}|${live.backlog.length}`
  useEffect(() => {
    let alive = true
    void api<Truth>(`/api/use-cases/${live.id}/truth`, { cache: 'no-store' }).then((d) => { if (alive) setT(d) }).catch(() => {})
    return () => { alive = false }
  }, [key, live.id])
  return t
}

const LANE: Record<string, number> = { owner: 0, evidence: 0, prototype: 0, muse: 1, system: 2 }
const PAGE = 24

type Props = { live: Live; changeView: (view: StudioView) => void; setToast: (value: string) => void; focusNode?: string }

const STATEMENT_TONE: Record<Statement, 'ok' | 'warn' | 'off' | 'info' | 'suggest'> = {
  fact: 'info', evidence: 'info', inference: 'suggest', recommendation: 'suggest', decision: 'ok', open: 'warn', rejected: 'off', generated: 'off',
}
const SOURCE_DOT: Record<string, string> = { owner: 'bg-primary', evidence: 'bg-info', muse: 'bg-suggest', prototype: 'bg-warning', system: 'bg-muted-foreground' }
const LANES = ['What people said and decided', 'What Socra read into it', 'Spec, work and builds']
const FILTERS = [['all', 'Everything'], ['owner', 'People and evidence'], ['muse', 'Socra'], ['prototype', 'Prototype'], ['system', 'Spec and builds']] as const
const CONFIDENCE_TONE: Record<string, 'ok' | 'warn' | 'info'> = { high: 'ok', medium: 'info', open: 'warn' }

export function TruthGraphView({ live, changeView, setToast, focusNode = '' }: Props) {
  const truth = useTruth(live)
  const nodes = useMemo(() => truth?.nodes ?? [], [truth])
  const edges = truth?.edges ?? []
  const [tab, setTab] = useState<'graph' | 'why'>(focusNode ? 'why' : 'graph')
  const [selectedNodeId, setSelectedNodeId] = useState(focusNode || 'usecase')
  const [whyFor, setWhyFor] = useState(focusNode)
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all')
  const [shown, setShown] = useState(PAGE)
  const [technical, setTechnical] = useState(false)
  const latest = live.feedback[0]
  const stage = !latest ? 'select' : latest.status === 'built' ? 'regenerate' : latest.interpretation?.behaviour && (latest.interpretation.prd?.length || latest.interpretation.trd?.length) ? 'shape' : latest.interpretation?.behaviour ? 'interpret' : 'describe'
  const [loopStep, setLoopStep] = useState(stage)
  useEffect(() => setLoopStep(stage), [stage])
  if (!truth) return <div data-ui className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:px-8"><PageHeader title="Product Truth Graph" description="Reading what really happened…" /></div>

  const ordered = [...nodes].sort((a, b) => (LANE[a.source] ?? 2) - (LANE[b.source] ?? 2) || +new Date(b.at || 0) - +new Date(a.at || 0))
  const filteredNodes = ordered.filter((node) => filter === 'all' || node.source === filter || (filter === 'owner' && node.source === 'evidence'))
  const visible = filteredNodes.slice(0, shown)
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0]
  const selectedEdges = selectedNode ? edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id) : []
  const typeLabel = (type: string) => type.replace('-', ' ')
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id
  const timeline = whyFor ? truth.timeline.filter((c) => c.node === whyFor || c.because.some((b) => b.id === whyFor)) : truth.timeline
  const openWhy = (id: string) => { setWhyFor(id); setTab('why') }
  const select = (id: string) => { setSelectedNodeId(id); setTab('graph') }
  const step = vibeLoopSteps.find((s) => s.id === loopStep) ?? vibeLoopSteps[0]
  const stageIndex = vibeLoopSteps.findIndex((item) => item.id === stage)
  const loopGo = () => {
    if (loopStep === 'select' || loopStep === 'describe') changeView('review')
    else if (loopStep === 'interpret') { setToast(latest?.interpretation?.behaviour ? 'Socra has read your mark; shape it in the living spec' : 'Socra is reading your mark and will write what it means'); changeView('review') }
    else if (loopStep === 'shape') changeView('spec')
    else changeView('brief')
  }

  return (
    <div data-ui className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Product Truth Graph"
        description={<>Why each part of {live.name} exists. Every item is something that really happened: what someone said, evidence, what Socra inferred, what a person decided, the spec, a mark on the prototype, a build. An inference never passes for a decision.</>}
        actions={<>
          <Button variant="outline" onClick={() => changeView('spec')}><FileText className="size-4" /> Living spec</Button>
          <Button variant="outline" onClick={() => changeView('connections')}><GitBranch className="size-4" /> Linked tools</Button>
          <Button onClick={() => changeView('review')}><MousePointer2 className="size-4" /> Mark up the prototype</Button>
        </>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Use case confidence" value={`${truth.confidence.overall}%`} detail="calculated from the graph; it guides, never blocks" />
        <Stat label="Things that happened" value={String(nodes.length)} detail={`${edges.length} links between them`} />
        <Stat label="Changes with reasons" value={String(truth.timeline.length)} detail={truth.timeline[0] ? `latest ${ago(truth.timeline[0].createdAt)}` : 'none yet'} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <Tabs value={tab} onValueChange={(v) => { if (v === 'why') setWhyFor(''); setTab(v as 'graph' | 'why') }}>
            <TabsList aria-label="Truth Graph views" className="!h-10 !w-full !flex-row sm:!w-fit">
              <TabsTrigger value="graph" className="!w-auto flex-1 !justify-center gap-2 px-3 text-sm"><Network className="size-4" /> <span className="sm:hidden">Everything</span><span className="max-sm:hidden">Everything that happened</span> <span className="text-xs text-muted-foreground">{nodes.length}</span></TabsTrigger>
              <TabsTrigger value="why" className="!w-auto flex-1 !justify-center gap-2 px-3 text-sm"><History className="size-4" /> <span className="sm:hidden">Why it changed</span><span className="max-sm:hidden">Why did this change?</span> <span className="text-xs text-muted-foreground">{truth.timeline.length}</span></TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === 'graph' ? (
            <Section
              title="Everything that happened"
              description="Pick one to see what it is, where it came from and what it connects to."
            >
              <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-2.5" role="group" aria-label="Show">{FILTERS.map(([k, l]) => <Button key={k} type="button" size="sm" variant={filter === k ? 'secondary' : 'ghost'} aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(PAGE) }}>{l}</Button>)}</div>
              {nodes.length <= 1 && <Empty>Nothing has happened in this product yet. The graph fills as people talk, add evidence, decide and mark up the prototype; nothing is made up.</Empty>}
              {LANES.map((lane, li) => {
                const inLane = visible.filter((n) => (LANE[n.source] ?? 2) === li)
                if (!inLane.length) return null
                return (
                  <div key={lane} className="grid grid-cols-1">
                    <h3 className="border-b border-border bg-muted/40 px-5 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{lane} · {filteredNodes.filter((n) => (LANE[n.source] ?? 2) === li).length}</h3>
                    {inLane.map((node) => (
                      <button key={node.id} type="button" onClick={() => setSelectedNodeId(node.id)} aria-current={selectedNode?.id === node.id} className={cn('flex items-start gap-3 border-b border-border px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60', selectedNode?.id === node.id && 'bg-accent shadow-[inset_3px_0_0_var(--primary)]')}>
                        <span className={cn('mt-2 size-2 shrink-0 rounded-full', SOURCE_DOT[node.source] ?? 'bg-muted-foreground')} />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="line-clamp-2 text-sm font-semibold">{node.title}</span>
                          <span className="line-clamp-2 text-sm text-muted-foreground">{node.interpretations[0]?.plain ?? node.detail}</span>
                        </span>
                        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          <StatusBadge tone={STATEMENT_TONE[node.statement]}>{STATEMENT_LABEL[node.statement]}</StatusBadge>
                          <span className="text-xs text-muted-foreground capitalize">{typeLabel(node.type)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
              {filteredNodes.length > shown && <div className="px-5 py-3"><Button type="button" variant="ghost" size="sm" onClick={() => setShown(shown + PAGE * 2)}>Show {Math.min(filteredNodes.length - shown, PAGE * 2)} more of {filteredNodes.length} <ArrowRight className="size-4" /></Button></div>}
            </Section>
          ) : (
            <Section
              title={whyFor ? `Why did this change: ${titleOf(whyFor)}` : 'Every change, with its reasons'}
              description="Each change says what caused it and what it affects. Click any item to see it in the graph."
              action={whyFor ? <Button type="button" variant="outline" size="sm" onClick={() => setWhyFor('')}>Show every change</Button> : undefined}
            >
              {timeline.length ? timeline.map((c) => (
                <article key={c.id} className="grid gap-2 border-b border-border px-5 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={c.kind === 'approved' || c.kind === 'built' ? 'ok' : c.kind === 'rejected' || c.kind === 'withdrawn' || c.kind === 'undone' ? 'off' : c.kind === 'interpreted' ? 'suggest' : 'info'}>{KIND_LABEL[c.kind] ?? c.kind}</StatusBadge>
                    <button type="button" className="text-left text-sm font-semibold hover:underline" onClick={() => select(c.node)}>{c.title}</button>
                    <span className="text-xs text-muted-foreground">{ago(c.createdAt)}{c.by ? ` · ${c.by}` : ''}</span>
                  </div>
                  <p className="text-base">{c.summary}</p>
                  {c.because.length > 0 && <Chips label="Because">{c.because.map((b, i) => <Chip key={`${b.id}-${i}`} onClick={() => select(b.id)}><em className="text-muted-foreground not-italic">{b.relation}</em> {b.title} <span className="text-xs text-muted-foreground">· {STATEMENT_LABEL[b.statement]}</span></Chip>)}</Chips>}
                  {c.affects.length > 0 && <Chips label="It affects">{c.affects.map((a) => <Chip key={a.id} onClick={() => select(a.id)}>{a.title}</Chip>)}</Chips>}
                  {(c.before || c.after) && (
                    <details className="group text-sm">
                      <summary className="cursor-pointer text-primary">See the change</summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {c.before && <div className="rounded-lg border border-border p-3"><p className="text-xs font-semibold text-muted-foreground uppercase">Before</p><p className="whitespace-pre-line">{c.before}</p></div>}
                        {c.after && <div className="rounded-lg border border-primary/30 p-3"><p className="text-xs font-semibold text-muted-foreground uppercase">After</p><p className="whitespace-pre-line">{c.after}</p></div>}
                      </div>
                    </details>
                  )}
                </article>
              )) : <Empty>{whyFor ? 'Nothing has changed this yet.' : 'No changes yet. Each one appears here with what caused it, the moment it happens.'}</Empty>}
            </Section>
          )}
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-4">
          {selectedNode && (
            <Section
              title={selectedNode.title}
              description={<span className="flex flex-wrap items-center gap-2"><StatusBadge tone={STATEMENT_TONE[selectedNode.statement]}>{STATEMENT_LABEL[selectedNode.statement]}</StatusBadge><StatusBadge tone={CONFIDENCE_TONE[selectedNode.confidence] ?? 'info'}>{selectedNode.confidence} confidence</StatusBadge></span>}
            >
              <SectionBody>
                <p className="text-base whitespace-pre-line [overflow-wrap:anywhere]">{selectedNode.detail}</p>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Kind</dt><dd className="capitalize">{typeLabel(selectedNode.type)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">From</dt><dd className="[overflow-wrap:anywhere]">{selectedNode.by || selectedNode.source}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="capitalize">{selectedNode.status}</dd></div>
                </dl>
                {selectedNode.interpretations.length > 0 && (
                  <div className="grid gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">What this probably means</p>
                    {selectedNode.interpretations.map((i) => <p key={i.plain} className="text-sm">{i.plain}{technical && <span className="mt-1 flex gap-1 font-mono text-xs text-muted-foreground"><Code2 className="mt-0.5 size-3.5" /> {i.technical}</span>}</p>)}
                  </div>
                )}
                {selectedNode.semanticTags.length > 0 && <div className="flex flex-wrap gap-1.5">{selectedNode.semanticTags.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}</div>}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => changeView(selectedNode.view)}><Wand2 className="size-4" /> Open where it lives</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => openWhy(selectedNode.id)}><History className="size-4" /> Why did this change?</Button>
                </div>
                <div className="flex items-center gap-2"><Switch id="truth-technical" checked={technical} onCheckedChange={setTechnical} /><Label htmlFor="truth-technical" className="text-sm">Technical view</Label></div>
                {technical && (
                  <div className="grid gap-1 rounded-lg border border-border bg-background p-3 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    <p>node {selectedNode.id} · {selectedNode.type} · {selectedNode.ontologyClass}</p>
                    <p>created {selectedNode.at ? new Date(selectedNode.at).toLocaleString() : 'n/a'}</p>
                    {selectedNode.section && <p>section {selectedNode.section}</p>}
                    {selectedNode.interpretations.map((i) => <p key={i.technical}>{i.technical}</p>)}
                  </div>
                )}
              </SectionBody>
              <div className="grid grid-cols-1 border-t border-border">
                <p className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">Connected to · {selectedEdges.length}</p>
                {selectedEdges.length ? selectedEdges.slice(0, 12).map((edge) => (
                  <button key={edge.id} type="button" onClick={() => setSelectedNodeId(edge.from === selectedNode.id ? edge.to : edge.from)} className="flex items-center gap-3 px-5 py-2 text-left text-sm hover:bg-accent/60">
                    <Badge variant="outline" className="shrink-0 text-xs">{edge.relation}</Badge>
                    <span className="min-w-0 flex-1 truncate">{edge.from === selectedNode.id ? `${edge.label} → ${titleOf(edge.to)}` : `${titleOf(edge.from)} ${edge.label}`}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )) : <Empty>Not connected to anything yet.</Empty>}
              </div>
            </Section>
          )}
          <Section title="How sure we are, and why" description="Calculated only from what is connected in the graph. It guides what to learn next; it never blocks a build.">
            <SectionBody className="gap-4">
              {truth.confidence.factors.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <div className="flex items-center justify-between text-sm"><span className="font-medium">{f.label}</span><span className="text-muted-foreground tabular-nums">{f.value}%</span></div>
                  <Progress value={f.value} className="h-1.5" />
                  {f.because.length > 0 && <p className="text-xs text-muted-foreground">{f.because.join('. ')}.</p>}
                </div>
              ))}
            </SectionBody>
          </Section>
        </aside>
      </div>

      <Section
        title="From a mark on the prototype to changed software"
        description="Point at the prototype, say what should change, and follow it through: what Socra read, the acceptance criteria, the spec it changes, then the next build."
        action={<StatusBadge tone={live.feedback.length ? 'ok' : 'off'}>{live.feedback.length ? `${live.feedback.length} real mark${live.feedback.length > 1 ? 's' : ''}` : 'No marks yet'}</StatusBadge>}
      >
        <ol className="grid gap-2 px-5 pt-4 sm:grid-cols-5">
          {vibeLoopSteps.map((s, index) => (
            <li key={s.id}>
              <button type="button" onClick={() => setLoopStep(s.id)} aria-current={loopStep === s.id ? 'step' : undefined} className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60', loopStep === s.id ? 'border-primary/60 bg-primary/5' : 'border-border')}>
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', index < stageIndex ? 'bg-primary text-primary-foreground' : index === stageIndex ? 'border border-primary text-primary' : 'bg-muted text-muted-foreground')}>{index < stageIndex ? <Check className="size-3.5" /> : index + 1}</span>
                <span className="font-medium">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <SectionBody>
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">{loopStep === stage ? 'Where your latest mark is' : `Step ${vibeLoopSteps.findIndex((x) => x.id === loopStep) + 1}`}</p>
            <h3 className="text-lg font-semibold">{brand(step.title)}</h3>
            {latest && loopStep === stage ? <MarkSteps mark={latest} /> : <p className="text-base text-muted-foreground">{brand(step.detail)}</p>}
          </div>
          <Button type="button" className="justify-self-start" onClick={loopGo}>{loopStep === 'regenerate' ? 'Build the next version' : loopStep === 'shape' ? 'Review the living spec' : 'Open the live product'} <ArrowRight className="size-4" /></Button>
        </SectionBody>
        <div className="grid grid-cols-1 border-t border-border">
          <p className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">Latest changes</p>
          {truth.timeline.length ? truth.timeline.slice(0, 4).map((c) => <Row key={c.id} title={KIND_LABEL[c.kind] ?? c.kind} detail={c.summary} />) : <Empty>Nothing has changed yet. Start with a conversation or a mark on the prototype.</Empty>}
        </div>
      </Section>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs font-semibold text-muted-foreground uppercase">{label}</span>{children}</div>
}

function Chip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-border px-2.5 py-1 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/60">{children}</button>
}

/** The same chain as MarkChain, as a readable list for the new screens. */
function MarkSteps({ mark }: { mark: Live['feedback'][number] }) {
  const it = mark.interpretation ?? {}
  const changes = [...(it.prd ?? []), ...(it.trd ?? [])]
  const rows: [string, string][] = [
    ['Where', `${mark.shape === 'circle' ? 'Circled' : mark.shape === 'full-screen' ? 'Whole screen' : 'Pointed at'} ${mark.target ? mark.target.replace(/^Circled /, '') : 'the product'}`],
    ['What was said', `“${it.observation || mark.comment}”`],
    ['What it means', it.behaviour || 'Socra is reading what this means…'],
    ...(it.acceptance?.length ? [['Acceptance', it.acceptance.join(' · ')] as [string, string]] : []),
    ...(it.component ? [['Component', it.component] as [string, string]] : []),
    ...(changes.length ? [['Changes', changes.join(', ')] as [string, string]] : []),
    ...(it.question ? [['Question', it.question] as [string, string]] : []),
    ['Build', mark.status === 'built' ? 'In the latest version' : 'Goes into the next build'],
  ]
  return <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="[overflow-wrap:anywhere]">{v}</dd></div>)}</dl>
}

/** The interpretation chain of one mark: region, observation, behaviour, acceptance criteria, component change, spec. */
/** Under a pilot observation: what it changed in the product truth. */
export function ObservationEffects({ live }: { live: Live }) {
  const truth = useTruth(live)
  const seen = (truth?.nodes ?? []).filter((n) => n.id.startsWith('evidence:') && n.source === 'prototype').slice(0, 5)
  if (!truth || !seen.length) return null
  return <section className="studio-card"><div className="stack-header"><div><p className="eyebrow">What the pilot taught</p><h3>Observations and what they changed</h3></div><History size={16} /></div><div className="studio-list">{seen.map((n) => {
    const out = truth.edges.filter((e) => e.from === n.id).map((e) => truth.nodes.find((x) => x.id === e.to)?.title).filter(Boolean)
    return <div className="studio-list-row" key={n.id}><span className="studio-row-main"><strong>{n.title}</strong><small>{out.length ? `Changed: ${out.join(', ')}` : 'Socra is carrying it into the PRD and TRD…'}</small></span></div>
  })}</div></section>
}
