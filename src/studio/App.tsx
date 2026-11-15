'use client'
import { useEffect, useMemo, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  ArrowDownRight,
  Bot,
  Code2,
  Database,
  ExternalLink,
  FolderGit2,
  MousePointer2,
  PackageOpen,
  RefreshCw,
  Settings2,
  Upload,
  UserRound,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  Filter,
  Flame,
  GitBranch,
  Layers3,
  Lightbulb,
  ListFilter,
  Maximize2,
  Mic,
  MoreHorizontal,
  MoveUpRight,
  Network,
  Play,
  Plus,
  Send,
  Sparkles,
  Target,
  Timer,
  Wand2,
  Waves,
  X,
  Zap,
} from 'lucide-react'
import {
  type BacklogItem,
  type Capability,
  type ConversationMessage,
  type ViewId,
  type EvidenceItem,
  type ExecutionItem,
  type RecommendationItem,
} from './data'
import { downloadPrototypeZip } from './generation'
import { api, ago, initials, previewUrl, sessionLine, toBacklog, toCapabilities, toEvidence, toExecution, toMessages, toRecommendations, toSpec, useLive, type Live, type StudioMessage } from './live'
import { LiveFrame, captureLive, useVoice, type Pick } from './vibe'
import { NAV_GROUPS, NextMove, PeopleMenu, TeamPanel, Checkpoints, UndoChip, optionsFrom, roleShort, specialistIcon, talkingTo, useMe, type Me, type StudioView } from './flow'
import { ProductSwitcher, StudioMarkdown, SpecReviewTools, ImpactPanel, VersionHistory, ReadinessFactors, DecisionRegister, ObservationComposer, SyncPreview, ProvidersCard, BuildHistory } from './extras'

const viewTitles: Record<StudioView, string> = {
  review: 'Try & mark up',
  overview: 'Whole product',
  conversation: 'Work with Muse',
  validation: 'Validate use case',
  product: 'Product shape',
  evidence: 'Evidence & signals',
  spec: 'Living specification',
  readiness: 'Pilot readiness',
  brief: 'Prototype brief',
  pilot: 'Make it real',
  connections: 'Connections',
}

const kindLabels: Record<BacklogItem['kind'], string> = {
  capture: 'new thought',
  epic: 'capability signal',
  distraction: 'parked for later',
}

const EMPTY_CAPABILITY: Capability = { id: '', label: 'Whole product', kicker: 'Finding its shape', readiness: 0, delta: 'new', description: 'The Muse is reading what you said and laying out everything the leading products of this kind have.', signal: 'The floor is being laid. Keep talking: nothing needs to be a ticket yet.', color: '#d7f58b' }

export type AnnotationShape = 'object' | 'circle' | 'full-screen'

