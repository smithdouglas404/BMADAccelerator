'use client'
import { useEffect, useMemo, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  Bot,
  Code2,
  Database,
  ExternalLink,
  RefreshCw,
  Upload,
  UserRound,
  ArrowRight,
  Bell,
  Check,
  CircleHelp,
  FileText,
  Filter,
  Flame,
  GitBranch,
  Layers3,
  Lightbulb,
  Mic,
  MoreHorizontal,
  MoveUpRight,
  Network,
  Plus,
  Sparkles,
  Timer,
  X,
  PenLine,
} from 'lucide-react'
import {
  type BacklogItem,
  type Capability,
  type ViewId,
  type EvidenceItem,
  type RecommendationItem,
} from './data'
import { downloadPrototypeZip } from './generation'
import { api, ago, toBacklog, toCapabilities, toEvidence, toExecution, toMessages, toRecommendations, toSpec, useLive, type Live, type StudioMessage } from './live'
import { captureLive, useVoice, type Pick } from './vibe'
import { NextMove, PeopleMenu, talkingTo, useMe, type StudioView } from './flow'
import { TruthGraphView, ObservationEffects } from './truth'
import { AgentsView } from './agents'
import { StoryMapView } from './storymap'
import { BoardView } from './board'
import { StudioMarkdown, ReadinessFactors, ObservationComposer, SyncPreview, ProvidersCard } from './extras'
import { PRODUCT_LINE } from '@/lib/brand'
import { StudioFrame, StudioSidebar, StudioTopBar } from './shell'
import { ConversationView } from './socra'
import { OverviewView } from './overview'
import { SpecView } from './specview'
import { BriefView } from './brief'
import { ReviewView, PreviewCard, AnnotationPanel } from './review'

const viewTitles: Record<StudioView, string> = {
  review: 'Try & mark up',
  overview: 'Whole product',
  conversation: 'Work with Socra',
  validation: 'Validate use case',
  product: 'Product shape',
  evidence: 'Evidence & signals',
  truth: 'Product Truth Graph',
  spec: 'Living specification',
  readiness: 'Pilot readiness',
  brief: 'Prototype brief',
  pilot: 'Board',
  storymap: 'Story map',
  connections: 'Connections',
  agents: 'Agents',
}

const kindLabels: Record<BacklogItem['kind'], string> = {
  capture: 'new thought',
  epic: 'capability signal',
  distraction: 'parked for later',
}

const EMPTY_CAPABILITY: Capability = { id: '', label: 'Whole product', kicker: 'Finding its shape', readiness: 0, delta: 'new', description: 'Socra is reading what you said and laying out everything the leading products of this kind have.', signal: 'The floor is being laid. Keep talking: nothing needs to be a ticket yet.', color: '#d7f58b' }

export type AnnotationShape = 'object' | 'circle' | 'full-screen'

function App({ id }: { id: string }) {
  const { data, error, reload } = useLive(id)
  if (!data) {
    return (
      <div className="app-shell studio-loading">
        <div className="studio-loading-card"><div className="brand-mark"><span /><span /><span /></div><p className="eyebrow">{PRODUCT_LINE}</p><strong>{error ? 'This product could not be opened.' : 'Opening the product…'}</strong>{error && <small>{error}</small>}{error && <a className="text-button" href="/">Back to all products <ArrowRight size={14} /></a>}</div>
      </div>
    )
  }
  return <Studio live={data} reload={reload} />
}

