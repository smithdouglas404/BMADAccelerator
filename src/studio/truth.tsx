'use client'
// The Product Truth Graph view (the design team's v7 screen), filled from this product's real records:
// every node is something that happened, every statement says what kind of truth it is, inferences are
// in plain words with the technical reading in a side panel, every change says why, and the use case's
// confidence is calculated from the graph. The vibe loop follows the real marks on the prototype.
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Database, FileText, GitBranch, History, MousePointer2, Network, Wand2, Code2 } from 'lucide-react'
import { truthGraphSchema, vibeLoopSteps, type TruthEdge, type TruthNode } from './graph'
import { api, ago, type Live } from './live'
import type { StudioView } from './flow'

export type Statement = 'fact' | 'evidence' | 'inference' | 'recommendation' | 'decision' | 'open' | 'rejected' | 'generated'
export type TNode = TruthNode & { statement: Statement; at: string; by: string; view: StudioView; interpretations: { plain: string; technical: string }[] }
export type TChange = { id: string; node: string; kind: string; summary: string; before: string; after: string; by: string; createdAt: string; title: string; because: { id: string; title: string; type: string; statement: Statement; relation: string }[]; affects: { id: string; title: string; type: string }[] }
export type TFactor = { key: string; label: string; value: number; because: string[] }
export type Truth = { nodes: TNode[]; edges: TruthEdge[]; timeline: TChange[]; confidence: { overall: number; factors: TFactor[] } }