function App({ id }: { id: string }) {
  const { data, error, reload } = useLive(id)
  if (!data) {
    return (
      <div className="app-shell studio-loading">
        <div className="studio-loading-card"><div className="brand-mark"><span /><span /><span /></div><p className="eyebrow">agentic studio</p><strong>{error ? 'This product could not be opened.' : 'Opening the product…'}</strong>{error && <small>{error}</small>}{error && <a className="text-button" href="/">Back to all products <ArrowRight size={14} /></a>}</div>
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

  const changeView = (view: StudioView) => {
    setActiveView(view)
    try { window.history.replaceState(null, '', `?view=${view}`) } catch { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setRole = (lens: 'owner' | 'engineer') => void act(() => patch({ lens }), lens === 'engineer' ? 'Product engineer lens: the technical interpretation is visible' : 'Product owner lens: product meaning first')

  const focusCapability = (capability: Capability) => {
    setActiveView('conversation')
    if (!capability.id) return
    void act(() => patch({ focus: capability.id }), `Muse is now holding the ${capability.label.toLowerCase()} conversation`)
  }

  const sendMessage = (rawText = draft, spoken?: string) => {
    const text = rawText.trim()
    if (!text) return
    setPendingMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', label: 'You', text, time: 'now' }])
    setDraft('')
    const to = talkTo
    void act(async () => {
      const r = await api<{ approved: boolean; picked: number[] }>(`/api/use-cases/${live.id}/messages`, { json: { content: text, author: me, ...(to ? { to } : {}), ...(spoken ? { raw: spoken, source: 'Voice' } : {}) } })
      setToast(r.picked?.length ? `Option ${r.picked.join(' and ')} chosen and carried forward. You can undo it.` : r.approved ? 'Approved and carried forward. You can undo it.' : to ? `Asked ${talkingTo(to, live)}; the answer appears here` : 'Thought held in the backlog for the Muse to curate')
    })
  }
  const composerVoice = useVoice(live.connections.voice, (text, spoken) => sendMessage(text, spoken), setToast, { clean: true })

  const captureIdea = () => {
    const text = capture.trim()
    if (!text) return
    setCapture('')
    void act(() => api(`/api/use-cases/${live.id}/capture`, { json: { text, source: 'Studio sidebar' } }), 'Added to the ambient backlog — the Muse will find its pattern')
  }

  const curate = (itemId: string, kind: BacklogItem['kind']) =>
    void act(() => api(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { kind, group: kind === 'distraction' ? undefined : selected.label } }), kind === 'distraction' ? 'Parked without losing the thought' : 'Curated into the active capability')

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
    void act(() => api(`/api/use-cases/${live.id}/feedback`, { json: body }), 'Annotation added to the backlog — the Muse will ask what it means')
  }

  const toggleVoice = voice.toggle
  const isListening = voice.listening
  const sortedExecution = useMemo(() => execution, [execution])
  const busy = live.agentBusy || live.pending > 0
  const props = { live, reload, act, setToast, changeView }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /></div>
          <div>
            <p className="eyebrow">agentic studio</p>
            <p className="brand-name">backward<span>.</span></p>
          </div>
          <span className="version-badge">0.1</span>
        </div>

        <ProductSwitcher live={live}>
          <span className="project-glyph">{initials(live.name).slice(0, 1)}</span>
          <span className="project-switcher-copy"><strong>{live.name}</strong><small>{live.stageLabel}</small></span>
          <ChevronDown size={15} />
        </ProductSwitcher>

        <nav className="primary-nav studio-nav" aria-label="Product workspace">
          {NAV_GROUPS.map((group) => (<div className="studio-nav-group" key={group.title}><div className="sidebar-section-label">{group.title}</div>{group.items.map((item) => (
            <button className={`nav-item ${activeView === item.id ? 'is-active' : ''}`} key={item.id} onClick={() => changeView(item.id)} type="button">
              <span className="nav-icon">
                {item.id === 'review' && <MousePointer2 size={17} />}
                {item.id === 'overview' && <Layers3 size={17} />}
                {item.id === 'conversation' && <Waves size={17} />}
                {item.id === 'validation' && <CircleHelp size={17} />}
                {item.id === 'product' && <FileText size={17} />}
                {item.id === 'evidence' && <Database size={17} />}
                {item.id === 'spec' && <FileText size={17} />}
                {item.id === 'readiness' && <Target size={17} />}
                {item.id === 'brief' && <PackageOpen size={17} />}
                {item.id === 'pilot' && <Zap size={17} />}
                {item.id === 'connections' && <FolderGit2 size={17} />}
              </span>
              <span className="nav-copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
              {item.id === 'conversation' && <span className="nav-live-dot" />}
            </button>
          ))}</div>))}
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">Held in the background</div>
        <div className="sidebar-mini-list">
          <button type="button" onClick={() => changeView('product')}><span className="mini-icon warm"><Lightbulb size={14} /></span><span><strong>{backlog.length} thoughts</strong><small>waiting for a home</small></span><ArrowRight size={13} /></button>
          <button type="button" onClick={() => changeView('pilot')}><span className="mini-icon lilac"><GitBranch size={14} /></span><span><strong>{execution.length} build moves</strong><small>traceable to the shape</small></span><ArrowRight size={13} /></button>
        </div>

        <div className="sidebar-spacer" />
        <div className="ambient-capture-card">
          <div className="ambient-card-top"><span className="live-pulse" /><span>Ambient capture</span><Mic size={15} /></div>
          <p>Have a thought while you’re away from the desk? Put it here. No need to make it a ticket yet.</p>
          <button type="button" onClick={() => { if (!document.getElementById('ambient-capture')) changeView('product'); window.setTimeout(() => document.getElementById('ambient-capture')?.focus(), 80) }}><Plus size={14} /> Capture a thought</button>
        </div>
        <div className="profile-row" role="link" tabIndex={0} title="Settings" onClick={() => { window.location.href = '/settings' }} onKeyDown={(event) => { if (event.key === 'Enter') window.location.href = '/settings' }}><div className="avatar">{me.name ? initials(me.name) : roleShort(me.role)}</div><div><strong>Settings</strong><small>{me.name ? `${me.name} · ${me.role}` : me.role}</small></div><MoreHorizontal size={16} /></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>{live.name}</span><span className="crumb-slash">/</span><strong>{viewTitles[activeView]}</strong></div>
          <div className="topbar-actions"><span className="save-state"><span /> {live.generateBusy ? live.generateStatus || 'Claude Code is building' : busy ? live.agentStatus || 'The Muse is working' : 'All changes saved'}</span><button className="icon-button" type="button" aria-label="Notifications" onClick={() => changeView('conversation')}><Bell size={17} /></button><PeopleMenu live={live} me={me} setMe={setMe} setToast={setToast} /></div>
        </header>

        <NextMove live={live} changeView={changeView} />
        {!live.agentsEnabled && <div className="studio-banner"><CircleHelp size={14} /><span>The Muse and Claude Code switch on once Claude is signed in. Everything you say is kept meanwhile.</span><a href="/settings">Open Settings <ArrowRight size={13} /></a></div>}

        {activeView === 'overview' && <OverviewView {...{ live, product: live, selected, capabilities, readiness, overallReadiness, approvalCount, backlog, focusCapability, changeView, capture, setCapture, captureIdea, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, previewMode, setPreview, toast, setToast, annotationMode, setAnnotationMode, annotationTarget, setAnnotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, messages }} />}
        {activeView === 'conversation' && <ConversationView {...{ live, act, me, talkTo, setTalkTo, voice: composerVoice, selected, capabilities, messages, draft, setDraft, sendMessage, focusCapability, previewMode, setPreview, toast, setToast, changeView, onPick }} />}
        {activeView === 'review' && <ReviewView {...{ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }} />}
        {activeView === 'validation' && <ValidationView {...{ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }} />}
        {activeView === 'product' && <ProductView {...{ live, act, selected, capabilities, backlog, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, capture, setCapture, captureIdea, approvalCount, changeView, toast, setToast }} />}
        {activeView === 'evidence' && <EvidenceView {...{ live, act, evidence, changeView, role, setRole, setToast }} />}
        {activeView === 'spec' && <SpecView {...{ ...props, specSections, messages, evidence, backlog, execution }} />}
        {activeView === 'readiness' && <ReadinessView {...{ live, capabilities, readiness, overallReadiness, selected, focusCapability, changeView }} />}
        {activeView === 'brief' && <BriefView {...{ live, act, validationScore, repositoryUrl: live.repoUrl, generatedFiles: generatedFiles.length ? generatedFiles : live.packageFiles, prototypeStatus, generatePrototype, buildNow, generationVersion, setTechnicalOpen, technicalOpen, changeView, role, setRole, setToast }} />}
        {activeView === 'pilot' && <PilotView {...{ live, act, sortedExecution, execution, changeView, selected, toast, setToast, buildNow }} />}
        {activeView === 'connections' && <ConnectionsView {...{ live, act, setToast, changeView }} />}

        {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
      </main>
    </div>
  )
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

type OverviewProps = {
  live: Live
  product: Live
  onPick: (p: Pick) => void
  messages: ConversationMessage[]
  selected: Capability
  capabilities: Capability[]
  readiness: Record<string, number>
  overallReadiness: number
  approvalCount: number
  backlog: BacklogItem[]
  focusCapability: (capability: Capability) => void
  changeView: (view: ViewId) => void
  capture: string
  setCapture: (value: string) => void
  captureIdea: () => void
  visibleBacklog: BacklogItem[]
  showAllBacklog: boolean
  setShowAllBacklog: (value: boolean) => void
  curate: (id: string, kind: BacklogItem['kind']) => void
  previewMode: 'home' | 'thread'
  setPreview: (mode: 'home' | 'thread') => void
  toast: string
  setToast: (value: string) => void
  annotationMode: boolean
  setAnnotationMode: (value: boolean) => void
  annotationTarget: string
  setAnnotationTarget: (value: string) => void
  annotationNote: string
  setAnnotationNote: (value: string) => void
  isListening: boolean
  toggleVoice: () => void
  addAnnotation: () => void
  captureFrame: (mode?: 'surface' | 'screen') => void
  capturedFrame: string
  annotationShape: 'object' | 'circle' | 'full-screen'
  setAnnotationShape: (value: 'object' | 'circle' | 'full-screen') => void
}

function OverviewView(props: OverviewProps) {
  const { live, onPick, messages, product: item, selected, capabilities: caps, readiness: currentReadiness, overallReadiness, approvalCount, backlog, focusCapability, changeView, capture, setCapture, captureIdea, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, annotationTarget, setAnnotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape } = props
  const lastMuse = [...messages].reverse().find((m) => m.role === 'muse')
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const clipText = (t: string, n = 240) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t)
  return (
    <div className="page-wrap">
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow eyebrow-with-dot"><span className="status-dot" /> {sessionLine(live.session)}</div>
          <h1>Make the product <em>legible</em><br />before you make it real.</h1>
          <p className="hero-lede">{item.name} is the product you’re shaping. The Muse is holding the conversation. This is the current shape of the work — not a backlog pretending to be a strategy.</p>
          <div className="hero-actions"><button className="button button-primary" type="button" onClick={() => changeView('conversation')}>Continue with Muse <ArrowRight size={16} /></button><button className="button button-quiet" type="button" onClick={() => changeView('product')}><FileText size={16} /> Open living PRFAQ</button></div>
        </div>
        <div className="product-card">
          <div className="product-card-header"><span className="eyebrow">The product in one breath</span><button className="icon-button subtle" type="button" aria-label="More product actions" onClick={() => changeView('product')}><MoreHorizontal size={16} /></button></div>
          <div className="product-wordmark"><span className="wordmark-orbit" />{item.name}</div>
          <p>{item.statement || item.description}</p>
          <div className="product-card-meta"><span>{item.audience || 'Audience still being named'}</span><span className="meta-divider" /><span>Updated {ago(item.updatedAt)}</span></div>
          <div className="quote-line"><span>“</span>{(item.customerQuote || 'The customer’s own words land here once the Muse hears them.').replace(/[“”]/g, '')}</div>
        </div>
      </section>

      <section className="section-block readiness-section">
        <div className="section-heading"><div><p className="eyebrow">Floor → ceiling readiness</p><h2>Where the product can stand today</h2></div><button className="text-button" type="button" onClick={() => changeView('readiness')}>See the full ceiling <ArrowRight size={15} /></button></div>
        <div className="readiness-board">
          <div className="readiness-overview"><div className="readiness-ring" style={{ '--progress': `${overallReadiness * 3.6}deg` } as React.CSSProperties}><div><strong>{overallReadiness}%</strong><small>ready for a<br />thin-slice pilot</small></div></div><div className="readiness-note"><span className="signal-icon"><Sparkles size={15} /></span><p><strong>The honest read</strong>{selected.signal}</p><button type="button" onClick={() => focusCapability(selected)}>Work this conversation <ArrowRight size={13} /></button></div></div>
          <div className="capability-list">{caps.length === 0 && <div className="empty-column">The Muse is laying the floor: the capabilities appear here in a moment.</div>}{caps.map((capability) => <CapabilityRow key={capability.id} capability={capability} readiness={currentReadiness[capability.id] ?? capability.readiness} onFocus={focusCapability} />)}</div>
        </div>
      </section>

      <section className="section-block workspace-section">
        <div className="section-heading"><div><p className="eyebrow">The active move</p><h2>What the Muse is helping you see</h2></div><div className="section-heading-meta"><span className="agent-status"><span className="live-pulse" /> {live.agentBusy ? live.agentStatus || 'Muse is thinking' : 'Muse is listening'}</span><button className="text-button" type="button" onClick={() => changeView('conversation')}>Open conversation <ArrowRight size={15} /></button></div></div>
        <div className="workspace-grid">
          <div className="conversation-preview">
            <div className="conversation-preview-header"><div className="agent-avatar"><Waves size={17} /></div><div><strong>Muse · Product physician</strong><span>Guiding the {selected.label.toLowerCase()} conversation</span></div><span className="live-label">LIVE</span></div>
            <div className="mini-message muse-message"><span className="message-line" />{clipText(lastMuse?.text ?? `The Muse is reading what you said about ${item.name} and laying out everything a product like it needs.`)}</div>
            <div className="mini-message user-message"><span className="you-label">YOU</span>{clipText(lastUser?.text ?? item.description)}</div>
            <div className="conversation-preview-footer"><span><Check size={14} /> {approvalCount} decisions carried forward</span><button className="button button-small" type="button" onClick={() => changeView('conversation')}>Keep going <ArrowRight size={14} /></button></div>
          </div>
          <PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} setAnnotationMode={setAnnotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} />
        </div>
        <AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} />
      </section>

      <section className="section-block backlog-section">
        <div className="section-heading"><div><p className="eyebrow">Ambient backlog · {backlog.length} signals</p><h2>Everything you thought of. Not everything you need to do.</h2></div><button className="text-button" type="button" onClick={() => changeView('product')}>Open curation <ArrowRight size={15} /></button></div>
        <BacklogPanel {...{ capture, setCapture, captureIdea, visibleBacklog, showAllBacklog, setShowAllBacklog, curate }} />
      </section>
    </div>
  )
}

