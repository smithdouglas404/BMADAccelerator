'use client'
import { useEffect, useMemo, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  ArrowRight,
  Bell,
  Check,
  CircleHelp,
  X,
} from 'lucide-react'
import {
  type Capability,
  type RecommendationItem,
} from './data'
import { downloadPrototypeZip } from './generation'
import { api, toBacklog, toCapabilities, toEvidence, toExecution, toMessages, toRecommendations, toSpec, useLive, type Live, type StudioMessage } from './live'
import { captureLive, useVoice, type Pick } from './vibe'
import { NextMove, PeopleMenu, talkingTo, useMe, type StudioView } from './flow'
import { TruthGraphView, ObservationEffects } from './truth'
import { AgentsView } from './agents'
import { StoryMapView } from './storymap'
import { BoardView } from './board'
import { ObservationComposer } from './extras'
import { PRODUCT_LINE } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { StudioFrame, StudioSidebar, StudioTopBar } from './shell'
import { ConversationView } from './socra'
import { OverviewView } from './overview'
import { SpecView } from './specview'
import { BriefView } from './brief'
import { ReviewView, PreviewCard, AnnotationPanel } from './review'
import { ProductView, ValidationView, EvidenceView, ReadinessView } from './prove'
import { ConnectionsView } from './connections'

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
        actions={<><span className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-2 rounded-full bg-primary" />{live.generateBusy ? live.generateStatus || 'Claude Code is building' : busy ? live.agentStatus || 'Socra is working' : 'All changes saved'}</span><Button type="button" size="icon" variant="ghost" aria-label="Notifications" onClick={() => changeView('conversation')}><Bell className="size-5" /></Button><PeopleMenu live={live} me={me} setMe={setMe} setToast={setToast} /></>}
      />
      <div className="main-content">
        <NextMove live={live} changeView={changeView} />
        {!live.agentsEnabled && <div className="studio-banner"><CircleHelp size={14} /><span>Socra and Claude Code switch on once Claude is signed in. Everything you say is kept meanwhile.</span><a href="/settings">Open Settings <ArrowRight size={13} /></a></div>}

        {activeView === 'overview' && <OverviewView {...{ live, act, me, selected, capabilities, readiness, overallReadiness, approvalCount, messages, backlog, focusCapability, changeView, capture, setCapture, captureIdea }} preview={<><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} setAnnotationMode={setAnnotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} /><AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} /></>} />}
        {activeView === 'conversation' && <ConversationView {...{ live, act, me, talkTo, setTalkTo, voice: composerVoice, selected, capabilities, messages, draft, setDraft, sendMessage, focusCapability, setToast, changeView }} preview={<PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} onPick={onPick} />} />}
        {activeView === 'review' && <ReviewView {...{ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }} />}
        {activeView === 'validation' && <ValidationView {...{ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }} />}
        {activeView === 'product' && <ProductView {...{ live, act, me, selected, backlog, capture, setCapture, captureIdea, approvalCount, changeView }} />}
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












export default App