export const STATEMENT_LABEL: Record<Statement, string> = {
  fact: 'said by a person', evidence: 'outside evidence', inference: 'Muse inference', recommendation: 'recommendation',
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

export function TruthGraphView({ live, changeView, setToast, focusNode = '' }: Props) {
  const truth = useTruth(live)
  const nodes = useMemo(() => truth?.nodes ?? [], [truth])
  const edges = truth?.edges ?? []
  const [tab, setTab] = useState<'graph' | 'why'>(focusNode ? 'why' : 'graph')
  const [selectedNodeId, setSelectedNodeId] = useState(focusNode || 'usecase')
  const [whyFor, setWhyFor] = useState(focusNode)
  const [filter, setFilter] = useState<'all' | 'owner' | 'muse' | 'prototype' | 'system'>('all')
  const [shown, setShown] = useState(PAGE)
  const [technical, setTechnical] = useState(false)
  const latest = live.feedback[0]
  const stage = !latest ? 'select' : latest.status === 'built' ? 'regenerate' : latest.interpretation?.behaviour && (latest.interpretation.prd?.length || latest.interpretation.trd?.length) ? 'shape' : latest.interpretation?.behaviour ? 'interpret' : 'describe'
  const [loopStep, setLoopStep] = useState(stage)
  useEffect(() => setLoopStep(stage), [stage])
  if (!truth) return <div className="page-wrap truth-page"><div className="page-intro truth-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Product Truth Graph</p><h1>Reading what<br /><em>really happened…</em></h1></div></div></div>

  const ordered = [...nodes].sort((a, b) => (LANE[a.source] ?? 2) - (LANE[b.source] ?? 2) || +new Date(b.at || 0) - +new Date(a.at || 0))
  const filteredNodes = ordered.filter((node) => filter === 'all' || node.source === filter || (filter === 'owner' && node.source === 'evidence'))
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0]
  const selectedEdges = selectedNode ? edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id) : []
  const typeLabel = (type: string) => type.replace('-', ' ')
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id
  const timeline = whyFor ? truth.timeline.filter((c) => c.node === whyFor || c.because.some((b) => b.id === whyFor)) : truth.timeline
  const openWhy = (id: string) => { setWhyFor(id); setTab('why') }
  const step = vibeLoopSteps.find((s) => s.id === loopStep) ?? vibeLoopSteps[0]
  const loopGo = () => {
    if (loopStep === 'select' || loopStep === 'describe') changeView('review')
    else if (loopStep === 'interpret') { setToast(latest?.interpretation?.behaviour ? 'The Muse has read your mark; shape it in the living spec' : 'The Muse is reading your mark and will write what it means'); changeView('review') }
    else if (loopStep === 'shape') changeView('spec')
    else changeView('brief')
  }

  return <div className="page-wrap truth-page">
    <div className="page-intro truth-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Semantic layer · one Studio record, linked out</p><h1>See why each product<br /><em>truth exists.</em></h1><p>Every node is something that really happened in {live.name}: what someone said, evidence, what the Muse inferred, what a person decided, the spec it wrote, a mark on the prototype, a build. Inferences never pass for decisions.</p></div><div className="truth-intro-side"><div className="truth-score"><span className="eyebrow">Use case confidence</span><strong>{truth.confidence.overall}%</strong><small>{nodes.length} meaning objects · {edges.length} relations</small></div><button className="button button-primary" type="button" onClick={() => changeView('review')}><MousePointer2 size={15} /> Start vibe loop</button></div></div>
    <div className="truth-tabs"><button className={tab === 'graph' ? 'is-active' : ''} type="button" onClick={() => setTab('graph')}><Network size={14} /> Trace graph <span>{edges.length} relations</span></button><button className={tab === 'why' ? 'is-active' : ''} type="button" onClick={() => { setWhyFor(''); setTab('why') }}><History size={14} /> Why did this change? <span>{truth.timeline.length} changes</span></button><button type="button" onClick={() => changeView('spec')}><FileText size={14} /> Open living spec <span>PRD + TRD</span></button><button type="button" onClick={() => changeView('connections')}><GitBranch size={14} /> Linked projections <span>Git · Linear</span></button></div>
    <div className="truth-layout">
      {tab === 'graph' ? <section className="truth-graph-card"><div className="truth-card-heading"><div><p className="eyebrow">Product Truth Graph · v{truthGraphSchema.version}</p><h2>Meaning is a connected system</h2></div><div className="truth-filters">{(['all', 'owner', 'muse', 'prototype', 'system'] as const).map((value) => <button className={filter === value ? 'is-active' : ''} type="button" key={value} onClick={() => { setFilter(value); setShown(PAGE) }}>{value === 'all' ? 'All sources' : value === 'owner' ? 'people & evidence' : value}</button>)}</div></div>
        <div className="truth-graph-canvas"><div className="graph-lane-labels"><span>Human meaning</span><span>Muse interpretation</span><span>Specification & work</span></div><div className="truth-node-grid">{filteredNodes.slice(0, shown).map((node) => <button type="button" key={node.id} className={`truth-node truth-node-${node.type} ${selectedNode?.id === node.id ? 'is-selected' : ''}`} onClick={() => setSelectedNodeId(node.id)}><span className="truth-node-top"><span className={`truth-node-dot ${node.source}`} /><small>{typeLabel(node.type)} · {STATEMENT_LABEL[node.statement]}</small></span><strong>{node.title}</strong><span>{node.interpretations[0]?.plain ?? node.detail}</span><div className="truth-node-tags">{node.semanticTags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}</div></button>)}</div>
          {nodes.length <= 1 && <p className="studio-muted">Nothing has happened in this product yet. The graph fills as people talk, add evidence, decide and mark up the prototype; nothing is made up.</p>}
          {filteredNodes.length > shown && <button className="text-button" type="button" onClick={() => setShown(shown + PAGE * 2)}>Show {Math.min(filteredNodes.length - shown, PAGE * 2)} more of {filteredNodes.length} <ArrowRight size={13} /></button>}
        </div><div className="truth-graph-footer"><span><Network size={14} /> Edges explain why a node exists, not just where it is stored.</span><span>{truthGraphSchema.distributedAccess}</span></div></section>
      : <section className="truth-graph-card"><div className="truth-card-heading"><div><p className="eyebrow">Why did this change?{whyFor ? ` · ${titleOf(whyFor)}` : ''}</p><h2>Every change, with its reasons</h2></div>{whyFor && <div className="truth-filters"><button type="button" className="is-active" onClick={() => setWhyFor('')}>Show every change</button></div>}</div>
        <div className="studio-why-list">{timeline.length ? timeline.map((c) => <article className="studio-why" key={c.id}>
          <div className="studio-why-top"><span className={`studio-why-kind is-${c.kind}`}>{KIND_LABEL[c.kind] ?? c.kind}</span><button type="button" className="text-button" onClick={() => { setSelectedNodeId(c.node); setTab('graph') }}>{c.title}</button><small>{ago(c.createdAt)}{c.by ? ` · ${c.by}` : ''}</small></div>
          <p>{c.summary}</p>
          {c.because.length > 0 && <div className="studio-why-chain"><span className="eyebrow">Because</span>{c.because.map((b, i) => <button type="button" key={`${b.id}-${i}`} onClick={() => { setSelectedNodeId(b.id); setTab('graph') }}><em>{b.relation}</em> {b.title} <small>{STATEMENT_LABEL[b.statement]}</small></button>)}</div>}
          {c.affects.length > 0 && <div className="studio-why-chain"><span className="eyebrow">It affects</span>{c.affects.map((a) => <button type="button" key={a.id} onClick={() => { setSelectedNodeId(a.id); setTab('graph') }}>{a.title}</button>)}</div>}
          {(c.before || c.after) && <details className="studio-why-diff"><summary>See the change</summary>{c.before && <div><span className="eyebrow">Before</span><p>{c.before}</p></div>}{c.after && <div><span className="eyebrow">After</span><p>{c.after}</p></div>}</details>}
        </article>) : <p className="studio-muted">{whyFor ? 'Nothing has changed this yet.' : 'No changes yet. Each one appears here with what caused it, the moment it happens.'}</p>}</div></section>}
      {selectedNode && <aside className="truth-detail-column"><section className="truth-detail-card"><div className="truth-card-heading"><div><p className="eyebrow">Selected meaning object</p><h3>{selectedNode.title}</h3></div><span className={`truth-confidence ${selectedNode.confidence}`}>{selectedNode.confidence}</span></div><p className="truth-detail-copy studio-message-text">{selectedNode.detail}</p><div className="truth-detail-meta"><span><strong>Statement</strong>{STATEMENT_LABEL[selectedNode.statement]}</span><span><strong>Source</strong>{selectedNode.by || selectedNode.source}</span><span><strong>Status</strong>{selectedNode.status}</span></div>
        {selectedNode.interpretations.length > 0 && <div className="truth-semantic-block"><span className="eyebrow">What this probably means</span>{selectedNode.interpretations.map((i) => <p className="studio-plain" key={i.plain}>{i.plain}{technical && <small><Code2 size={11} /> {i.technical}</small>}</p>)}</div>}
        <div className="truth-semantic-block"><span className="eyebrow">Semantic tags</span><div>{selectedNode.semanticTags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
        <div className="truth-edge-list"><span className="eyebrow">Connected relations · {selectedEdges.length}</span>{selectedEdges.slice(0, 12).map((edge) => <button type="button" key={edge.id} onClick={() => setSelectedNodeId(edge.from === selectedNode.id ? edge.to : edge.from)}><span className="truth-edge-relation">{edge.relation}</span><span>{edge.from === selectedNode.id ? `${edge.label} → ${titleOf(edge.to)}` : `${titleOf(edge.from)} ${edge.label}`}</span><ArrowRight size={13} /></button>)}</div>
        <div className="truth-detail-actions"><button className="button button-primary button-small" type="button" onClick={() => changeView(selectedNode.view)}><Wand2 size={13} /> Open where it lives</button><button className="button button-quiet button-small" type="button" onClick={() => openWhy(selectedNode.id)}><History size={13} /> Why did this change?</button><button className="text-button" type="button" onClick={() => setTechnical(!technical)}><Code2 size={13} /> {technical ? 'Hide the technical view' : 'Technical view'}</button></div>
        {technical && <div className="studio-technical"><span className="eyebrow">Technical view</span><p><strong>Node</strong> {selectedNode.id} · {selectedNode.type} · {selectedNode.ontologyClass}</p><p><strong>Created</strong> {selectedNode.at ? new Date(selectedNode.at).toLocaleString() : 'n/a'}</p>{selectedNode.section && <p><strong>Section</strong> {selectedNode.section}</p>}{selectedNode.interpretations.map((i) => <p key={i.technical}>{i.technical}</p>)}</div>}
      </section>
      <section className="truth-ontology-card"><div className="truth-card-heading"><div><p className="eyebrow">Use case confidence · from the graph</p><h3>How sure we are, and why</h3></div><Database size={15} /></div><div className="ontology-list">{truth.confidence.factors.map((f) => <div key={f.key}><span>{f.label} · {f.value}%</span><p>{f.because.join('. ')}.</p></div>)}</div><p className="ontology-note"><Network size={13} /> Calculated only from what is connected in the graph. Readiness guides what to learn next; it never blocks a build.</p></section></aside>}
    </div>
    <section className="vibe-loop-card"><div className="truth-card-heading"><div><p className="eyebrow">Interactive prototype loop</p><h2>From vibe signal to changed software</h2><p className="card-lede">Point at the prototype, say what should change, and follow it through: what the Muse read, the acceptance criteria, the component and the spec it changes, then the next build.</p></div><span className="loop-state"><span />{live.feedback.length ? `${live.feedback.length} real annotation${live.feedback.length > 1 ? 's' : ''}` : 'No annotation in this product yet'}</span></div><div className="vibe-loop-steps">{vibeLoopSteps.map((s, index) => <button type="button" key={s.id} className={`vibe-loop-step ${loopStep === s.id ? 'is-active' : ''} ${index < vibeLoopSteps.findIndex((item) => item.id === stage) ? 'is-complete' : ''}`} onClick={() => setLoopStep(s.id)}><span className="loop-step-number">0{index + 1}</span><strong>{s.label}</strong><small>{s.title}</small><em>{s.artifact}</em></button>)}</div><div className="vibe-loop-detail"><div><span className="eyebrow">{loopStep === stage ? 'Where your latest mark is' : 'Step'}</span><h3>{step.title}</h3><p>{latest && loopStep === stage ? <MarkChain mark={latest} /> : step.detail}</p></div><div className="vibe-loop-actions"><button className="button button-primary button-small" type="button" onClick={loopGo}>{loopStep === 'regenerate' ? 'Build the next version' : loopStep === 'shape' ? 'Review the living spec' : 'Open the live product'} <ArrowRight size={13} /></button></div></div><div className="session-edge-strip"><span className="eyebrow">Latest changes · {truth.timeline.length}</span>{truth.timeline.length ? truth.timeline.slice(0, 4).map((c) => <span key={c.id}><strong>{KIND_LABEL[c.kind] ?? c.kind}</strong>{c.summary}</span>) : <span>Nothing has changed yet. Start with a conversation or a mark on the prototype.</span>}</div></section>
  </div>
}