type ReviewProps = globalThis.Pick<OverviewProps, 'live' | 'previewMode' | 'setPreview' | 'setToast' | 'annotationMode' | 'setAnnotationMode' | 'setAnnotationTarget' | 'annotationTarget' | 'annotationNote' | 'setAnnotationNote' | 'isListening' | 'toggleVoice' | 'addAnnotation' | 'captureFrame' | 'capturedFrame' | 'annotationShape' | 'setAnnotationShape' | 'onPick'> & { changeView: (view: StudioView) => void }

/** The live product, full width: click or circle what should change, say why, and it goes to the Muse. */
function ReviewView({ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }: ReviewProps) {
  const marks = live.feedback.slice(0, 6)
  return <div className="page-wrap studio-review-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Vibe review</p><h1>Try it. Point at <em>what’s wrong.</em></h1><p>Use the product as a customer would. Press Annotate, click or circle the part you mean, and say what should change. The Muse turns it into the next build.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => setAnnotationMode(!annotationMode)}><MousePointer2 size={16} /> {annotationMode ? 'Stop annotating' : 'Annotate'}</button><span>{live.feedback.length} {live.feedback.length === 1 ? 'mark' : 'marks'} so far</span></div></div><section className="section-block"><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} setAnnotationMode={setAnnotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} tall /><AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} /></section>{marks.length > 0 && <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Your marks</p><h2>What you asked to change</h2></div><button className="text-button" type="button" onClick={() => changeView('brief')}>Build the next version <ArrowRight size={15} /></button></div><div className="studio-list">{marks.map((f) => <div className="studio-list-row" key={f.id}><span className="studio-row-main"><strong>{f.comment}</strong><small>{f.target} · {ago(f.createdAt)}</small></span><span className="studio-review-chip">{f.status}</span></div>)}</div></section>}</div>
}

function CapabilityRow({ capability, readiness, onFocus }: { capability: Capability; readiness: number; onFocus: (capability: Capability) => void }) {
  return <button className="capability-row" type="button" onClick={() => onFocus(capability)}><span className="capability-color" style={{ background: capability.color }} /><span className="capability-copy"><strong>{capability.label}</strong><small>{capability.kicker}</small></span><span className="capability-track"><span style={{ width: `${readiness}%`, background: capability.color }} /></span><span className="capability-number">{readiness}%</span><span className="capability-delta">{capability.delta}</span><ArrowDownRight size={15} className="capability-arrow" /></button>
}

function PreviewCard({ live, mode, setPreview, setToast, annotationMode = false, setAnnotationMode, onSelectTarget, annotationShape = 'object', onPick, tall = false }: { live: Live; mode: 'home' | 'thread'; setPreview: (mode: 'home' | 'thread') => void; setToast: (value: string) => void; annotationMode?: boolean; setAnnotationMode?: (value: boolean) => void; onSelectTarget?: (value: string) => void; annotationShape?: AnnotationShape; onPick?: (p: Pick) => void; tall?: boolean }) {
  const held = live.backlog.filter((b) => b.kind === 'capture' && b.state !== 'suggested' && b.state !== 'probing').slice(-1)[0]
  const holdAs = (kind: BacklogItem['kind']) => {
    if (!held) return
    void api(`/api/use-cases/${live.id}/backlog/${held.id}`, { method: 'PATCH', json: { kind, group: kind === 'distraction' ? undefined : live.capabilities.find((c) => c.key === live.focus)?.label } })
      .then(() => setToast(kind === 'distraction' ? 'Parked without losing the thought' : 'Kept in the product shape'))
      .catch((e: Error) => setToast(e.message))
  }
  const open = previewUrl(live.preview.port, '/')
  return <div className={`preview-card ${tall ? 'is-tall' : ''}`}><div className="preview-header"><div><p className="eyebrow">Vibe → visible product</p><h3>What {live.name} feels like in the hand</h3></div><div className="preview-tools"><button className={`annotate-trigger ${annotationMode ? 'is-active' : ''}`} type="button" onClick={() => setAnnotationMode?.(!annotationMode)}><MousePointer2 size={13} /> {annotationMode ? (annotationShape === 'circle' ? 'Drag a circle' : 'Click a surface') : 'Annotate'}</button><button className="icon-button subtle" type="button" onClick={() => (open ? window.open(open, '_blank', 'noopener') : setToast('The product opens full-screen once its first version runs'))} aria-label="Expand product preview"><Maximize2 size={15} /></button></div></div><div className="preview-tabs"><button className={mode === 'home' ? 'is-active' : ''} onClick={() => setPreview('home')} type="button">Entry moment</button><button className={mode === 'thread' ? 'is-active' : ''} onClick={() => setPreview('thread')} type="button">Held thought</button></div>{mode === 'home' ? <LiveFrame live={live} annotationMode={annotationMode} shape={annotationShape} tall={tall} onPick={(p) => { onSelectTarget?.(p.kind === 'region' ? 'Circled region' : 'Selected surface'); onPick?.(p) }} /> : <div className="product-preview-shell held-thread"><div className="preview-app-top"><span className="preview-kite">{live.name.toLowerCase()}.</span><span className="preview-preview-label">held thought</span><span className="preview-avatar">PO</span></div><div className="held-quote"><span>“</span><p>{held ? held.title : 'Nothing is waiting. Every thought you have had already has a home.'}</p><small>{held ? `captured ${ago(held.createdAt)} · the Muse is listening` : 'capture one any time from the sidebar or your phone'}</small></div>{held && <div className="thread-actions"><button type="button" onClick={() => holdAs('epic')}>Keep with {live.name}</button><button type="button" onClick={() => holdAs('distraction')}>Let it wait</button></div>}</div>}</div>
}

type ConversationProps = { live: Live; act: Act; me: Me; talkTo: string; setTalkTo: (k: string) => void; voice: { listening: boolean; working: boolean; toggle: () => void }; onPick: (p: Pick) => void; selected: Capability; capabilities: Capability[]; messages: StudioMessage[]; draft: string; setDraft: (value: string) => void; sendMessage: (text?: string) => void; focusCapability: (capability: Capability) => void; previewMode: 'home' | 'thread'; setPreview: (mode: 'home' | 'thread') => void; toast: string; setToast: (value: string) => void; changeView: (view: StudioView) => void }