function Studio({ live, reload }: { live: Live; reload: () => Promise<void> }) {
  const [activeView, setActiveView] = useState<StudioView>(() => {
    if (typeof window === 'undefined') return 'overview'
    const v = new URLSearchParams(window.location.search).get('view') as StudioView | null
    return v && v in viewTitles ? v : 'overview'
  })
  const [draft, setDraft] = useState('')
  const [capture, setCapture] = useState('')
  const [toast, setToast] = useState('')
  const [previewMode, setPreviewMode] = useState<'home' | 'thread'>('home')
  const [showAllBacklog, setShowAllBacklog] = useState(false)
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotationTarget, setAnnotationTarget] = useState('')
  const [annotationNote, setAnnotationNote] = useState('')
  const [annotationVoice, setAnnotationVoice] = useState(false)
  const [capturedFrame, setCapturedFrame] = useState('')
  const [annotationShape, setAnnotationShape] = useState<AnnotationShape>('object')
  const [annotationPick, setAnnotationPick] = useState<Pick | null>(null)
  const [prototypeStatus, setPrototypeStatus] = useState<'idle' | 'assembling' | 'ready'>('idle')
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([])
  const [probeQuestion, setProbeQuestion] = useState('')
  const [pendingMessages, setPendingMessages] = useState<StudioMessage[]>([])
  const [me, setMe] = useMe()
  const [talkTo, setTalkTo] = useState('')

  const capabilities = useMemo(() => toCapabilities(live), [live])
  const serverMessages = useMemo(() => toMessages(live, me), [live, me])
  const backlog = useMemo(() => toBacklog(live), [live])
  const execution = useMemo(() => toExecution(live), [live])
  const evidence = useMemo(() => toEvidence(live), [live])
  const recommendationState = useMemo(() => toRecommendations(live), [live])
  const specSections = useMemo(() => toSpec(live), [live])
  const agentRoutes = live.routes
  const messages = useMemo(() => [...serverMessages, ...pendingMessages.filter((p) => !serverMessages.some((m) => m.role === 'user' && m.text === p.text))], [serverMessages, pendingMessages])
  const readiness = useMemo(() => Object.fromEntries(capabilities.map((c) => [c.id, c.readiness])), [capabilities])
  const role = live.lens
  const selected = capabilities.find((capability) => capability.id === live.focus) ?? capabilities[0] ?? EMPTY_CAPABILITY
  const overallReadiness = live.readiness.overall
  const approvalCount = live.decisions.filter((d) => d.status === 'approved').length
  const visibleBacklog = showAllBacklog ? backlog : backlog.slice(0, 3)
  const validationChecks = useMemo(() => Object.fromEntries(['problem', 'customer', 'evidence', 'proof', 'thinSlice'].map((k) => [k, live.validation?.[k]?.state === 'confirmed'])), [live.validation])
  const validationScore = live.validationScore
  const generationVersion = live.packageCount
  const voice = useVoice(live.connections.voice, (text) => { setAnnotationNote((c) => `${c}${c ? ' ' : ''}${text}`); setAnnotationVoice(true) }, setToast)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 5200)
    return () => window.clearTimeout(t)
  }, [toast])
  useEffect(() => { if (live.agentError) setToast(live.agentError) }, [live.agentError])

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) setToast(ok)
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      void reload()
    }
  }
  const patch = (body: Record<string, unknown>) => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: body })

  const [truthNode, setTruthNode] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('node') ?? ''))
  const changeView = (view: StudioView, node = '') => {
    setActiveView(view)
    setTruthNode(view === 'truth' ? node : '')
    try { window.history.replaceState(null, '', `?view=${view}${view === 'truth' && node ? `&node=${encodeURIComponent(node)}` : ''}`) } catch { /* ignore */ }
    // Remembered on the product, so opening it again (from any device) picks up here.
    void fetch(`/api/use-cases/${live.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lastView: view }) }).catch(() => undefined)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setRole = (lens: 'owner' | 'engineer') => void act(() => patch({ lens }), lens === 'engineer' ? 'Product engineer lens: the technical interpretation is visible' : 'Product owner lens: product meaning first')

  const focusCapability = (capability: Capability) => {
    setActiveView('conversation')
    if (!capability.id) return
    void act(() => patch({ focus: capability.id }), `Socra is now holding the ${capability.label.toLowerCase()} conversation`)
  }

  const sendMessage = (rawText = draft, spoken?: string) => {
    const text = rawText.trim()
    if (!text) return
    setPendingMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', label: 'You', text, time: 'now' }])
    setDraft('')
    const to = talkTo
    void act(async () => {
      const r = await api<{ approved: boolean; picked: number[] }>(`/api/use-cases/${live.id}/messages`, { json: { content: text, author: me, ...(to ? { to } : {}), ...(spoken ? { raw: spoken, source: 'Voice' } : {}) } })
      setToast(r.picked?.length ? `Option ${r.picked.join(' and ')} chosen and carried forward. You can undo it.` : r.approved ? 'Approved and carried forward. You can undo it.' : to ? `Asked ${talkingTo(to, live)}; the answer appears here` : 'Thought held in the backlog for Socra to curate')
    })
  }
  const composerVoice = useVoice(live.connections.voice, (text, spoken) => sendMessage(text, spoken), setToast, { clean: true })

  const captureIdea = () => {
    const text = capture.trim()
    if (!text) return
    setCapture('')
    void act(() => api(`/api/use-cases/${live.id}/capture`, { json: { text, source: 'Studio sidebar' } }), 'Added to the ambient backlog — Socra will find its pattern')
  }

  const curate = (itemId: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => {
    const by = me.name || me.role
    if (kind === 'edit') {
      const item = live.backlog.find((b) => b.id === itemId)
      const title = window.prompt('Change it in your own words. Socra carries the change through the spec and the board.', item?.title ?? '')
      if (title && title.trim() && title.trim() !== item?.title) void act(() => api(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { title: title.trim(), by } }), 'Changed: Socra is carrying it through')
      return
    }
    if (kind === 'withdraw') {
      if (window.confirm('Withdraw this? It stays in the history, and Socra takes it out of the spec and the board.')) void act(() => api(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { withdraw: true, by } }), 'Withdrawn, and kept in the history')
      return
    }
    void act(() => api(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { kind, group: kind === 'distraction' ? undefined : selected.label } }), kind === 'distraction' ? 'Parked without losing the thought' : 'Curated into the active capability')
  }

  const setPreview = (mode: 'home' | 'thread') => {
    setPreviewMode(mode)
    setToast(mode === 'home' ? 'Previewing the live product' : 'Previewing the latest held thought')
  }

  const askRecommendation = (recommendation: RecommendationItem) => {
    setProbeQuestion(recommendation.prompt)
    setActiveView('conversation')
    void act(() => api(`/api/use-cases/${live.id}/backlog/${recommendation.id}`, { method: 'PATCH', json: { pull: true } }), 'Recommendation pulled into the backlog and ready for a probing conversation')
  }

  const toggleValidation = (key: string) =>
    void act(() => patch({ validation: { key, state: validationChecks[key] ? 'probe' : 'confirmed' } }), 'Validation signal updated — the readiness recommendation is live')

  const generatePrototype = () => {
    setPrototypeStatus('assembling')
    setToast('Assembling PRFAQ, living spec, evidence, technical requirements, and Kanban into a Claude Code package')
    void act(async () => {
      const r = await api<{ iteration: number; files: Record<string, string> }>(`/api/use-cases/${live.id}/package`, { method: 'POST' })
      setGeneratedFiles(Object.keys(r.files))
      downloadPrototypeZip(r.files, `${live.slug}-claude-code-prototype-${r.iteration}.zip`)
      setPrototypeStatus('ready')
      setToast(`Claude Code ZIP (iteration ${r.iteration}) generated and downloaded`)
    }).catch(() => setPrototypeStatus('idle'))
  }

  const buildNow = (opts: { redesign?: boolean; fresh?: boolean } = {}) =>
    void act(() => api(`/api/use-cases/${live.id}/generate`, { json: opts }), opts.fresh ? 'Starting fresh: the old design is set aside and Claude Code builds from the product truth' : 'Claude Code is building the next version from a fresh package')

  const onPick = async (p: Pick) => {
    setAnnotationPick(p)
    setAnnotationTarget(p.kind === 'region' ? `Circled region on ${p.path}` : 'Finding the part you clicked…')
    try {
      const r = await captureLive(live, p)
      setCapturedFrame(r.image)
      setAnnotationTarget(p.kind === 'region' ? `Circled region on ${p.path}${r.target ? ` (${r.target})` : ''}` : r.target ? `${r.target} on ${p.path}` : `Spot on ${p.path}`)
      setToast(p.kind === 'region' ? 'Captured a circled region with its annotation context' : 'Captured the selected product surface with its annotation context')
    } catch (e) {
      setAnnotationTarget(p.kind === 'region' ? `Circled region on ${p.path}` : `Spot on ${p.path}`)
      setToast(e instanceof Error ? e.message : String(e))
    }
  }

  const captureFrame = async (mode: 'surface' | 'screen' = 'surface') => {
    if (live.preview.running) {
      const path = annotationPick?.path ?? '/'
      try {
        const box = document.querySelector('.live-frame') as HTMLElement | null
        const width = Math.round(box?.clientWidth || 1280)
        const height = Math.round(box?.clientHeight || 800)
        const r = await captureLive(live, mode === 'screen' ? { kind: 'screen', path, width, height } : { kind: 'point', x: -100, y: -100, width, height, path, scrollY: annotationPick?.scrollY ?? 0 })
        setCapturedFrame(r.image)
        if (!annotationTarget) setAnnotationTarget(mode === 'screen' ? `Whole screen of ${path}` : `Visible part of ${path}`)
        setToast(mode === 'screen' ? 'Captured the whole screen of the product with its annotation context' : 'Captured the visible product surface with its annotation context')
      } catch (e) {
        setToast(e instanceof Error ? e.message : String(e))
      }
      return
    }
    const target = mode === 'screen' ? document.body : document.querySelector('.product-preview-shell') as HTMLElement | null
    if (!target) return
    const canvas = await html2canvas(target, { backgroundColor: '#111412', scale: mode === 'screen' ? 1 : 1.5 })
    setCapturedFrame(canvas.toDataURL('image/png'))
    setToast(mode === 'screen' ? 'Captured the full Studio screen with its annotation context' : `${annotationShape === 'circle' ? 'Captured a circled region' : 'Captured the selected product surface'} with its annotation context`)
  }

  const addAnnotation = () => {
    const comment = annotationNote.trim()
    if (!comment) return
    const region = annotationPick?.kind === 'region' ? { x: annotationPick.x, y: annotationPick.y, w: annotationPick.w, h: annotationPick.h } : annotationPick?.kind === 'point' ? { x: annotationPick.x, y: annotationPick.y, w: 0, h: 0 } : undefined
    const body = { comment, image: capturedFrame || undefined, target: annotationTarget || 'selected product surface', shape: annotationShape, pageUrl: annotationPick?.path ?? '/', region, voice: annotationVoice }
    setAnnotationNote('')
    setCapturedFrame('')
    setAnnotationTarget('')
    setAnnotationPick(null)
    setAnnotationVoice(false)
    setAnnotationMode(false)
    void act(() => api(`/api/use-cases/${live.id}/feedback`, { json: body }), 'Annotation added to the backlog — Socra will ask what it means')
  }

  const toggleVoice = voice.toggle
  const isListening = voice.listening
  const busy = live.agentBusy || live.pending > 0
  const props = { live, reload, act, setToast, changeView }

  return (
    <StudioFrame sidebar={<StudioSidebar useCase={{
      id: live.id, name: live.name, stageLabel: live.stageLabel, active: activeView, onNavigate: (v) => changeView(v),
      badges: { conversation: live.decisions.filter((d) => d.status === 'open').length },
      thoughts: backlog.length, buildMoves: execution.length,
      onCapture: () => { if (!document.getElementById('ambient-capture')) changeView('product'); window.setTimeout(() => document.getElementById('ambient-capture')?.focus(), 80) },
    }} />}>
      <StudioTopBar
        crumbs={<><span className="truncate">{live.name}</span><span aria-hidden>/</span><strong className="truncate font-semibold text-foreground">{viewTitles[activeView]}</strong></>}
        actions={<><span className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-2 rounded-full bg-primary" />{live.generateBusy ? live.generateStatus || 'Claude Code is building' : busy ? live.agentStatus || 'Socra is working' : 'All changes saved'}</span><button className="icon-button" type="button" aria-label="Notifications" onClick={() => changeView('conversation')}><Bell size={17} /></button><PeopleMenu live={live} me={me} setMe={setMe} setToast={setToast} /></>}
      />
      <div className="main-content">
        <NextMove live={live} changeView={changeView} />
        {!live.agentsEnabled && <div className="studio-banner"><CircleHelp size={14} /><span>Socra and Claude Code switch on once Claude is signed in. Everything you say is kept meanwhile.</span><a href="/settings">Open Settings <ArrowRight size={13} /></a></div>}

        {activeView === 'overview' && <OverviewView {...{ live, act, me, selected, capabilities, readiness, overallReadiness, approvalCount, messages, backlog, focusCapability, changeView, capture, setCapture, captureIdea }} preview={<><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} setAnnotationMode={setAnnotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} /><AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} /></>} />}
        {activeView === 'conversation' && <ConversationView {...{ live, act, me, talkTo, setTalkTo, voice: composerVoice, selected, capabilities, messages, draft, setDraft, sendMessage, focusCapability, setToast, changeView }} preview={<PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} onPick={onPick} />} />}
        {activeView === 'review' && <ReviewView {...{ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }} />}
        {activeView === 'validation' && <ValidationView {...{ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }} />}
        {activeView === 'product' && <ProductView {...{ live, act, selected, capabilities, backlog, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, capture, setCapture, captureIdea, approvalCount, changeView, toast, setToast }} />}
        {activeView === 'evidence' && <EvidenceView {...{ live, act, evidence, changeView, role, setRole, setToast }} />}
        {activeView === 'agents' && <AgentsView live={live} me={me} setToast={setToast} />}
        {activeView === 'truth' && <TruthGraphView key={truthNode || 'all'} live={live} changeView={changeView} setToast={setToast} focusNode={truthNode} />}
        {activeView === 'storymap' && <StoryMapView live={live} me={me} changeView={changeView} setToast={setToast} />}
        {activeView === 'spec' && <SpecView {...{ ...props, specSections, messages, evidence, backlog, execution }} />}
        {activeView === 'readiness' && <ReadinessView {...{ live, capabilities, readiness, overallReadiness, selected, focusCapability, changeView }} />}
        {activeView === 'brief' && <BriefView {...{ live, act, validationScore, repositoryUrl: live.repoUrl, generatedFiles: generatedFiles.length ? generatedFiles : live.packageFiles, prototypeStatus, generatePrototype, buildNow, generationVersion, setTechnicalOpen, technicalOpen, changeView, role, setRole }} />}
        {activeView === 'pilot' && <BoardView live={live} me={me} buildNow={buildNow} changeView={changeView} setToast={setToast}><ObservationComposer live={live} act={act} /><ObservationEffects live={live} /></BoardView>}
        {activeView === 'connections' && <ConnectionsView {...{ live, act, setToast, changeView }} />}

        {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
      </div>
    </StudioFrame>
  )
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

type ProductProps = { live: Live; act: Act; selected: Capability; capabilities: Capability[]; backlog: BacklogItem[]; visibleBacklog: BacklogItem[]; showAllBacklog: boolean; setShowAllBacklog: (value: boolean) => void; curate: (id: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => void; capture: string; setCapture: (value: string) => void; captureIdea: () => void; approvalCount: number; changeView: (view: ViewId) => void; toast: string; setToast: (value: string) => void }

function ProductView({ live, act, selected, capabilities: caps, backlog, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, capture, setCapture, captureIdea, approvalCount, changeView, setToast }: ProductProps) {
  const [editing, setEditing] = useState(false)
  const [prfaqDraft, setPrfaqDraft] = useState(live.prfaq)
  const savePrfaq = () => { setEditing(false); void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { prfaq: prfaqDraft } }), 'PRFAQ saved in your words — Socra will carry it into the spec') }
  const waiting = backlog.filter((b) => b.kind === 'capture').length
  const decisions = live.decisions.slice(-8)
  void caps
  return <div className="page-wrap product-page"><div className="page-intro"><div><p className="eyebrow">The living product shape</p><h1>Keep the dream visible<br />as it becomes specific.</h1><p>The PRFAQ is not a document at the end of the process. It is the shared surface where the original voice, approved decisions, and open questions can sit together.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => changeView('conversation')}>Keep shaping <ArrowRight size={16} /></button><span>{approvalCount} approvals carried forward</span></div></div><div className="product-shape-grid"><section className="prfaq-card"><div className="prfaq-toolbar"><div className="doc-title"><span className="doc-icon"><FileText size={16} /></span><span><strong>PRFAQ / {live.slug}-v0.{live.packageCount}</strong><small>living · last touched {ago(live.prfaqUpdatedAt ?? live.updatedAt)}</small></span></div><div className="toolbar-actions"><span className="locked-chip"><Check size={12} /> working truth</span>{editing ? <><button className="button button-primary button-small" type="button" onClick={savePrfaq}><Check size={13} /> Save</button><button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)}>Cancel</button></> : <button className="icon-button subtle" type="button" onClick={() => { setPrfaqDraft(live.prfaq); setEditing(true) }} aria-label="Edit the PRFAQ" title="Edit in your own words"><MoreHorizontal size={16} /></button>}</div></div><div className="prfaq-content"><div className="doc-kicker">{live.audience ? `FOR ${live.audience.toUpperCase()}` : 'FOR THE CUSTOMER THE MUSE IS STILL NAMING'}</div><h2>{live.statement || live.name}</h2><p className="doc-lede">{live.description}</p><div className="doc-divider" />{editing ? <textarea className="spec-editor" value={prfaqDraft} onChange={(event) => setPrfaqDraft(event.target.value)} rows={18} /> : live.prfaq ? <StudioMarkdown text={live.prfaq} /> : <div className="doc-section"><div className="doc-section-label"><span>01</span><strong>Why customers care</strong></div><div><p>Socra writes the press release and FAQ from your conversation. It appears here as soon as there is enough to say honestly.</p>{live.customerQuote && <div className="quote-callout"><span>“</span><p>{live.customerQuote.replace(/[“”]/g, '')}</p></div>}</div></div>}<div className="doc-section"><div className="doc-section-label"><span>{live.prfaq ? '··' : '02'}</span><strong>Decisions captured</strong></div><div className="decision-list">{decisions.length === 0 && <div className="open-question"><CircleHelp size={14} /><span>No decisions yet. A plain “yes” to Socra carries its proposal forward.</span><small>open with Socra</small></div>}{decisions.map((d) => <div key={d.id} className={d.status === 'approved' ? '' : 'open-question'}>{d.status === 'approved' ? <Check size={14} /> : <CircleHelp size={14} />}<span>{d.text}</span><small>{d.status === 'approved' ? 'approved' : d.status === 'assumed' ? 'assumed · say no to change it' : 'open with Socra'} · {ago(d.createdAt)}</small></div>)}</div></div></div></section><aside className="product-shape-aside"><div className="shape-summary"><div className="aside-block-header"><span className="eyebrow">Shape signal</span><Sparkles size={15} /></div><strong>{waiting ? `${waiting} ${waiting === 1 ? 'thought is' : 'thoughts are'} waiting to find a home.` : 'Every thought you have had has a home.'}</strong><p>{selected.signal}</p><button className="button button-small" type="button" onClick={() => changeView('conversation')}>Ask Socra <ArrowRight size={14} /></button></div><div className="curation-card"><div className="curation-header"><div><p className="eyebrow">Curated backlog</p><h3>{backlog.length} signals, held gently</h3></div><Filter size={15} /></div><BacklogList items={visibleBacklog} curate={curate} /><button className="text-button center-button" type="button" onClick={() => setShowAllBacklog(!showAllBacklog)}>{showAllBacklog ? 'Show fewer signals' : 'See every signal'} <ArrowRight size={14} /></button></div><div className="capture-card"><div><span className="capture-orb"><Mic size={15} /></span><div><strong>Catch the next thought</strong><small>It does not need to be useful yet.</small></div></div><div className="capture-input"><input id="ambient-capture" value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') captureIdea() }} placeholder="I keep thinking about…" /><button type="button" onClick={captureIdea} aria-label="Add thought"><Plus size={16} /></button></div></div></aside></div></div>
}


function BacklogList({ items, curate }: { items: BacklogItem[]; curate: (id: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => void }) {
  return <div className="backlog-items">{items.map((item) => <div className="backlog-item" key={item.id}><div className={`backlog-kind ${item.kind}`}><span>{item.kind === 'capture' ? <Lightbulb size={14} /> : item.kind === 'epic' ? <Layers3 size={14} /> : <Timer size={14} />}</span></div><div className="backlog-item-copy"><div><strong>{item.title}</strong><span className="backlog-age">{item.age}</span></div><p>{item.note}</p>{(item as BacklogItem & { annotationId?: string }).annotationId && <a className="studio-markup-thumb" href={`/api/feedback/${(item as BacklogItem & { annotationId?: string }).annotationId}/image`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${(item as BacklogItem & { annotationId?: string }).annotationId}/image`} alt="The marked-up screen" loading="lazy" /></a>}<div className="backlog-tags"><span>{(item as BacklogItem & { ownerState?: string }).ownerState ?? kindLabels[item.kind]}</span><span>{item.group}</span><span>{item.source}</span></div></div><div className="backlog-actions"><button type="button" onClick={() => curate(item.id, 'epic')} title="Group as capability"><Layers3 size={14} /></button><button type="button" onClick={() => curate(item.id, 'distraction')} title="Park for later"><Timer size={14} /></button><button type="button" onClick={() => curate(item.id, 'edit')} title="Change it"><PenLine size={14} /></button><button type="button" onClick={() => curate(item.id, 'withdraw')} title="Withdraw (kept in history)"><X size={14} /></button></div></div>)}</div>
}