/** The interpretation chain of one mark: region, observation, behaviour, acceptance criteria, component change, spec. */
export function MarkChain({ mark }: { mark: Live['feedback'][number] }) {
  const it = mark.interpretation ?? {}
  const changes = [...(it.prd ?? []), ...(it.trd ?? [])]
  return <span className="studio-chain">
    <span><em>Region</em>{mark.shape === 'circle' ? 'Circled' : mark.shape === 'full-screen' ? 'Whole screen' : 'Pointed at'} {mark.target || 'the product'}</span>
    <span><em>Observation</em>“{it.observation || mark.comment}”</span>
    {it.behaviour ? <span><em>Behaviour</em>{it.behaviour}</span> : <span><em>Behaviour</em>The Muse is reading what this means…</span>}
    {!!it.acceptance?.length && <span><em>Acceptance</em>{it.acceptance.join(' · ')}</span>}
    {it.component && <span><em>Component</em>{it.component}</span>}
    {changes.length > 0 && <span><em>Changes</em>{changes.join(', ')}</span>}
    {it.question && <span><em>Question</em>{it.question}</span>}
    <span><em>Build</em>{mark.status === 'built' ? 'In the latest version' : 'Goes into the next build'}</span>
  </span>
}

/** Under a pilot observation: what it changed in the product truth. */
export function ObservationEffects({ live }: { live: Live }) {
  const truth = useTruth(live)
  const seen = (truth?.nodes ?? []).filter((n) => n.id.startsWith('evidence:') && n.source === 'prototype').slice(0, 5)
  if (!truth || !seen.length) return null
  return <section className="studio-card"><div className="stack-header"><div><p className="eyebrow">What the pilot taught</p><h3>Observations and what they changed</h3></div><History size={16} /></div><div className="studio-list">{seen.map((n) => {
    const out = truth.edges.filter((e) => e.from === n.id).map((e) => truth.nodes.find((x) => x.id === e.to)?.title).filter(Boolean)
    return <div className="studio-list-row" key={n.id}><span className="studio-row-main"><strong>{n.title}</strong><small>{out.length ? `Changed: ${out.join(', ')}` : 'The Muse is carrying it into the PRD and TRD…'}</small></span></div>
  })}</div></section>
}