function ConversationView({ live, act, me, talkTo, setTalkTo, voice, onPick, selected, capabilities: caps, messages, draft, setDraft, sendMessage, focusCapability, previewMode, setPreview, setToast, changeView }: ConversationProps) {
  const options = optionsFrom(messages)
  const to = talkingTo(talkTo, live)
  return <div className="page-wrap conversation-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />The room is open</p><h1>Work with the Muse.</h1><p>Talk in your own language. The Muse will pull out the product truth, protect the nuance, and quietly turn agreement into forward motion.</p></div><div className="intro-aside"><span className="eyebrow">Current focus</span><strong>{selected.label}</strong><span>{selected.kicker}</span></div></div><div className="conversation-layout"><div className="conversation-main"><div className="conversation-stream">{messages.map((message) => <MessageCard key={message.id} message={message} live={live} me={me} act={act} />)}{live.agentBusy && <article className="message-card muse is-thinking"><div className="message-meta"><span className="message-avatar muse"><Waves size={14} /></span><strong>Muse · Product physician</strong><span>now</span></div><p><span className="live-pulse" /> {live.agentStatus || 'Thinking it through…'}</p></article>}</div><Checkpoints live={live} me={me} act={act} /><div className="composer"><div className="composer-suggestions"><span className="eyebrow">{options.length ? 'Pick one, or several' : 'Try a direction'}</span><div>{options.map((o) => <button key={o.n} type="button" title={o.label} onClick={() => sendMessage(`${o.n}. ${o.label}`)}>{o.n}. {o.label.length > 46 ? `${o.label.slice(0, 46)}…` : o.label} <ArrowRight size={13} /></button>)}<button type="button" onClick={() => sendMessage('Yes, carry that forward.')}>Yes, carry that forward <ArrowRight size={13} /></button>{!options.length && <button type="button" onClick={() => sendMessage('The part I can’t explain yet is what should happen next. Ask me one question at a time.')}>I can’t explain the next part yet <ArrowRight size={13} /></button>}<button type="button" onClick={() => sendMessage('Help me think bigger: what else could this be, and what would make it ours alone?')}>Help me think bigger <ArrowRight size={13} /></button></div></div><div className="composer-input"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder={voice.listening ? 'Listening… press the mic again when you’re done' : talkTo ? `Ask ${to}…` : 'Say what you’re seeing, wanting, or not sure about…'} rows={2} /><button className={`send-button studio-mic ${voice.listening ? 'is-listening' : ''}`} type="button" onClick={voice.toggle} disabled={voice.working} aria-pressed={voice.listening} aria-label={voice.listening ? 'Stop and send what you said' : 'Talk instead of typing'} title={voice.listening ? 'Stop and send' : 'Talk as long as you like; press again to stop'}><Mic size={16} /></button><button className="send-button" type="button" onClick={() => sendMessage()} aria-label={`Send to ${to}`}><Send size={17} /></button></div><div className="composer-foot"><span><Mic size={13} /> {voice.listening ? 'Listening until you press the mic again' : voice.working ? 'Turning what you said into text…' : 'You can also talk while you walk'}</span><span>{talkTo ? <button type="button" className="studio-to" onClick={() => setTalkTo('')}>Talking to {to} · back to the Muse</button> : 'Enter to send · Shift + Enter for a new line'}</span></div></div></div><aside className="conversation-aside"><TeamPanel live={live} to={talkTo} setTo={setTalkTo} /><div className="aside-block focus-block"><div className="aside-block-header"><span className="eyebrow">Active lens</span><Wand2 size={15} /></div><div className="focus-mark" style={{ background: selected.color }} /><h3>{selected.label}</h3><p>{selected.description}</p><button className="text-button" type="button" onClick={() => setToast(selected.signal || 'The Muse is using this lens to curate the next question')}>Why this now? <CircleHelp size={14} /></button></div><div className="aside-block"><div className="aside-block-header"><span className="eyebrow">Move the lens</span><ListFilter size={15} /></div><div className="lens-list">{caps.map((capability) => <button type="button" key={capability.id} className={capability.id === selected.id ? 'is-active' : ''} onClick={() => focusCapability(capability)}><span className="lens-swatch" style={{ background: capability.color }} /><span><strong>{capability.label}</strong><small>{capability.readiness}% ready</small></span><ArrowRight size={13} /></button>)}</div></div><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} onPick={onPick} /><button className="button button-quiet full-width" type="button" onClick={() => changeView('review')}><MousePointer2 size={15} /> Try it and mark it up</button></aside></div></div>
}

function MessageCard({ message, live, me, act }: { message: StudioMessage; live: Live; me: Me; act: Act }) {
  const specialist = !!message.specialist
  const userBadge = message.author && message.label !== 'You' ? initials(message.author) : message.authorRole ? roleShort(message.authorRole) : 'PO'
  return <article className={`message-card ${message.role}${specialist ? ' studio-specialist' : ''}`}><div className="message-meta">{message.role === 'muse' && !specialist && <span className="message-avatar muse">{message.label === 'Claude Code' ? <Code2 size={14} /> : <Waves size={14} />}</span>}{specialist && <span className="message-avatar signal">{specialistIcon(message.specialist)}</span>}{message.role === 'signal' && <span className="message-avatar signal"><Sparkles size={14} /></span>}{message.role === 'user' && <span className="message-avatar user">{userBadge}</span>}<strong>{message.label}</strong><span>{message.time}{message.addressed ? ` · to the ${message.addressed === 'business-analyst' ? 'business analyst' : message.addressed === 'ux' ? 'UX/UI designer' : message.addressed === 'domain' ? 'domain expert' : message.addressed}` : ''}{message.raw ? ' · spoken' : ''}</span>{message.role === 'signal' && message.label === 'Decision captured' && <span className="decision-chip"><Check size={12} /> added to product truth</span>}{message.role === 'signal' && message.label === 'Decision captured' && message.ref && <UndoChip live={live} decisionId={message.ref} me={me} act={act} />}</div><p className="studio-message-text">{message.text}</p></article>
}

type ProductProps = { live: Live; act: Act; selected: Capability; capabilities: Capability[]; backlog: BacklogItem[]; visibleBacklog: BacklogItem[]; showAllBacklog: boolean; setShowAllBacklog: (value: boolean) => void; curate: (id: string, kind: BacklogItem['kind']) => void; capture: string; setCapture: (value: string) => void; captureIdea: () => void; approvalCount: number; changeView: (view: ViewId) => void; toast: string; setToast: (value: string) => void }

function ProductView({ live, act, selected, capabilities: caps, backlog, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, capture, setCapture, captureIdea, approvalCount, changeView, setToast }: ProductProps) {
  const [editing, setEditing] = useState(false)
  const [prfaqDraft, setPrfaqDraft] = useState(live.prfaq)
  const savePrfaq = () => { setEditing(false); void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { prfaq: prfaqDraft } }), 'PRFAQ saved in your words — the Muse will carry it into the spec') }
  const waiting = backlog.filter((b) => b.kind === 'capture').length
  const decisions = live.decisions.slice(-8)
  void caps
  return <div className="page-wrap product-page"><div className="page-intro"><div><p className="eyebrow">The living product shape</p><h1>Keep the dream visible<br />as it becomes specific.</h1><p>The PRFAQ is not a document at the end of the process. It is the shared surface where the original voice, approved decisions, and open questions can sit together.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => changeView('conversation')}>Keep shaping <ArrowRight size={16} /></button><span>{approvalCount} approvals carried forward</span></div></div><div className="product-shape-grid"><section className="prfaq-card"><div className="prfaq-toolbar"><div className="doc-title"><span className="doc-icon"><FileText size={16} /></span><span><strong>PRFAQ / {live.slug}-v0.{live.packageCount}</strong><small>living · last touched {ago(live.prfaqUpdatedAt ?? live.updatedAt)}</small></span></div><div className="toolbar-actions"><span className="locked-chip"><Check size={12} /> working truth</span>{editing ? <><button className="button button-primary button-small" type="button" onClick={savePrfaq}><Check size={13} /> Save</button><button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)}>Cancel</button></> : <button className="icon-button subtle" type="button" onClick={() => { setPrfaqDraft(live.prfaq); setEditing(true) }} aria-label="Edit the PRFAQ" title="Edit in your own words"><MoreHorizontal size={16} /></button>}</div></div><div className="prfaq-content"><div className="doc-kicker">{live.audience ? `FOR ${live.audience.toUpperCase()}` : 'FOR THE CUSTOMER THE MUSE IS STILL NAMING'}</div><h2>{live.statement || live.name}</h2><p className="doc-lede">{live.description}</p><div className="doc-divider" />{editing ? <textarea className="spec-editor" value={prfaqDraft} onChange={(event) => setPrfaqDraft(event.target.value)} rows={18} /> : live.prfaq ? <StudioMarkdown text={live.prfaq} /> : <div className="doc-section"><div className="doc-section-label"><span>01</span><strong>Why customers care</strong></div><div><p>The Muse writes the press release and FAQ from your conversation. It appears here as soon as there is enough to say honestly.</p>{live.customerQuote && <div className="quote-callout"><span>“</span><p>{live.customerQuote.replace(/[“”]/g, '')}</p></div>}</div></div>}<div className="doc-section"><div className="doc-section-label"><span>{live.prfaq ? '··' : '02'}</span><strong>Decisions captured</strong></div><div className="decision-list">{decisions.length === 0 && <div className="open-question"><CircleHelp size={14} /><span>No decisions yet. A plain “yes” to the Muse carries its proposal forward.</span><small>open with Muse</small></div>}{decisions.map((d) => <div key={d.id} className={d.status === 'approved' ? '' : 'open-question'}>{d.status === 'approved' ? <Check size={14} /> : <CircleHelp size={14} />}<span>{d.text}</span><small>{d.status === 'approved' ? 'approved' : d.status === 'assumed' ? 'assumed · say no to change it' : 'open with Muse'} · {ago(d.createdAt)}</small></div>)}</div></div></div></section><aside className="product-shape-aside"><div className="shape-summary"><div className="aside-block-header"><span className="eyebrow">Shape signal</span><Sparkles size={15} /></div><strong>{waiting ? `${waiting} ${waiting === 1 ? 'thought is' : 'thoughts are'} waiting to find a home.` : 'Every thought you have had has a home.'}</strong><p>{selected.signal}</p><button className="button button-small" type="button" onClick={() => changeView('conversation')}>Ask the Muse <ArrowRight size={14} /></button></div><div className="curation-card"><div className="curation-header"><div><p className="eyebrow">Curated backlog</p><h3>{backlog.length} signals, held gently</h3></div><Filter size={15} /></div><BacklogList items={visibleBacklog} curate={curate} /><button className="text-button center-button" type="button" onClick={() => setShowAllBacklog(!showAllBacklog)}>{showAllBacklog ? 'Show fewer signals' : 'See every signal'} <ArrowRight size={14} /></button></div><div className="capture-card"><div><span className="capture-orb"><Mic size={15} /></span><div><strong>Catch the next thought</strong><small>It does not need to be useful yet.</small></div></div><div className="capture-input"><input id="ambient-capture" value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') captureIdea() }} placeholder="I keep thinking about…" /><button type="button" onClick={captureIdea} aria-label="Add thought"><Plus size={16} /></button></div></div></aside></div></div>
}