type ReadinessProps = { live: Live; capabilities: Capability[]; readiness: Record<string, number>; overallReadiness: number; selected: Capability; focusCapability: (capability: Capability) => void; changeView: (view: ViewId) => void }



function ReadinessView({ live, capabilities: caps, readiness, overallReadiness, selected, focusCapability, changeView }: ReadinessProps) {
  return <div className="page-wrap readiness-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Readiness is a conversation</p><h1>Find the ceiling,<br />not a false finish line.</h1><p>A capability is ready when the product can make a promise and keep it. The percentages are signals for where to look next — not grades for the team.</p></div><div className="readiness-hero-score"><div className="eyebrow">Current honest read</div><strong>{overallReadiness}%</strong><span>ready for a thin-slice pilot</span></div></div><div className="readiness-detail-grid"><section className="ceiling-card"><div className="ceiling-header"><div><p className="eyebrow">Capability ceiling</p><h2>What still needs to become true</h2></div><span className="ceiling-legend"><span className="legend-dot ready" />ready <span className="legend-dot open" />needs conversation</span></div><div className="ceiling-list">{caps.map((capability) => <div className="ceiling-row" key={capability.id}><div className="ceiling-row-title"><span className="capability-color" style={{ background: capability.color }} /><div><strong>{capability.label}</strong><small>{capability.kicker}</small></div><strong className="ceiling-number">{readiness[capability.id] ?? capability.readiness}%</strong></div><div className="ceiling-track"><span style={{ width: `${readiness[capability.id] ?? capability.readiness}%`, background: capability.color }} /><i style={{ left: `${readiness[capability.id] ?? capability.readiness}%` }} /></div><p>{capability.description}</p><div className="ceiling-row-footer"><span><MoveUpRight size={13} /> {capability.delta}</span><button type="button" onClick={() => focusCapability(capability)}>Work the edge <ArrowRight size={13} /></button></div></div>)}</div></section><aside className="readiness-aside"><div className="ceiling-callout"><span className="signal-icon"><Flame size={16} /></span><p><strong>The next honest move</strong>{selected.label} has the clearest path to a meaningful pilot moment. Socra is ready to help you sharpen its promise.</p><button className="button button-primary full-width" type="button" onClick={() => focusCapability(selected)}>Open this capability <ArrowRight size={15} /></button></div><div className="readiness-principles"><p className="eyebrow">How the Studio decides</p><div><span>01</span><p><strong>Promise before output</strong>Make sure the customer experience is clear before the build gets busy.</p></div><div><span>02</span><p><strong>Trace every move</strong>Every story should point back to a capability and a decision.</p></div><div><span>03</span><p><strong>Invite the human at the edge</strong>Questions belong in the conversation, not hidden in a workflow.</p></div></div><button className="button button-quiet full-width" type="button" onClick={() => changeView('pilot')}><GitBranch size={15} /> See the traceable build lane</button></aside></div><ReadinessFactors live={live} /></div>
}



