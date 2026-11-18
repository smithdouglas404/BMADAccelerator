'use client'
import { useEffect, useMemo, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  ArrowRight,
  Bell,
  CircleHelp,
  Play,
} from 'lucide-react'
import {
  type Capability,
  type RecommendationItem,
} from './data'
import { downloadPrototypeZip } from './generation'
import { api, toBacklog, toCapabilities, toEvidence, toExecution, toMessages, toRecommendations, toSpec, useLive, type Live, type StudioMessage } from './live'
import { captureLive, useVoice, type Pick } from './vibe'
import { NextMove, PERSONAS, PersonaPicker, PeopleMenu, personaFor, talkingTo, useMe, type StudioView } from './flow'
import { TruthGraphView, ObservationEffects } from './truth'
import { AgentsView } from './agents'
import { StoryMapView } from './storymap'
import { BoardView } from './board'
import { ObservationComposer } from './extras'
import { ASSISTANT_NAME, PRODUCT_LINE } from '@/lib/brand'
import { hasDetail, needsTriage } from '@/lib/studio/journey'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentPanel, EvidenceTracePanel } from './sources'
import { StudioFrame, StudioSidebar, StudioTopBar } from './shell'
import { ConversationView } from './socra'
import { OverviewView } from './overview'
import { SpecView } from './specview'
import { BriefView } from './brief'
import { ReviewView, PreviewCard, AnnotationPanel } from './review'
import { ProductView, ValidationView, EvidenceView, ReadinessView } from './prove'
import { ConnectionsView } from './connections'
import { Toast } from './kit'