function BacklogPanel({ capture, setCapture, captureIdea, visibleBacklog, showAllBacklog, setShowAllBacklog, curate }: { capture: string; setCapture: (value: string) => void; captureIdea: () => void; visibleBacklog: BacklogItem[]; showAllBacklog: boolean; setShowAllBacklog: (value: boolean) => void; curate: (id: string, kind: BacklogItem['kind']) => void }) {
  return <div className="backlog-panel"><div className="backlog-capture"><span className="capture-orb"><Mic size={15} /></span><div className="capture-copy"><strong>Catch the thought before it becomes a task</strong><small>Phone, voice, or a half-sentence is enough.</small></div><div className="capture-input"><input id="ambient-capture" value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') captureIdea() }} placeholder="I keep thinking about…" /><button type="button" onClick={captureIdea} aria-label="Add ambient thought"><Plus size={16} /></button></div></div><div className="backlog-list"><BacklogList items={visibleBacklog} curate={curate} /></div><button className="backlog-more" type="button" onClick={() => setShowAllBacklog(!showAllBacklog)}>{showAllBacklog ? 'Show fewer signals' : `See all ${visibleBacklog.length < 4 ? 'signals' : 'captured thoughts'}`} <ArrowRight size={14} /></button></div>
}

function BacklogList({ items, curate }: { items: BacklogItem[]; curate: (id: string, kind: BacklogItem['kind']) => void }) {
  return <div className="backlog-items">{items.map((item) => <div className="backlog-item" key={item.id}><div className={`backlog-kind ${item.kind}`}><span>{item.kind === 'capture' ? <Lightbulb size={14} /> : item.kind === 'epic' ? <Layers3 size={14} /> : <Timer size={14} />}</span></div><div className="backlog-item-copy"><div><strong>{item.title}</strong><span className="backlog-age">{item.age}</span></div><p>{item.note}</p><div className="backlog-tags"><span>{kindLabels[item.kind]}</span><span>{item.group}</span><span>{item.source}</span></div></div><div className="backlog-actions"><button type="button" onClick={() => curate(item.id, 'epic')} title="Group as capability"><Layers3 size={14} /></button><button type="button" onClick={() => curate(item.id, 'distraction')} title="Park for later"><Timer size={14} /></button></div></div>)}</div>
}

type ReadinessProps = { live: Live; capabilities: Capability[]; readiness: Record<string, number>; overallReadiness: number; selected: Capability; focusCapability: (capability: Capability) => void; changeView: (view: ViewId) => void }

type LiveSpecSection = ReturnType<typeof toSpec>[number]
type SpecViewProps = {
  live: Live
  act: Act
  reload: () => Promise<void>
  changeView: (view: ViewId) => void
  setToast: (value: string) => void
  specSections: LiveSpecSection[]
  messages: ConversationMessage[]
  evidence: EvidenceItem[]
  backlog: BacklogItem[]
  execution: ExecutionItem[]
}

function SpecView({ live, act, changeView, setToast, specSections }: SpecViewProps) {
  const [tab, setTab] = useState<'prd' | 'trd'>('prd')
  const [selectedId, setSelectedId] = useState(specSections[0]?.id ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(specSections[0]?.content ?? '')
  const [reviewMode, setReviewMode] = useState(false)
  const sections = specSections.filter((section) => section.tab === tab)
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0]
  const tabPercent = (t: 'prd' | 'trd') => { const s = specSections.filter((section) => section.tab === t && section.review !== 'remove'); return s.length ? Math.round(s.reduce((sum, section) => sum + section.completeness, 0) / s.length) : 0 }
  const progress = tabPercent(tab)
  const chooseSection = (section: LiveSpecSection) => {
    setSelectedId(section.id)
    setDraft(section.content)
    setEditing(false)
  }
  const selectTab = (nextTab: 'prd' | 'trd') => {
    setTab(nextTab)
    const next = specSections.find((section) => section.tab === nextTab)
    if (next) chooseSection(next)
  }
  if (!selected) return <div className="page-wrap spec-page"><div className="empty-column">The living specification is being laid out. One moment.</div></div>
  const review = (choice: 'keep' | 'revise' | 'challenge' | 'remove' | '', note = '') =>
    act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { review: choice, note } }), choice === 'keep' ? `${selected.title} accepted into the living ${tab.toUpperCase()} — its provenance stays attached` : choice === 'remove' ? `${selected.title} removed — its evidence and conversation are kept` : choice ? `${selected.title} sent back to the Muse to ${choice}` : `${selected.title} back in play`)
  const acceptInference = () => { setEditing(false); void review('keep'); if (reviewMode) nextOpen() }
  const saveRevision = () => {
    setEditing(false)
    void act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { content: draft, review: 'revise', note: 'Edited in the owner’s own words' } }), `Revision saved for ${selected.title} — downstream impact is ready to review`)
  }
  const setStatus = (status: string) => void act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { status } }), `${selected.title} is now ${status.replace(/-/g, ' ')}`)
  const nextOpen = () => {
    const queue = sections.filter((s) => !s.review && s.basis !== 'confirmed')
    const i = queue.findIndex((s) => s.id === selected.id)
    const n = queue[(i + 1) % Math.max(1, queue.length)] ?? sections[(sections.indexOf(selected) + 1) % sections.length]
    if (n) chooseSection(n)
  }
  const traceAction = (type: string) => {
    if (type === 'conversation') changeView('conversation')
    if (type === 'evidence') changeView('evidence')
    if (type === 'backlog') changeView('product')
    if (type === 'execution') changeView('pilot')
    if (type === 'annotation') changeView('overview')
  }
  return <div className="page-wrap spec-page">
    <div className="page-intro spec-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />The specification is alive</p><h1>See what the product<br /><em>is becoming.</em></h1><p>The Muse turns conversation, evidence, and vibe annotations into a real spec — while keeping every inference inspectable and reversible.</p></div><div className="spec-intro-side"><div className="spec-progress"><span className="eyebrow">{tab === 'prd' ? 'PRD' : 'TRD'} completeness</span><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{sections.filter((section) => section.status !== 'draft').length} of {sections.length} sections have a shaped signal</small></div><button className="button button-primary" type="button" onClick={() => changeView('brief')}><PackageOpen size={15} /> Package the living spec</button></div></div>
    <div className="spec-tabs"><button className={tab === 'prd' ? 'is-active' : ''} type="button" onClick={() => selectTab('prd')}><FileText size={14} /> Product requirements <span>{tabPercent('prd')}%</span></button><button className={tab === 'trd' ? 'is-active' : ''} type="button" onClick={() => selectTab('trd')}><Code2 size={14} /> Technical requirements <span>{tabPercent('trd')}%</span></button></div>
    <div className="spec-layout"><aside className="spec-rail"><div className="rail-heading"><div><span className="eyebrow">{tab.toUpperCase()} sections</span><h3>Working outline</h3></div><ListFilter size={15} /></div>{sections.map((section) => <button className={`spec-section-item ${selected.id === section.id ? 'is-active' : ''} ${section.review === 'remove' ? 'is-removed' : ''}`} key={section.id} type="button" onClick={() => chooseSection(section)}><span className={`spec-signal ${section.status} ${section.confidence}`} /><span className="spec-section-copy"><strong>{section.title}</strong><small>{section.ref} · {section.kicker}</small></span><span className="spec-section-percent">{section.completeness}%</span></button>)}<div className="spec-rail-note"><Sparkles size={14} /><p><strong>Inference is visible.</strong> Nothing becomes “confirmed” just because the Muse suggested it.</p></div></aside><section className="spec-document"><div className="spec-doc-header"><div><p className="eyebrow">{selected.ref} · {selected.kicker}</p><h2>{selected.title}</h2></div><div className="spec-doc-actions"><span className={`spec-status ${selected.status}`}>{selected.status}</span><span className={`confidence ${selected.confidence}`}>{selected.confidence} confidence</span></div></div><div className="spec-content-card"><div className="spec-content-meta"><span><Timer size={13} /> Updated from {selected.source} · {ago(selected.updatedAt)}</span><span>{selected.completeness}% complete</span></div>{editing ? <textarea className="spec-editor" value={draft} onChange={(event) => setDraft(event.target.value)} rows={7} /> : <div className="spec-body-copy">{selected.content ? <StudioMarkdown text={selected.content} /> : <p>Not yet researched. Ask the Muse to probe, or write it in your own words.</p>}</div>}<div className="spec-action-row">{editing ? <><button className="button button-primary button-small" type="button" onClick={saveRevision}><Check size={13} /> Save revision</button><button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)}>Cancel</button></> : <><button className="button button-primary button-small" type="button" onClick={acceptInference}><Check size={13} /> Accept inference</button><button className="button button-quiet button-small" type="button" onClick={() => { setDraft(selected.content); setEditing(true) }}><Wand2 size={13} /> Revise language</button><button className="button button-quiet button-small" type="button" onClick={() => void review('challenge', 'Challenged in review')} title="Ask the Muse what this rests on"><CircleHelp size={13} /> Challenge</button>{selected.review === 'remove' ? <button className="button button-quiet button-small" type="button" onClick={() => void review('')}>Bring it back</button> : <button className="button button-quiet button-small" type="button" onClick={() => void review('remove', 'Removed in review')}><X size={13} /> Remove</button>}<button className="text-button" type="button" onClick={() => changeView('conversation')}>Ask Muse to probe <ArrowRight size={13} /></button></>}</div></div><SpecReviewTools section={selected} onStatus={setStatus} reviewMode={reviewMode} setReviewMode={setReviewMode} onNext={nextOpen} /><div className="spec-related-row"><span className="eyebrow">Related records</span>{selected.related.length ? selected.related.map((id) => <button type="button" className="related-chip" key={id} onClick={() => { const s = specSections.find((x) => x.ref === id || x.key === id); if (s) { setTab(s.tab); chooseSection(s) } }}><Target size={11} /> {id}</button>) : <span className="empty-related">No linked record yet — that is a gap worth probing.</span>}</div><div className="spec-gap-card"><div><span className="eyebrow">What would make this stronger?</span><strong>{selected.confidence === 'open' ? 'This section needs a human decision or new evidence.' : selected.completeness < 70 ? 'One more focused question could raise confidence.' : 'The shape is strong enough to carry into a thin slice.'}</strong></div><button className="button button-quiet button-small" type="button" onClick={() => changeView(selected.confidence === 'open' ? 'conversation' : 'validation')}>{selected.confidence === 'open' ? 'Open the question' : 'Review validation'} <ArrowRight size={13} /></button></div></section><aside className="trace-rail"><div className="rail-heading"><div><span className="eyebrow">Provenance rail</span><h3>How this got here</h3></div><Network size={15} /></div><p className="trace-intro">Real-time inference tracing keeps product meaning connected to technical motion.</p><div className="trace-list">{selected.trace.length === 0 && <p className="trace-intro">No trace yet: nothing has been said or found about this section.</p>}{selected.trace.map((step, index) => <button className="trace-step" key={`${selected.id}-${index}`} type="button" onClick={() => traceAction(step.type)}><span className={`trace-dot ${step.type}`}><span /></span><span className="trace-step-copy"><small>{index + 1} · {step.label}</small><strong>{step.detail}</strong></span><ArrowRight size={13} /></button>)}</div><div className="trace-footer"><CircleHelp size={14} /><span><strong>Open loop</strong>{selected.completeness < 70 ? ' One unanswered question is holding this section below pilot-ready.' : ' This section can now inform the next prototype move.'}</span></div></aside></div>
    <ImpactPanel live={live} sectionKey={selected.key} />
    <VersionHistory live={live} act={act} />
  </div>
}