export default App


function RoleSwitcher({ role, setRole }: { role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void }) {
  return <div className="role-switcher"><span className="eyebrow">Workspace lens</span><div><button className={role === 'owner' ? 'is-active' : ''} type="button" onClick={() => setRole('owner')}><UserRound size={13} /> Product owner</button><button className={role === 'engineer' ? 'is-active' : ''} type="button" onClick={() => setRole('engineer')}><Code2 size={13} /> Product engineer</button></div></div>
}

function ValidationView({ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }: { live: Live; validationChecks: Record<string, boolean>; validationScore: number; toggleValidation: (key: string) => void; role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void; recommendationState: RecommendationItem[]; askRecommendation: (recommendation: RecommendationItem) => void; changeView: (view: ViewId) => void; setTechnicalOpen: (value: boolean) => void; technicalOpen: boolean; agentRoutes: Array<{ id: string; agent: string; action: string; state: string; detail: string }>; probeQuestion: string }) {
  const checks = [
    { id: 'problem', label: 'The customer problem is specific', detail: `We know what feels broken before ${live.name} enters the room.` },
    { id: 'customer', label: 'The first customer is named', detail: 'The owner can describe who needs this now, not everyone who might want it.' },
    { id: 'evidence', label: 'Evidence is attached to the claim', detail: 'Conversation, research, and uploaded notes point to the same pattern.' },
    { id: 'proof', label: 'The proof point is observable', detail: 'We can tell when the customer has felt the promise.' },
    { id: 'thinSlice', label: 'A thin slice is possible', detail: 'The first pilot can prove one meaningful customer moment.' },
  ]
  return <div className="page-wrap validation-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />A use case is ready when it can make a promise</p><h1>Validate the use case<br /><em>before</em> you build around it.</h1><p>Socra turns the conversation, evidence, and open questions into a recommendation. It does not create a gate. It tells you what would make the next prototype honest.</p></div><div className="intro-actions"><RoleSwitcher {...{ role, setRole }} /><button className="button button-primary" type="button" onClick={() => changeView('brief')}>Prepare prototype brief <ArrowRight size={16} /></button></div></div><div className="validation-grid"><section className="validation-card"><div className="validation-score-row"><div><p className="eyebrow">Use case readiness</p><h2>{validationScore}%</h2><p>{validationScore >= 80 ? 'Strong enough to prototype the thin slice.' : 'Keep probing the proof point before you widen the build.'}</p></div><div className="score-orbit"><div><strong>{validationScore}%</strong><small>confidence</small></div></div></div><div className="validation-checks">{checks.map((check) => <button className={`validation-check ${validationChecks[check.id] ? 'is-done' : ''}`} key={check.id} type="button" onClick={() => toggleValidation(check.id)}><span className="check-box">{validationChecks[check.id] && <Check size={13} />}</span><span><strong>{check.label}</strong><small>{live.validation?.[check.id]?.note || check.detail}</small></span><span className="check-status">{validationChecks[check.id] ? 'confirmed' : 'probe this'}</span></button>)}</div></section><aside className="validation-aside"><div className="recommendation-stack"><div className="stack-header"><div><p className="eyebrow">Socra recommendations</p><h3>Questions worth pulling forward</h3></div><Sparkles size={16} /></div>{recommendationState.length === 0 && <p className="trace-intro">Socra pulls considerations, workflows and human pauses forward here as it learns the product.</p>}{recommendationState.map((recommendation) => <button className="recommendation-card" type="button" key={recommendation.id} onClick={() => askRecommendation(recommendation)}><div className={`recommendation-kind ${recommendation.kind}`}>{recommendation.kind === 'workflow' ? <Network size={14} /> : recommendation.kind === 'hitl' ? <UserRound size={14} /> : <CircleHelp size={14} />}</div><div><strong>{recommendation.title}</strong><p>{recommendation.reason}</p><small>Ask this in Socra conversation <ArrowRight size={12} /></small></div></button>)}</div><div className="technical-signal-card"><div className="stack-header"><div><p className="eyebrow">Quiet technical interpretation</p><h3>The system is noticing patterns</h3></div><Bot size={16} /></div>{probeQuestion && <div className="probe-question"><span className="signal-icon"><CircleHelp size={14} /></span><p><strong>Probe now</strong>{probeQuestion}</p></div>}<p>{live.techNotes[0] || 'Without making the owner learn agent vocabulary, Socra notes where a workflow could run on its own and where a person must pause it before meaning changes.'}</p><button className="text-button" type="button" onClick={() => setTechnicalOpen(!technicalOpen)}>{technicalOpen ? 'Hide technical read' : 'Inspect technical read'} <ArrowRight size={14} /></button>{technicalOpen && <div className="technical-drawer"><div><span className="technical-dot active" /><strong>Agentic workflow candidate</strong><small>{recommendationState.find((r) => r.kind === 'workflow')?.title ?? live.backlog.find((b) => b.recKind === 'workflow')?.title ?? 'None suggested yet'} · Inngest Agent Kit router</small></div><div><span className="technical-dot hitl" /><strong>Human-in-the-loop point</strong><small>{recommendationState.find((r) => r.kind === 'hitl')?.title ?? live.backlog.find((b) => b.recKind === 'hitl')?.title ?? 'The owner approves every change of meaning'}</small></div><div><span className="technical-dot ui" /><strong>UI surface suggestion</strong><small>{live.components.length ? `shadcn/ui ${live.components.slice(0, 4).map((c) => c.name).join(' + ')}` : 'shadcn/ui, chosen once the PRD has a shape'}</small></div>{live.techNotes.slice(1, 4).map((n) => <div key={n}><span className="technical-dot ui" /><strong>Technical note</strong><small>{n}</small></div>)}</div>}</div><div className="routing-mini"><p className="eyebrow">Agent Kit route</p>{agentRoutes.slice(0, 3).map((route, index) => <div className="routing-row" key={route.id}><span className={`route-node ${route.state}`} />{index < 2 && <span className="route-line" />}<span><strong>{route.agent}</strong><small>{route.action}</small></span><span className="route-state">{route.state}</span></div>)}</div></aside></div></div>
}