const viewTitles: Record<StudioView, string> = {
  review: 'Try & mark up',
  overview: 'Whole product',
  conversation: 'Talk to Socra',
  validation: 'Validate use case',
  product: 'Product story (PRFAQ)',
  evidence: 'Evidence & signals',
  truth: 'Product Truth Graph',
  spec: 'Requirements doc (PRD)',
  trd: 'Technical design (TRD)',
  readiness: 'Pilot readiness',
  brief: 'Generate the prototype',
  pilot: 'Backlog & board',
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
      <div data-ui className="grid min-h-svh place-items-center bg-background px-4">
        <div className="grid w-full max-w-sm justify-items-start gap-3 rounded-lg border border-border bg-card p-6 shadow-sm animate-in fade-in zoom-in-95 duration-300">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-lg font-bold text-primary-foreground">{ASSISTANT_NAME.slice(0, 1)}</span>
          <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">{PRODUCT_LINE}</p>
          <strong className="text-base">{error ? 'This product could not be opened.' : 'Opening the product…'}</strong>
          {error && <small className="text-sm text-muted-foreground">{error}</small>}
          {error && <Button asChild variant="link" className="h-auto p-0"><a href="/">Back to all products <ArrowRight className="size-4" /></a></Button>}
        </div>
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
  // Who you are decides what the menu shows first, where you start, and how Socra talks to you.
  const pickPersona = (p: (typeof PERSONAS)[number]) => {
    setMe({ ...me, role: p.role })
    try { window.localStorage.setItem('studio-persona-chosen', '1') } catch { /* private window */ }
    if (me.name) void api(`/api/use-cases/${live.id}/members`, { json: { name: me.name, role: p.role } }).catch(() => undefined)
    changeView(p.start)
    setToast(`You’re in as ${p.label.toLowerCase()}. You start in the right place, and Socra talks your language. The path is the same for everyone; other tools are under More.`)
  }
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
  // The lens follows who you said you are (Working as …): tech leads see the engineer's view, everyone else the owner's.
  const role: 'owner' | 'engineer' = personaFor(me.role).key === 'tech' ? 'engineer' : 'owner'
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

  // Drill-downs: a stored document, or an evidence card's trace, opened over the current screen.
  const [docOpen, setDocOpen] = useState('')
  const [traceOpen, setTraceOpen] = useState('')
  useEffect(() => {
    const open = (e: Event) => setDocOpen(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('studio-open-doc', open)
    return () => window.removeEventListener('studio-open-doc', open)
  }, [])
  const [truthNode, setTruthNode] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('node') ?? ''))
  const changeView = (view: StudioView, node = '') => {
    setActiveView(view)
    const keep = view === 'truth' || view === 'spec' || view === 'trd'
    setTruthNode(keep ? node : '')
    setDocOpen(''); setTraceOpen('')
    try { window.history.replaceState(null, '', `?view=${view}${keep && node ? `&node=${encodeURIComponent(node)}` : ''}`) } catch { /* ignore */ }
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

  // Generate never silently does nothing: before a build, say what is missing and where to fix it.
  const [buildGuard, setBuildGuard] = useState<{ opts: BuildOpts; gaps: BuildGap[] } | null>(null)
  const buildGaps = (): BuildGap[] => {
    const gaps: BuildGap[] = []
    const said = live.messages.filter((m) => m.role === 'user').length
    const open = live.decisions.filter((d) => d.status === 'open').length
    const fresh = live.backlog.filter((b) => needsTriage(b)).length
    if (!live.agentsEnabled) gaps.push({ text: 'Claude isn’t signed in yet, so Claude Code can’t build. Sign it in on Settings.', href: '/settings', cta: 'Open Settings', blocking: true })
    if (!said && !live.capabilities.length) gaps.push({ text: `${ASSISTANT_NAME} doesn’t know what to build yet. Tell it in a few lines what the product should do.`, view: 'conversation', cta: `Talk to ${ASSISTANT_NAME}`, blocking: true })
    if (open) gaps.push({ text: `${open} ${open === 1 ? 'checkpoint waits' : 'checkpoints wait'} for your decision. The build would go with ${ASSISTANT_NAME}’s suggestion.`, view: 'conversation', cta: 'Decide' })
    if (fresh) gaps.push({ text: `${fresh} new backlog ${fresh === 1 ? 'item isn’t' : 'items aren’t'} accepted yet, so the build leaves ${fresh === 1 ? 'it' : 'them'} out.`, view: 'pilot', cta: 'Open the backlog' })
    if (live.capabilities.length && !live.moves.some((m) => hasDetail(m.prompt ?? ''))) gaps.push({ text: 'No card has acceptance criteria yet, so the build rests on what Socra inferred.', view: 'pilot', cta: 'Add detail' })
    return gaps
  }
  const buildNow = (opts: BuildOpts = {}) => {
    if (live.generateBusy) { setToast('A build is already running. The preview updates when it’s done; watch the status at the top right.'); return }
    const gaps = buildGaps()
    if (gaps.some((g) => g.blocking) || (!opts.force && gaps.length)) { setBuildGuard({ opts, gaps }); return }
    setBuildGuard(null)
    void act(() => api(`/api/use-cases/${live.id}/generate`, { json: { redesign: opts.redesign, fresh: opts.fresh } }), opts.fresh ? 'Starting fresh: the old design is set aside and Claude Code builds from the product truth' : 'Claude Code is building the next version. The status shows at the top right, and Try & mark up opens it when it’s done.')
  }

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
    const canvas = await html2canvas(target, { backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff', scale: mode === 'screen' ? 1 : 1.5 })
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
  const props = { live, reload, act, setToast, changeView, openDoc: setDocOpen, openTrace: setTraceOpen, me }
  // Red counts in the menu: what is waiting on a person, and where.
  const navFlags: Partial<Record<StudioView, number>> = {
    conversation: live.decisions.filter((d) => d.status === 'open').length,
    pilot: live.backlog.filter((b) => needsTriage(b)).length,
  }

  return (
    <StudioFrame sidebar={<StudioSidebar useCase={{
      id: live.id, name: live.name, stageLabel: live.stageLabel, active: activeView, onNavigate: (v) => changeView(v),
      flags: navFlags, me, onPersona: pickPersona,
      thoughts: backlog.length, buildMoves: execution.length,
      onCapture: () => { if (!document.getElementById('ambient-capture')) changeView('product'); window.setTimeout(() => document.getElementById('ambient-capture')?.focus(), 80) },
    }} />}>
      <StudioTopBar
        crumbs={<><span className="truncate">{live.name}</span><span aria-hidden>/</span><strong className="truncate font-semibold text-foreground">{viewTitles[activeView]}</strong></>}
        actions={<><span className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-2 rounded-full bg-primary" />{live.generateBusy ? live.generateStatus || 'Claude Code is building' : busy ? live.agentStatus || 'Socra is working' : 'All changes saved'}</span><Button type="button" size="icon" variant="ghost" aria-label="Notifications" onClick={() => changeView('conversation')}><Bell className="size-5" /></Button><PeopleMenu live={live} me={me} setMe={setMe} setToast={setToast} /></>}
      />
      <div data-ui className="relative min-w-0 flex-1">
        <NextMove live={live} changeView={changeView} />
        {!live.agentsEnabled && <div role="status" className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm md:mx-8"><CircleHelp className="size-4 text-primary" /><span className="flex-1">Socra and Claude Code switch on once Claude is signed in. Everything you say is kept meanwhile.</span><Button asChild size="sm" variant="outline"><a href="/settings">Open Settings <ArrowRight /></a></Button></div>}

        {activeView === 'overview' && <OverviewView {...{ live, act, me, selected, capabilities, readiness, overallReadiness, approvalCount, messages, backlog, focusCapability, changeView, capture, setCapture, captureIdea }} preview={<><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} setAnnotationMode={setAnnotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} /><AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} /></>} />}
        {activeView === 'conversation' && <ConversationView {...{ live, act, me, talkTo, setTalkTo, voice: composerVoice, selected, capabilities, messages, draft, setDraft, sendMessage, focusCapability, setToast, changeView }} preview={<PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} onPick={onPick} onAnnotate={() => changeView('review')} />} />}
        {activeView === 'review' && <ReviewView {...{ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }} />}
        {activeView === 'validation' && <ValidationView {...{ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }} />}
        {activeView === 'product' && <ProductView {...{ live, act, me, selected, backlog, capture, setCapture, captureIdea, approvalCount, changeView }} />}
        {activeView === 'evidence' && <EvidenceView {...{ live, act, me, evidence, changeView, role, setRole, setToast, openDoc: setDocOpen, openTrace: setTraceOpen }} />}
        {activeView === 'agents' && <AgentsView live={live} me={me} setToast={setToast} />}
        {activeView === 'truth' && <TruthGraphView key={truthNode || 'all'} live={live} changeView={changeView} setToast={setToast} focusNode={truthNode} />}
        {activeView === 'storymap' && <StoryMapView live={live} me={me} changeView={changeView} setToast={setToast} />}
        {activeView === 'spec' && <SpecView key={`prd${truthNode}`} focusKey={truthNode} {...{ ...props, specSections, messages, evidence, backlog, execution }} />}
        {activeView === 'trd' && <SpecView key={`trd${truthNode}`} focusKey={truthNode} initialTab="trd" {...{ ...props, specSections, messages, evidence, backlog, execution }} />}
        {activeView === 'readiness' && <ReadinessView {...{ live, capabilities, readiness, overallReadiness, selected, focusCapability, changeView }} />}
        {activeView === 'brief' && <BriefView {...{ live, act, validationScore, repositoryUrl: live.repoUrl, generatedFiles: generatedFiles.length ? generatedFiles : live.packageFiles, prototypeStatus, generatePrototype, buildNow, generationVersion, setTechnicalOpen, technicalOpen, changeView, role, setRole, setToast }} />}
        {activeView === 'pilot' && <BoardView live={live} me={me} buildNow={buildNow} changeView={changeView} setToast={setToast}><ObservationComposer live={live} act={act} /><ObservationEffects live={live} /></BoardView>}
        {activeView === 'connections' && <ConnectionsView {...{ live, act, setToast, changeView }} />}

        {docOpen && <DocumentPanel live={live} docId={docOpen} onClose={() => setDocOpen('')} />}
        {traceOpen && (() => { const ev = live.evidence.find((e) => e.id === traceOpen); return ev ? <EvidenceTracePanel live={live} ev={ev} onClose={() => setTraceOpen('')} openDoc={(id) => { setTraceOpen(''); setDocOpen(id) }} changeView={changeView} /> : null })()}
        <PersonaPicker onPick={pickPersona} />
        <Dialog open={!!buildGuard} onOpenChange={(v) => { if (!v) setBuildGuard(null) }}>
          {buildGuard && <DialogContent data-ui className="sm:max-w-xl">
            <DialogHeader>
              <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">Before you generate</p>
              <DialogTitle className="text-xl font-semibold">{buildGuard.gaps.some((g) => g.blocking) ? 'There isn’t enough to build yet.' : 'A few things would make this build better.'}</DialogTitle>
              <DialogDescription className="sr-only">What is missing before Claude Code builds, and where to fix it.</DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2">{buildGuard.gaps.map((g) => (
              <li key={g.text} className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-sm ${g.blocking ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                <span className="min-w-0 flex-1 basis-60">{g.text}</span>
                {g.href ? <Button asChild size="sm" variant="outline"><a href={g.href}>{g.cta} <ArrowRight className="size-4" /></a></Button> : <Button type="button" size="sm" variant="outline" onClick={() => { setBuildGuard(null); changeView(g.view!) }}>{g.cta} <ArrowRight className="size-4" /></Button>}
              </li>))}</ul>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBuildGuard(null)}>Not now</Button>
              {!buildGuard.gaps.some((g) => g.blocking) && <Button type="button" onClick={() => buildNow({ ...buildGuard.opts, force: true })}><Play className="size-4" /> Generate anyway</Button>}
            </DialogFooter>
          </DialogContent>}
        </Dialog>
        <Toast message={toast} onClose={() => setToast('')} />
      </div>
    </StudioFrame>
  )
}












type BuildOpts = { redesign?: boolean; fresh?: boolean; force?: boolean }
type BuildGap = { text: string; view?: StudioView; href?: string; cta: string; blocking?: boolean }

export default App