function ReadinessView({ live, capabilities: caps, readiness, overallReadiness, selected, focusCapability, changeView }: ReadinessProps) {
  return <div className="page-wrap readiness-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Readiness is a conversation</p><h1>Find the ceiling,<br />not a false finish line.</h1><p>A capability is ready when the product can make a promise and keep it. The percentages are signals for where to look next — not grades for the team.</p></div><div className="readiness-hero-score"><div className="eyebrow">Current honest read</div><strong>{overallReadiness}%</strong><span>ready for a thin-slice pilot</span></div></div><div className="readiness-detail-grid"><section className="ceiling-card"><div className="ceiling-header"><div><p className="eyebrow">Capability ceiling</p><h2>What still needs to become true</h2></div><span className="ceiling-legend"><span className="legend-dot ready" />ready <span className="legend-dot open" />needs conversation</span></div><div className="ceiling-list">{caps.map((capability) => <div className="ceiling-row" key={capability.id}><div className="ceiling-row-title"><span className="capability-color" style={{ background: capability.color }} /><div><strong>{capability.label}</strong><small>{capability.kicker}</small></div><strong className="ceiling-number">{readiness[capability.id] ?? capability.readiness}%</strong></div><div className="ceiling-track"><span style={{ width: `${readiness[capability.id] ?? capability.readiness}%`, background: capability.color }} /><i style={{ left: `${readiness[capability.id] ?? capability.readiness}%` }} /></div><p>{capability.description}</p><div className="ceiling-row-footer"><span><MoveUpRight size={13} /> {capability.delta}</span><button type="button" onClick={() => focusCapability(capability)}>Work the edge <ArrowRight size={13} /></button></div></div>)}</div></section><aside className="readiness-aside"><div className="ceiling-callout"><span className="signal-icon"><Flame size={16} /></span><p><strong>The next honest move</strong>{selected.label} has the clearest path to a meaningful pilot moment. The Muse is ready to help you sharpen its promise.</p><button className="button button-primary full-width" type="button" onClick={() => focusCapability(selected)}>Open this capability <ArrowRight size={15} /></button></div><div className="readiness-principles"><p className="eyebrow">How the Studio decides</p><div><span>01</span><p><strong>Promise before output</strong>Make sure the customer experience is clear before the build gets busy.</p></div><div><span>02</span><p><strong>Trace every move</strong>Every story should point back to a capability and a decision.</p></div><div><span>03</span><p><strong>Invite the human at the edge</strong>Questions belong in the conversation, not hidden in a workflow.</p></div></div><button className="button button-quiet full-width" type="button" onClick={() => changeView('pilot')}><GitBranch size={15} /> See the traceable build lane</button></aside></div><ReadinessFactors live={live} /></div>
}

type PilotProps = { live: Live; act: Act; buildNow: (opts?: { redesign?: boolean; fresh?: boolean }) => void; sortedExecution: ExecutionItem[]; execution: ExecutionItem[]; changeView: (view: ViewId) => void; selected: Capability; toast: string; setToast: (value: string) => void }