function EvidenceView({ live, act, evidence, changeView, role, setRole, setToast }: { live: Live; act: Act; evidence: EvidenceItem[]; changeView: (view: ViewId) => void; role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void; setToast: (value: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'interview' | 'research' | 'uploaded'>('all')
  const addEvidence = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('kind', filter === 'interview' || filter === 'research' ? filter : 'uploaded')
    setToast(`${files.map((f) => f.name).join(', ')} added to the evidence library — Socra is reading it`)
    void act(async () => {
      const res = await fetch(`/api/use-cases/${live.id}/documents`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'The upload did not go through')
    })
  }
  const shown = filter === 'all' ? evidence : evidence.filter((e) => e.type === filter)
  return <div className="page-wrap evidence-page"><div className="page-intro"><div><p className="eyebrow">Evidence library · everything Socra is allowed to believe</p><h1>Keep the “why”<br />close to the work.</h1><p>Upload research, attach an interview, or let a conversation become evidence. Every signal stays traceable to the use case, PRFAQ, or a decision.</p></div><div className="intro-actions"><RoleSwitcher {...{ role, setRole }} /><label className="button button-primary file-button"><Upload size={15} /> Add research<input type="file" multiple accept=".md,.txt,.pdf,.docx,.csv,.json,.png,.jpg,.jpeg" onChange={addEvidence} /></label></div></div><div className="evidence-toolbar"><div><span className="eyebrow">{evidence.length} sources connected</span><strong>Confidence grows when signals agree.</strong></div><div className="evidence-filters">{([['all', 'All evidence'], ['interview', 'Interviews'], ['research', 'Research'], ['uploaded', 'Uploads']] as const).map(([k, label]) => <button key={k} className={filter === k ? 'is-active' : ''} type="button" onClick={() => setFilter(k)}>{label}</button>)}</div></div><div className="evidence-grid">{shown.length === 0 && <div className="empty-column">No sources here yet. Upload research, or let the conversation become evidence.</div>}{shown.map((item) => <article className="evidence-card" key={item.id}><div className="evidence-card-top"><span className={`evidence-type ${item.type}`}>{item.type}</span><span className={`confidence ${item.confidence}`}>{item.confidence === 'high' ? <Check size={11} /> : item.confidence === 'medium' ? <CircleHelp size={11} /> : <Timer size={11} />} {item.confidence}</span></div><h3>{item.insight}</h3><div className="evidence-source"><FileText size={13} /><span><strong>{item.source}</strong><small>{item.trace}</small></span></div><button className="text-button" type="button" onClick={() => setToast(`Trace: ${item.trace || 'connected to the product shape'}`)}>See trace <ExternalLink size={12} /></button></article>)}</div><div className="evidence-footer"><div><span className="signal-icon"><Database size={15} /></span><p><strong>Socra’s rule</strong>Research can inform the conversation, but it cannot silently become a requirement. The owner still decides what belongs.</p></div><button className="button button-quiet" type="button" onClick={() => changeView('validation')}>Use evidence to validate <ArrowRight size={14} /></button></div></div>
}



function ConnectionsView({ live, act, setToast, changeView }: { live: Live; act: Act; setToast: (value: string) => void; changeView: (view: ViewId) => void }) {
  const [repositoryUrl, setRepositoryUrl] = useState(live.repoUrl)
  const [linearWorkspace, setLinearWorkspace] = useState(live.linearTeam)
  const [gitSync, setGitSync] = useState<'idle' | 'syncing' | 'synced'>('idle')
  const [linearSync, setLinearSync] = useState<'idle' | 'syncing' | 'synced'>('idle')
  const [tick, setTick] = useState(0)
  const sync = (kind: 'git' | 'linear') => {
    const setter = kind === 'git' ? setGitSync : setLinearSync
    setter('syncing')
    setToast(kind === 'git' ? 'Preparing backlog records and spec diffs for a repository branch' : 'Projecting curated backlog and spec diffs into the optional Linear workspace')
    void act(async () => {
      try {
        const r = await api<{ status?: string }>(`/api/use-cases/${live.id}/sync`, { json: { kind } })
        setter('synced')
        setToast(r.status || (kind === 'git' ? 'Git sync complete — backlog and spec diffs are traceable by source ID' : 'Linear sync complete — backlog and spec changes remain linked to Studio'))
      } catch (e) {
        setter('idle')
        throw e
      } finally {
        setTick((t) => t + 1)
      }
    })
  }
  const syncState = gitSync === 'synced' || linearSync === 'synced' ? 'synced' : gitSync === 'syncing' || linearSync === 'syncing' ? 'syncing' : 'idle'
  return <div className="page-wrap connections-page"><div className="page-intro"><div><p className="eyebrow">Connections · where the work goes next</p><h1>Keep the loop<br /><em>open.</em></h1><p>Claude Code can generate the first ZIP now. A connected repository gives the next iteration a durable home, while Linear can become an optional synchronized view of the same product truth.</p></div><div className="intro-actions"><span className="connection-status"><span className="live-pulse" /> Local workspace active</span><button className="button button-primary" type="button" onClick={() => changeView('brief')}>Back to prototype brief <ArrowRight size={16} /></button></div></div><div className="connections-grid"><section className="connection-card"><div className="connection-card-header"><span className="connection-logo github"><GitBranch size={18} /></span><div><p className="eyebrow">Source of truth</p><h2>Git repository</h2></div><span className="connection-badge">{live.connections.github && live.repoUrl ? 'Connected' : live.repoUrl ? 'URL saved' : 'Needs URL'}</span></div><p>Provide the repository URL where the generated package or future prototype branch should be pushed. {live.connections.github ? 'The GitHub token on Settings gives the Studio push permission; every build is pushed here automatically.' : 'Add a GitHub token on Settings (Models and keys) before the first real push.'}</p><label>Repository URL<input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/org/repository" /></label><div className="connection-actions"><button className="button button-primary" type="button" onClick={() => void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { repoUrl: repositoryUrl.trim() } }), 'Repository URL saved — the next package can target this repository')}>Save repository</button><button className="button button-quiet" type="button" onClick={() => sync('git')}><RefreshCw size={14} /> {gitSync === 'syncing' ? 'Syncing…' : gitSync === 'synced' ? 'Synced' : 'Sync package'}</button></div><div className="connection-note"><CircleHelp size={14} /><span>{live.gitStatus ? `${live.gitStatus}${live.gitPushedAt ? ` · ${ago(live.gitPushedAt)}` : ''}` : 'Opinionated default: keep the generated ZIP as an auditable handoff, then commit the unpacked package to a dedicated prototype branch.'}</span></div></section><section className="connection-card"><div className="connection-card-header"><span className="connection-logo linear"><Layers3 size={18} /></span><div><p className="eyebrow">Optional synchronization</p><h2>Linear workspace</h2></div><span className={`connection-badge ${live.connections.linear ? '' : 'muted'}`}>{live.connections.linear ? 'Key on Settings' : 'Optional'}</span></div><p>If the team uses Linear, the Studio can synchronize capabilities, epics, and stories after the owner has shaped them. The Studio remains the conversational source of truth.</p><label>Linear team<input value={linearWorkspace} onChange={(event) => setLinearWorkspace(event.target.value)} placeholder="Team key or name, e.g. ENG" /></label><div className="connection-actions"><button className="button button-primary" type="button" onClick={() => void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { linearTeam: linearWorkspace.trim() } }), 'Linear workspace saved — sync remains opt-in')}>Save workspace</button><button className="button button-quiet" type="button" onClick={() => sync('linear')}><RefreshCw size={14} /> {linearSync === 'syncing' ? 'Syncing…' : linearSync === 'synced' ? 'Synced' : 'Preview + sync map'}</button></div><div className="connection-note"><CircleHelp size={14} /><span>{live.linearStatus ? `${live.linearStatus}${live.linearSyncedAt ? ` · ${ago(live.linearSyncedAt)}` : ''}` : 'Sync should never erase the conversational context. It should only project the curated backlog and spec diffs into Linear.'}</span></div></section></div><SyncPreview live={live} syncState={syncState} refresh={tick} /><div className="connection-flow"><div><span className="eyebrow">The proposed loop</span><strong>Studio → Claude Code ZIP → Git branch → Pilot → optional Linear sync</strong></div><div className="connection-flow-nodes"><span>Product truth</span><ArrowRight size={14} /><span>Prototype package</span><ArrowRight size={14} /><span>Repository</span><ArrowRight size={14} /><span>Iteration</span></div></div><ProvidersCard /></div>
}