function PilotView({ live, act, buildNow, sortedExecution, execution, changeView, selected, setToast }: PilotProps) {
  const columns: Array<{ id: typeof sortedExecution[number]['status']; label: string; description: string }> = [
    { id: 'queued', label: 'Backlog', description: 'Worth holding' },
    { id: 'ready', label: 'Ready to shape', description: 'Promise is clear' },
    { id: 'building', label: 'Being made real', description: 'Agent + human in motion' },
    { id: 'review', label: 'Human review', description: 'Decide what ships' },
  ]
  const moveItem = (itemId: string, status: typeof columns[number]['id'] | 'done') =>
    void act(() => api(`/api/use-cases/${live.id}/moves/${itemId}`, { method: 'PATCH', json: { status } }), status === 'done' ? 'Shipped — the move stays traceable to its decision' : `Moved into ${columns.find((column) => column.id === status)?.label.toLowerCase()}`)
  return <div className="page-wrap pilot-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />The build stays connected to the why</p><h1>Make the next move<br /><em>traceable.</em></h1><p>This is not a task board. It is the visible handoff from product truth to a production-minded pilot, with every move still attached to a capability and a decision.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => buildNow()} disabled={live.generateBusy}><Play size={15} /> {live.generateBusy ? 'Building…' : 'Stage pilot build'}</button><span><Network size={14} /> Routing is calm and visible</span></div></div><div className="pilot-strip"><div><span className="eyebrow">Pilot brief</span><strong>{live.validatedUseCase || live.statement || live.description}</strong></div><div className="pilot-strip-stats"><span><strong>{execution.length}</strong> traceable moves</span><span><strong>{live.capabilities.length}</strong> capabilities</span><span><strong>{selected.readiness}%</strong> active lens</span></div></div><div className="kanban-board">{columns.map((column) => { const items = sortedExecution.filter((item) => item.status === column.id); return <section className={`kanban-column ${column.id}`} key={column.id}><div className="kanban-column-header"><div><strong>{column.label}</strong><small>{column.description}</small></div><span>{items.length}</span></div><div className="kanban-cards">{items.map((item) => <article className="build-card" key={item.id}><div className="build-card-top"><span className={`status-pill ${item.status}`}>{item.signal}</span><button className="icon-button subtle" type="button" onClick={() => setToast(`${item.title}: ${item.capability} · “${item.decision}” · ${item.owner}`)} aria-label="Open card details"><MoreHorizontal size={15} /></button></div><h3>{item.title}</h3><div className="build-trace"><span><Target size={13} /> {item.capability}</span><span><Check size={13} /> “{item.decision}”</span></div><div className="build-card-footer"><span className="owner-avatar">{item.owner === 'Claude Code' ? 'C' : item.owner === 'UX agent' ? 'U' : item.owner === 'Product owner' ? 'PO' : 'A'}</span><small>{item.owner}</small><button className="card-next" type="button" onClick={() => moveItem(item.id, item.status === 'queued' ? 'ready' : item.status === 'ready' ? 'building' : item.status === 'building' ? 'review' : 'done')}><ArrowRight size={14} /></button></div></article>)}{items.length === 0 && <div className="empty-column">Nothing here yet.<br />That’s okay — the shape is still moving.</div>}</div></section> })}</div><ObservationComposer live={live} act={act} /><div className="pilot-footer"><div><span className="live-pulse" /> The Muse is watching for a blocker, not micromanaging the work.</div><button className="text-button" type="button" onClick={() => changeView('product')}>Return to product truth <ArrowRight size={14} /></button></div></div>
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
  return <div className="page-wrap validation-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />A use case is ready when it can make a promise</p><h1>Validate the use case<br /><em>before</em> you build around it.</h1><p>The Muse turns the conversation, evidence, and open questions into a recommendation. It does not create a gate. It tells you what would make the next prototype honest.</p></div><div className="intro-actions"><RoleSwitcher {...{ role, setRole }} /><button className="button button-primary" type="button" onClick={() => changeView('brief')}>Prepare prototype brief <ArrowRight size={16} /></button></div></div><div className="validation-grid"><section className="validation-card"><div className="validation-score-row"><div><p className="eyebrow">Use case readiness</p><h2>{validationScore}%</h2><p>{validationScore >= 80 ? 'Strong enough to prototype the thin slice.' : 'Keep probing the proof point before you widen the build.'}</p></div><div className="score-orbit"><div><strong>{validationScore}%</strong><small>confidence</small></div></div></div><div className="validation-checks">{checks.map((check) => <button className={`validation-check ${validationChecks[check.id] ? 'is-done' : ''}`} key={check.id} type="button" onClick={() => toggleValidation(check.id)}><span className="check-box">{validationChecks[check.id] && <Check size={13} />}</span><span><strong>{check.label}</strong><small>{live.validation?.[check.id]?.note || check.detail}</small></span><span className="check-status">{validationChecks[check.id] ? 'confirmed' : 'probe this'}</span></button>)}</div></section><aside className="validation-aside"><div className="recommendation-stack"><div className="stack-header"><div><p className="eyebrow">Muse recommendations</p><h3>Questions worth pulling forward</h3></div><Sparkles size={16} /></div>{recommendationState.length === 0 && <p className="trace-intro">The Muse pulls considerations, workflows and human pauses forward here as it learns the product.</p>}{recommendationState.map((recommendation) => <button className="recommendation-card" type="button" key={recommendation.id} onClick={() => askRecommendation(recommendation)}><div className={`recommendation-kind ${recommendation.kind}`}>{recommendation.kind === 'workflow' ? <Network size={14} /> : recommendation.kind === 'hitl' ? <UserRound size={14} /> : <CircleHelp size={14} />}</div><div><strong>{recommendation.title}</strong><p>{recommendation.reason}</p><small>Ask this in the Muse conversation <ArrowRight size={12} /></small></div></button>)}</div><div className="technical-signal-card"><div className="stack-header"><div><p className="eyebrow">Quiet technical interpretation</p><h3>The system is noticing patterns</h3></div><Bot size={16} /></div>{probeQuestion && <div className="probe-question"><span className="signal-icon"><CircleHelp size={14} /></span><p><strong>Probe now</strong>{probeQuestion}</p></div>}<p>{live.techNotes[0] || 'Without making the owner learn agent vocabulary, the Muse notes where a workflow could run on its own and where a person must pause it before meaning changes.'}</p><button className="text-button" type="button" onClick={() => setTechnicalOpen(!technicalOpen)}>{technicalOpen ? 'Hide technical read' : 'Inspect technical read'} <ArrowRight size={14} /></button>{technicalOpen && <div className="technical-drawer"><div><span className="technical-dot active" /><strong>Agentic workflow candidate</strong><small>{recommendationState.find((r) => r.kind === 'workflow')?.title ?? live.backlog.find((b) => b.recKind === 'workflow')?.title ?? 'None suggested yet'} · Inngest Agent Kit router</small></div><div><span className="technical-dot hitl" /><strong>Human-in-the-loop point</strong><small>{recommendationState.find((r) => r.kind === 'hitl')?.title ?? live.backlog.find((b) => b.recKind === 'hitl')?.title ?? 'The owner approves every change of meaning'}</small></div><div><span className="technical-dot ui" /><strong>UI surface suggestion</strong><small>{live.components.length ? `shadcn/ui ${live.components.slice(0, 4).map((c) => c.name).join(' + ')}` : 'shadcn/ui, chosen once the PRD has a shape'}</small></div>{live.techNotes.slice(1, 4).map((n) => <div key={n}><span className="technical-dot ui" /><strong>Technical note</strong><small>{n}</small></div>)}</div>}</div><div className="routing-mini"><p className="eyebrow">Agent Kit route</p>{agentRoutes.slice(0, 3).map((route, index) => <div className="routing-row" key={route.id}><span className={`route-node ${route.state}`} />{index < 2 && <span className="route-line" />}<span><strong>{route.agent}</strong><small>{route.action}</small></span><span className="route-state">{route.state}</span></div>)}</div></aside></div></div>
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
    setToast(`${files.map((f) => f.name).join(', ')} added to the evidence library — the Muse is reading it`)
    void act(async () => {
      const res = await fetch(`/api/use-cases/${live.id}/documents`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'The upload did not go through')
    })
  }
  const shown = filter === 'all' ? evidence : evidence.filter((e) => e.type === filter)
  return <div className="page-wrap evidence-page"><div className="page-intro"><div><p className="eyebrow">Evidence library · everything the Muse is allowed to believe</p><h1>Keep the “why”<br />close to the work.</h1><p>Upload research, attach an interview, or let a conversation become evidence. Every signal stays traceable to the use case, PRFAQ, or a decision.</p></div><div className="intro-actions"><RoleSwitcher {...{ role, setRole }} /><label className="button button-primary file-button"><Upload size={15} /> Add research<input type="file" multiple accept=".md,.txt,.pdf,.docx,.csv,.json,.png,.jpg,.jpeg" onChange={addEvidence} /></label></div></div><div className="evidence-toolbar"><div><span className="eyebrow">{evidence.length} sources connected</span><strong>Confidence grows when signals agree.</strong></div><div className="evidence-filters">{([['all', 'All evidence'], ['interview', 'Interviews'], ['research', 'Research'], ['uploaded', 'Uploads']] as const).map(([k, label]) => <button key={k} className={filter === k ? 'is-active' : ''} type="button" onClick={() => setFilter(k)}>{label}</button>)}</div></div><div className="evidence-grid">{shown.length === 0 && <div className="empty-column">No sources here yet. Upload research, or let the conversation become evidence.</div>}{shown.map((item) => <article className="evidence-card" key={item.id}><div className="evidence-card-top"><span className={`evidence-type ${item.type}`}>{item.type}</span><span className={`confidence ${item.confidence}`}>{item.confidence === 'high' ? <Check size={11} /> : item.confidence === 'medium' ? <CircleHelp size={11} /> : <Timer size={11} />} {item.confidence}</span></div><h3>{item.insight}</h3><div className="evidence-source"><FileText size={13} /><span><strong>{item.source}</strong><small>{item.trace}</small></span></div><button className="text-button" type="button" onClick={() => setToast(`Trace: ${item.trace || 'connected to the product shape'}`)}>See trace <ExternalLink size={12} /></button></article>)}</div><div className="evidence-footer"><div><span className="signal-icon"><Database size={15} /></span><p><strong>The Muse’s rule</strong>Research can inform the conversation, but it cannot silently become a requirement. The owner still decides what belongs.</p></div><button className="button button-quiet" type="button" onClick={() => changeView('validation')}>Use evidence to validate <ArrowRight size={14} /></button></div></div>
}

function BriefView({ live, act, buildNow, validationScore, repositoryUrl, generatedFiles, prototypeStatus, generatePrototype, generationVersion, setTechnicalOpen, technicalOpen, changeView, role, setRole, setToast }: { live: Live; act: Act; buildNow: (opts?: { redesign?: boolean; fresh?: boolean }) => void; validationScore: number; repositoryUrl: string; generatedFiles: string[]; prototypeStatus: 'idle' | 'assembling' | 'ready'; generatePrototype: () => void; setTechnicalOpen: (value: boolean) => void; technicalOpen: boolean; changeView: (view: ViewId) => void; role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void; setToast: (value: string) => void; generationVersion: number }) {
  const components = live.components.length ? live.components.map((c) => c.name) : ['Card', 'Tabs', 'Dialog', 'Textarea', 'DataTable', 'Sheet', 'Badge']
  const agentRoutes = live.routes
  const openDecisions = live.decisions.filter((d) => d.status !== 'approved').length
  const [registerOpen, setRegisterOpen] = useState(false)
  return <div className="page-wrap brief-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Ready to hand the work to Claude Code</p><h1>Assemble the brief<br /><em>without losing the why.</em></h1><p>The prototype payload is a living bundle: validated use case, PRFAQ, evidence, decisions, technical interpretation, component map, Agent Kit routes, and traceable Kanban.</p></div><div className="intro-actions"><RoleSwitcher {...{ role, setRole }} /><button className="button button-primary" type="button" onClick={() => buildNow()} disabled={live.generateBusy}><Play size={15} />{live.generateBusy ? live.generateStatus || 'Claude Code is building…' : live.preview.hasApp ? `Build version ${live.generateCount + 1} with Claude Code` : 'Build it with Claude Code'}</button><button className="button button-quiet" type="button" onClick={generatePrototype} disabled={prototypeStatus === 'assembling'}><PackageOpen size={15} />{prototypeStatus === 'assembling' ? 'Assembling ZIP…' : prototypeStatus === 'ready' ? 'Generate again + download ZIP' : 'Download Claude Code ZIP'}</button><span>{live.generateBusy ? 'Building on your Claude plan; the preview updates when it’s done' : repositoryUrl || 'Builds run on your Claude plan; the ZIP is for your own Claude Code'}</span></div></div><div className="brief-layout"><section className="brief-manifest"><div className="manifest-header"><div><p className="eyebrow">Prototype package · Claude Code</p><h2>{generatedFiles.length ? `${generatedFiles.length} files ready to ship` : 'The payload is ready to assemble'}</h2><span className="generation-count">Iteration {generationVersion || 0}</span></div><span className={`package-status ${prototypeStatus}`}><span />{prototypeStatus === 'ready' ? 'downloaded' : prototypeStatus === 'assembling' ? 'working' : 'draft'}</span></div><div className="manifest-grid"><ManifestItem icon={<Target size={15} />} title="Validated use case" detail={`${validationScore}% readiness recommendation`} /><ManifestItem icon={<FileText size={15} />} title="PRFAQ + decisions" detail={`Customer promise, ${live.decisions.length} decisions, ${openDecisions} open`} /><ManifestItem icon={<Database size={15} />} title="Evidence library" detail={`${live.evidence.length} sources: interview, research, upload, pilot traces`} /><ManifestItem icon={<Code2 size={15} />} title="Technical requirements" detail="Claude Code guardrails + production-minded boundary" /><ManifestItem icon={<Layers3 size={15} />} title="shadcn/ui component map" detail={`${components.length} suggested primitives, ready to adapt`} /><ManifestItem icon={<Bot size={15} />} title="Inngest Agent Kit routes" detail="Agent roles, routing, and human pauses" /></div><div className="file-list"><div className="eyebrow">Package contents</div>{(generatedFiles.length ? generatedFiles : ['README.md', 'PRFAQ.md', 'VALIDATED_USE_CASE.md', 'TECHNICAL_REQUIREMENTS.md', 'COMPONENT_MAP.json', 'AGENT_KIT_ROUTING.json', 'KANBAN.json', 'EVIDENCE.json', 'VISUAL_ANNOTATIONS.json', 'PRD.md', 'TRD.md', 'SPEC_TRACE.json', 'CLAUDE_CODE_PROMPT.md']).map((file) => <div key={file}><FileText size={13} /><span>{file}</span><Check size={13} /></div>)}</div></section><aside className="brief-aside"><div className="brief-side-card"><div className="stack-header"><div><p className="eyebrow">Component recommendations</p><h3>UI baseline for the thin slice</h3></div><Settings2 size={16} /></div><div className="component-pills">{components.map((component) => <span key={component}>{component}</span>)}</div><button className="text-button" type="button" onClick={() => setTechnicalOpen(!technicalOpen)}>{technicalOpen ? 'Hide mapping rationale' : 'Show mapping rationale'} <ArrowRight size={13} /></button>{technicalOpen && <div className="mapping-note">{live.components.some((c) => c.why) ? live.components.filter((c) => c.why).map((c) => `${c.name}: ${c.why}`).join(' ') : 'The component map is written from the PRD with the shadcn registry once the shape is clear. Until then the Studio’s baseline primitives stand in.'}</div>}</div><div className="brief-side-card routing-card"><div className="stack-header"><div><p className="eyebrow">Agent Kit orchestration</p><h3>Visible, not overwhelming</h3></div><RefreshCw size={16} /></div><div className="route-timeline">{agentRoutes.map((route) => <div key={route.id}><span className={`route-node ${route.state}`} /><div><strong>{route.agent}</strong><small>{route.action}</small></div><span className="route-state">{route.state}</span></div>)}</div></div><div className="human-register"><div className="stack-header"><div><p className="eyebrow">Human-in-the-loop register</p><h3>Meaning stays yours</h3></div><UserRound size={16} /></div><p>{live.decisions.length} decisions are tracked; {openDecisions} {openDecisions === 1 ? 'remains' : 'remain'} open before production hardening.</p><button className="button button-quiet full-width" type="button" onClick={() => setRegisterOpen(!registerOpen)}>Review open decision <ArrowRight size={14} /></button>{registerOpen && <DecisionRegister live={live} act={act} />}</div><button className="button button-quiet full-width" type="button" onClick={() => changeView('connections')}><FolderGit2 size={15} /> Review repository connection</button></aside></div><BuildHistory live={live} act={act} buildNow={buildNow} /></div>
}

function ManifestItem({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="manifest-item"><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><Check size={13} /></div>
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
function AnnotationPanel({ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }: { annotationMode: boolean; setAnnotationMode: (value: boolean) => void; annotationTarget: string; annotationNote: string; setAnnotationNote: (value: string) => void; isListening: boolean; toggleVoice: () => void; addAnnotation: () => void; captureFrame: (mode?: 'surface' | 'screen') => void; capturedFrame: string; annotationShape: 'object' | 'circle' | 'full-screen'; setAnnotationShape: (value: 'object' | 'circle' | 'full-screen') => void }) {
  return <div className={`annotation-panel ${annotationMode || annotationTarget ? 'is-open' : ''}`}><div className="annotation-panel-top"><div><p className="eyebrow">Vibe annotation layer</p><h3>Point at the part you want to change.</h3></div><button className="icon-button subtle" type="button" onClick={() => setAnnotationMode(false)} aria-label="Close annotation mode"><X size={15} /></button></div><p className="annotation-copy">Click a part of the live product, or drag a circle around a region, and describe what you’re seeing. Your note becomes a backlog signal with the captured frame attached.</p><div className="annotation-target-row"><span className="annotation-pin"><MousePointer2 size={14} /></span><span>{annotationTarget || 'No surface selected yet'}</span>{annotationTarget && <span className="selected-chip"><Check size={12} /> selected</span>}</div><div className="annotation-modes"><span className="eyebrow">Capture context</span><button className={annotationShape === 'object' ? 'is-active' : ''} type="button" onClick={() => setAnnotationShape('object')}><MousePointer2 size={12} /> Object</button><button className={annotationShape === 'circle' ? 'is-active' : ''} type="button" onClick={() => setAnnotationShape('circle')}><CircleHelp size={12} /> Circle region</button><button className={annotationShape === 'full-screen' ? 'is-active' : ''} type="button" onClick={() => setAnnotationShape('full-screen')}><Maximize2 size={12} /> Full screen</button></div><div className="annotation-composer"><textarea value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} placeholder="What should feel different here?" rows={2} /><div className="annotation-actions"><button className={`voice-button ${isListening ? 'is-listening' : ''}`} type="button" onClick={toggleVoice}><Mic size={14} /> {isListening ? 'Listening…' : 'Add voice note'}</button><div><button className="button button-quiet button-small" type="button" onClick={() => captureFrame(annotationShape === 'full-screen' ? 'screen' : 'surface')}><Maximize2 size={13} /> {annotationShape === 'full-screen' ? 'Capture screen' : annotationShape === 'circle' ? 'Capture circle' : 'Capture frame'}</button><button className="button button-primary button-small" type="button" onClick={addAnnotation} disabled={!annotationNote.trim()}>Add to backlog <ArrowRight size={13} /></button></div></div></div>{capturedFrame && <div className="captured-frame"><img src={capturedFrame} alt="Captured product preview frame" /><span>Frame attached to the annotation</span></div>}</div>
}
