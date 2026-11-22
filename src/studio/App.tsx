'use client'
import { Rich } from './rich'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  ArrowDownRight,
  Bot,
  Code2,
  Database,
  Download,
  ExternalLink,
  FolderGit2,
  MousePointer2,
  PackageOpen,
  RefreshCw,
  Settings2,
  Wrench,
  Upload,
  UserRound,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  Filter,
  Flame,
  GitBranch,
  History,
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
  Pencil,
  Waves,
  X,
  PenLine,
  Zap,
  Workflow,
  CornerDownRight, MessageSquareReply,
  Server,
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
import { NextMove, journeyOf, PERSONAS, personaFor, PersonaPicker, PersonaSwitch, menuFor, HARNESS, type NavItem, PeopleMenu, TeamPanel, Checkpoints, UndoChip, optionsFrom, roleShort, specialistIcon, useMe, type Me, type StudioView } from './flow'
import { TruthGraphView, MarkChain, ObservationEffects } from './truth'
import { ConversationStream } from './convo'
import { ProgressView } from './progress'
import { AgentsView } from './agents'
import { StoryMapView } from './storymap'
import { BoardView, DeferAsk, ItemRecord, inDays } from './board'
import { dayLabel, deferredUntil } from '@/lib/studio/journey'
import { ProductSwitcher, StudioMarkdown, SpecReviewTools, ImpactPanel, VersionHistory, ReadinessFactors, DecisionRegister, ObservationComposer, SyncPreview, ProvidersCard, BuildHistory } from './extras'
import { ASSISTANT_NAME, PRODUCT_LINE } from '@/lib/brand'
import { hasDetail, needsTriage } from '@/lib/studio/journey'
import { DocumentPanel, EvidenceTracePanel } from './sources'
import { EditButton, EditableText } from './editable'
import { SaveButton, useSaveState } from './savestate'
import { PrfaqDoc, PrfaqQuestions, useAskPrfaq, usePrfaqInfo } from './prfaqtalk'
import { PrfaqPanel } from './prfaqwalk'
import { SpecDocUpload, SpecGuide } from './specwalk'

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
  brief: 'Build the prototype',
  pilot: 'Backlog & board',
  storymap: 'Story map',
  connections: 'Connections',
  agents: 'Agents',
}

// What picking a backlog item can do: say yes to working on it now (it goes to Ready to shape and Socra starts), or open the Board.
const BacklogCtx = createContext<{ workOn: (id: string) => void; decide: (id: string, to: 'accepted' | 'rejected' | 'deferred', until?: string) => void; openBoard: () => void; live: Live; me: Me; setToast: (v: string) => void } | null>(null)

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
  // The statement being replied to (Reply on a message): the reply goes to whoever said it (Doug, Nov 21).
  const [replying, setReplying] = useState<StudioMessage | null>(null)
  const [me, setMe] = useMe()
  const menu = useMemo(() => menuFor(me.role), [me.role])
  const [ourSkills, setOurSkills] = useState<number | null>(null)
  useEffect(() => { void fetch('/api/skills/library', { cache: 'no-store' }).then((r) => r.json()).then((rows: { source: string }[]) => setOurSkills(Array.isArray(rows) ? rows.filter((r) => r.source === 'studio').length : null)).catch(() => setOurSkills(null)) }, [])
  // Who you are decides what the menu shows first, where you start, and how Socra talks to you.
  const pickPersona = (p: (typeof PERSONAS)[number]) => {
    setMe({ ...me, role: p.role })
    try { window.localStorage.setItem('studio-persona-chosen', '1') } catch { /* private window */ }
    if (me.name) void api(`/api/use-cases/${live.id}/members`, { json: { name: me.name, role: p.role } }).catch(() => undefined)
    changeView(p.start)
    setToast(`You’re in as ${p.label.toLowerCase()}. You start in the right place, and Socra talks your language. The path is the same for everyone; other tools are under More.`)
  }

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
  const visibleBacklog = showAllBacklog ? backlog : backlog.slice(0, 3)
  // Pick a backlog item, say yes to "work on it now": its card goes to Ready to shape and the skills start.
  const workOn = (itemId: string) => {
    const item = live.backlog.find((b) => b.id === itemId)
    void act(async () => {
      const res = await api<{ moveId?: string }>(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { triage: 'accepted', ready: true, by: me.name || me.role } })
      // Doug (Nov 21): yes opens the new card at once, to fill in, with Socra's questions at the top.
      if (res?.moveId) changeView('pilot', `move:${res.moveId}`)
    }, `“${item?.title ?? 'It'}” is in Ready to shape. Fill in what you know; ${ASSISTANT_NAME}'s questions are at the top.`)
  }

  // Accept (not yet working on it), Reject or Defer, from the item's detail view.
  const decide = (itemId: string, to: 'accepted' | 'rejected' | 'deferred', until = '') => {
    const item = live.backlog.find((b) => b.id === itemId)
    const name = item?.title ?? 'It'
    const done = to === 'accepted' ? `“${name}” is accepted onto the Board (Backlog column).` : to === 'rejected' ? `“${name}” is rejected (kept in history).` : `“${name}” is deferred until ${until ? dayLabel(`${until}T00:00:00`) : 'later'}. It keeps its place and turns red again that day.`
    void act(() => api(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { triage: to, by: me.name || me.role, ...(until ? { until } : {}) } }), done)
  }
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

  // rethrow: a Save button that must show "Not saved" gets the failure back as well as the toast.
  const act = async (fn: () => Promise<unknown>, ok?: string, opts?: { rethrow?: boolean }) => {
    try {
      await fn()
      if (ok) setToast(ok)
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
      if (opts?.rethrow) throw e
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
    const keep = view === 'truth' || view === 'spec' || view === 'trd' || view === 'pilot'
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
    const re = replying
    const to = re?.specialist ?? ''
    setReplying(null)
    void act(async () => {
      const r = await api<{ approved: boolean; picked: number[] }>(`/api/use-cases/${live.id}/messages`, { json: { content: text, author: me, ...(to ? { to } : {}), ...(re ? { replyTo: re.id } : {}), ...(spoken ? { raw: spoken, source: 'Voice' } : {}) } })
      setToast(re ? `Reply sent to ${re.label.split(' · ')[0]}; the answer appears under it` : r.picked?.length ? `Option ${r.picked.join(' and ')} chosen and carried forward. You can undo it.` : r.approved ? 'Approved and carried forward. You can undo it.' : 'Thought held in the backlog. Socra and the team are looking at it')
    })
  }
  const composerVoice = useVoice(live.connections.voice, (text, spoken) => sendMessage(text, spoken), setToast, { clean: true, useCaseId: live.id })

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
    setToast('Bundling the PRFAQ, PRD, TRD, evidence and board into a ZIP for your own Claude Code')
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
    const canvas = await html2canvas(target, { backgroundColor: getComputedStyle(document.body).backgroundColor || '#111412', scale: mode === 'screen' ? 1 : 1.5 })
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

  // Accordion menu (Doug, Nov 21): each group folds. The group holding the current screen is open, others remember what
  // you chose in this browser; a folded header still shows how many things need you inside it.
  const [navOpen, setNavOpen] = useState<Record<string, boolean>>({})
  useEffect(() => { try { setNavOpen(JSON.parse(window.localStorage.getItem('studio-nav-open') || '{}')) } catch { /* default */ } }, [])
  const toggleGroup = (title: string, now: boolean) => {
    const next = { ...navOpen, [title]: !now }
    setNavOpen(next)
    try { window.localStorage.setItem('studio-nav-open', JSON.stringify(next)) } catch { /* private window */ }
  }
  const navGroup = (title: string, about: string, items: NavItem[], extra = '') => {
    const holdsActive = items.some((i) => i.id === activeView)
    const isOpen = holdsActive || (navOpen[title] ?? title === 'Your path')
    const flagged = items.reduce((n, i) => n + (navFlags[i.id] ?? 0), 0)
    const id = `nav-${title.replace(/\W+/g, '-').toLowerCase()}`
    return (
      <div className={`studio-nav-group studio-nav-accordion ${extra} ${isOpen ? 'is-open' : ''}`} key={title}>
        <button type="button" className="sidebar-section-label studio-stage-label studio-nav-head" aria-expanded={isOpen} aria-controls={id} onClick={() => { if (!holdsActive) toggleGroup(title, isOpen) }} title={holdsActive ? 'This group holds the screen you are on' : `${isOpen ? 'Fold' : 'Open'} ${title}`}>
          <span className="studio-nav-head-text"><span>{title}</span><small>{about}</small></span>
          {!isOpen && flagged > 0 && <span className="studio-needs-you" title={`${flagged} ${flagged === 1 ? 'thing needs' : 'things need'} you in here`}>{flagged}</span>}
          <ChevronDown size={14} className="studio-nav-chevron" aria-hidden />
        </button>
        <div className="studio-nav-body" id={id}><div>{items.map(navButton)}</div></div>
      </div>
    )
  }
  const navButton = (item: NavItem) => {
            const flag = navFlags[item.id] ?? 0
            return (
            <button className={`nav-item ${activeView === item.id ? 'is-active' : ''}`} key={item.id} onClick={() => changeView(item.id)} type="button" title={item.tip} aria-label={`${item.label}: ${item.tip}`} data-tip={item.tip}>
              <span className="nav-icon">
                {item.id === 'review' && <MousePointer2 size={17} />}
                {item.id === 'overview' && <Layers3 size={17} />}
                {item.id === 'conversation' && <Waves size={17} />}
                {item.id === 'validation' && <CircleHelp size={17} />}
                {item.id === 'product' && <FileText size={17} />}
                {item.id === 'evidence' && <Database size={17} />}
                {item.id === 'truth' && <Network size={17} />}
                {item.id === 'storymap' && <Workflow size={17} />}
                {item.id === 'agents' && <Bot size={17} />}
                {item.id === 'spec' && <FileText size={17} />}
                {item.id === 'trd' && <Code2 size={17} />}
                {item.id === 'readiness' && <Target size={17} />}
                {item.id === 'brief' && <Play size={17} />}
                {item.id === 'pilot' && <Zap size={17} />}
                {item.id === 'connections' && <FolderGit2 size={17} />}
              </span>
              <span className={`nav-copy ${flag > 0 ? 'studio-needs-label' : ''}`}><strong>{item.label}</strong><small>{item.hint}</small></span>
              {flag > 0 ? <span className="studio-needs-you" title={`${flag} ${flag === 1 ? 'thing needs' : 'things need'} you here`}>{flag}</span> : item.id === 'conversation' && <span className="nav-live-dot" />}
            </button>
          )}
  return (
    <BacklogCtx.Provider value={{ workOn, decide, openBoard: () => changeView('pilot'), live, me, setToast }}>
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup studio-home-brand" href="/" title="All use cases">
          <div className="brand-mark"><span /><span /><span /></div>
          <div>
            <p className="eyebrow">{PRODUCT_LINE}</p>
            <p className="brand-name">{ASSISTANT_NAME}<span>.</span></p>
          </div>
          <span className="version-badge">0.1</span>
        </a>
        <a className="studio-home-link" href="/"><ArrowLeft size={13} /> All use cases</a>

        <ProductSwitcher live={live}>
          <span className="project-glyph">{initials(live.name).slice(0, 1)}</span>
          <span className="project-switcher-copy"><strong>{live.name}</strong><small>{live.stageLabel}</small></span>
          <ChevronDown size={15} />
        </ProductSwitcher>

        <nav className="primary-nav studio-nav" aria-label="Product workspace">
          {menu.groups.map((group) => navGroup(group.title, group.about, group.items))}
          {menu.more.length > 0 && navGroup('More tools', `${menu.more.length} more`, menu.more, 'studio-nav-more')}
          <div className="studio-nav-group studio-nav-harness">
            <a className="nav-item" href={HARNESS.href} title={HARNESS.tip} aria-label={`${HARNESS.label}: ${HARNESS.tip}`} data-tip={HARNESS.tip}>
              <span className="nav-icon"><Server size={17} /></span>
              <span className="nav-copy"><strong>{HARNESS.label}</strong><small>{HARNESS.hint}</small></span>
            </a>
          </div>
        </nav>

        <nav className="studio-nav studio-nav-foot" aria-label="Our skills">
          <a className="nav-item" href="/settings?tab=skills&source=studio" title="The Studio's own skills, kept in our private copy of ECC" aria-label="Skills: the Studio's own skills, kept in our private copy of ECC" data-tip="The Studio's own skills, kept in our private copy of ECC">
            <span className="nav-icon"><Wrench size={17} /></span>
            <span className="nav-copy"><strong>Skills</strong><small>{ourSkills === null ? 'the Studio’s own skills' : `${ourSkills} of ours, in our private ECC copy`}</small></span>
          </a>
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
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>{live.name}</span><span className="crumb-slash">/</span><strong>{viewTitles[activeView]}</strong></div>
          <div className="topbar-actions"><span className="save-state"><span /> {live.generateBusy ? live.generateStatus || 'Claude Code is building' : busy ? live.agentStatus || 'Socra is working' : 'All changes saved'}</span><button className="icon-button" type="button" aria-label="Notifications" onClick={() => changeView('conversation')}><Bell size={17} /></button><PeopleMenu live={live} me={me} setMe={setMe} setToast={setToast} onPickPersona={pickPersona} /></div>
        </header>

        <NextMove live={live} changeView={changeView} />
        {!live.agentsEnabled && <div className="studio-banner"><CircleHelp size={14} /><span>Socra and Claude Code switch on once Claude is signed in. Everything you say is kept meanwhile.</span><a href="/settings">Open Settings <ArrowRight size={13} /></a></div>}

        {activeView === 'overview' && <OverviewView {...{ live, product: live, selected, capabilities, readiness, overallReadiness, approvalCount, backlog, focusCapability, changeView, capture, setCapture, captureIdea, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, previewMode, setPreview, toast, setToast, annotationMode, setAnnotationMode, annotationTarget, setAnnotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, messages }} />}
        {activeView === 'conversation' && <ConversationView {...{ live, act, me, replying, setReplying, voice: composerVoice, selected, capabilities, messages, draft, setDraft, sendMessage, focusCapability, previewMode, setPreview, toast, setToast, changeView, onPick }} />}
        {activeView === 'review' && <ReviewView {...{ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }} />}
        {activeView === 'validation' && <ValidationView {...{ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }} />}
        {activeView === 'product' && <ProductView {...{ live, act, me, selected, capabilities, backlog, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, capture, setCapture, captureIdea, approvalCount, changeView, toast, setToast }} />}
        {activeView === 'evidence' && <EvidenceView {...{ live, act, me, evidence, changeView, role, setRole, setToast, openDoc: setDocOpen, openTrace: setTraceOpen }} />}
        {activeView === 'agents' && <AgentsView live={live} me={me} setToast={setToast} />}
        {activeView === 'truth' && <TruthGraphView key={truthNode || 'all'} live={live} changeView={changeView} setToast={setToast} focusNode={truthNode} />}
        {activeView === 'storymap' && <StoryMapView live={live} me={me} changeView={changeView} setToast={setToast} />}
        {activeView === 'spec' && <SpecView key={`prd${truthNode}`} focusKey={truthNode} {...{ ...props, specSections, messages, evidence, backlog, execution }} />}
        {activeView === 'trd' && <SpecView key={`trd${truthNode}`} focusKey={truthNode} initialTab="trd" {...{ ...props, specSections, messages, evidence, backlog, execution }} />}
        {activeView === 'readiness' && <ReadinessView {...{ live, capabilities, readiness, overallReadiness, selected, focusCapability, changeView }} />}
        {activeView === 'brief' && <BriefView {...{ live, act, validationScore, repositoryUrl: live.repoUrl, generatedFiles: generatedFiles.length ? generatedFiles : live.packageFiles, prototypeStatus, generatePrototype, buildNow, generationVersion, setTechnicalOpen, technicalOpen, changeView, role, setRole, setToast }} />}
        {activeView === 'pilot' && <BoardView openNode={truthNode} live={live} me={me} buildNow={buildNow} changeView={changeView} setToast={setToast}><ObservationComposer live={live} act={act} /><ObservationEffects live={live} /></BoardView>}
        {activeView === 'connections' && <ConnectionsView {...{ live, act, setToast, changeView }} />}

        {docOpen && <DocumentPanel live={live} docId={docOpen} onClose={() => setDocOpen('')} />}
        {traceOpen && (() => { const ev = live.evidence.find((e) => e.id === traceOpen); return ev ? <EvidenceTracePanel live={live} ev={ev} onClose={() => setTraceOpen('')} openDoc={(id) => { setTraceOpen(''); setDocOpen(id) }} changeView={changeView} /> : null })()}
        <PersonaPicker onPick={pickPersona} />
        {buildGuard && <div className="studio-card-overlay studio-guard-overlay" onClick={() => setBuildGuard(null)}>
          <div className="studio-guard" role="dialog" aria-label="Before you generate" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Before you generate</p>
            <h2>{buildGuard.gaps.some((g) => g.blocking) ? 'There isn’t enough to build yet.' : 'A few things would make this build better.'}</h2>
            <ul>{buildGuard.gaps.map((g) => <li key={g.text} className={g.blocking ? 'is-blocking' : ''}><span>{g.text}</span>{g.href ? <a className="text-button" href={g.href}>{g.cta} <ArrowRight size={12} /></a> : <button className="text-button" type="button" onClick={() => { setBuildGuard(null); changeView(g.view!) }}>{g.cta} <ArrowRight size={12} /></button>}</li>)}</ul>
            <div className="studio-guard-actions">
              {!buildGuard.gaps.some((g) => g.blocking) && <button className="button button-primary" type="button" onClick={() => buildNow({ ...buildGuard.opts, force: true })}><Play size={14} /> Generate anyway</button>}
              <button className="button button-quiet" type="button" onClick={() => setBuildGuard(null)}>Not now</button>
            </div>
          </div>
        </div>}
        {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
      </main>
    </div>
    </BacklogCtx.Provider>
  )
}

type Act = (fn: () => Promise<unknown>, ok?: string, opts?: { rethrow?: boolean }) => Promise<void>
type BuildOpts = { redesign?: boolean; fresh?: boolean; force?: boolean }
type BuildGap = { text: string; view?: StudioView; href?: string; cta: string; blocking?: boolean }

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
  curate: (id: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => void
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
          <p className="hero-lede">{item.name} is the product you’re shaping. Socra is holding the conversation. This is the current shape of the work — not a backlog pretending to be a strategy.</p>
          <div className="hero-actions"><button className="button button-primary" type="button" onClick={() => changeView('conversation')}>Continue with Socra <ArrowRight size={16} /></button><button className="button button-quiet" type="button" onClick={() => changeView('product')}><FileText size={16} /> Open living PRFAQ</button></div>
        </div>
        <div className="product-card">
          <div className="product-card-header"><span className="eyebrow">The product in one breath</span><button className="icon-button subtle" type="button" aria-label="More product actions" onClick={() => changeView('product')}><MoreHorizontal size={16} /></button></div>
          <div className="product-wordmark"><span className="wordmark-orbit" />{item.name}</div>
          <p>{item.statement || item.description}</p>
          <div className="product-card-meta"><span>{item.audience || 'Audience still being named'}</span><span className="meta-divider" /><span>Updated {ago(item.updatedAt)}</span></div>
          {(() => { const q = (item.customerQuote || 'The customer’s own words land here once Socra hears them.').replace(/[“”]/g, '').trim(); return <div className="quote-line" title={q}><span>“</span>{q.length > 90 ? `${q.slice(0, 88).replace(/\s+\S*$/, '')}…` : q}</div> })()}
        </div>
      </section>

      <section className="section-block readiness-section">
        <div className="section-heading"><div><p className="eyebrow">Floor → ceiling readiness</p><h2>Where the product can stand today</h2></div><button className="text-button" type="button" onClick={() => changeView('readiness')}>See the full ceiling <ArrowRight size={15} /></button></div>
        <div className="readiness-board">
          <div className="readiness-overview"><div className="readiness-ring" style={{ '--progress': `${overallReadiness * 3.6}deg` } as React.CSSProperties}><div><strong>{overallReadiness}%</strong><small>ready for a<br />thin-slice pilot</small></div></div><div className="readiness-note"><span className="signal-icon"><Sparkles size={15} /></span><p><strong>The honest read</strong>{selected.signal}</p><button type="button" onClick={() => focusCapability(selected)}>Work this conversation <ArrowRight size={13} /></button></div></div>
          <div className="capability-list">{caps.length === 0 && <div className="empty-column">Socra is laying the floor: the capabilities appear here in a moment.</div>}{caps.map((capability) => <CapabilityRow key={capability.id} capability={capability} readiness={currentReadiness[capability.id] ?? capability.readiness} onFocus={focusCapability} />)}</div>
        </div>
      </section>

      <section className="section-block workspace-section">
        <div className="section-heading"><div><p className="eyebrow">The active move</p><h2>What Socra is helping you see</h2></div><div className="section-heading-meta"><span className="agent-status"><span className="live-pulse" /> {live.agentBusy ? live.agentStatus || 'Socra is thinking' : 'Socra is listening'}</span><button className="text-button" type="button" onClick={() => changeView('conversation')}>Open conversation <ArrowRight size={15} /></button></div></div>
        <div className="workspace-grid">
          <div className="conversation-preview">
            <div className="conversation-preview-header"><div className="agent-avatar"><Waves size={17} /></div><div><strong>Socra · Product physician</strong><span>Guiding the {selected.label.toLowerCase()} conversation</span></div><span className="live-label">LIVE</span></div>
            <div className="mini-message muse-message"><span className="message-line" />{clipText(lastMuse?.text ?? `Socra is reading what you said about ${item.name} and laying out everything a product like it needs.`)}</div>
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

/** The live product, full width: click or circle what should change, say why, and it goes to Socra. */
function ReviewView({ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }: ReviewProps) {
  const marks = live.feedback.slice(0, 6)
  return <div className="page-wrap studio-review-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Vibe review</p><h1>Try it. Point at <em>what’s wrong.</em></h1><p>Use the product as a customer would. Press Annotate, click or circle the part you mean, and say what should change. Socra turns it into the next build.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => setAnnotationMode(!annotationMode)}><MousePointer2 size={16} /> {annotationMode ? 'Stop annotating' : 'Annotate'}</button><span>{live.feedback.length} {live.feedback.length === 1 ? 'mark' : 'marks'} so far</span></div></div><section className="section-block"><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} setAnnotationMode={setAnnotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} tall /><AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} /></section>{marks.length > 0 && <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Your marks</p><h2>What you asked to change</h2></div><button className="text-button" type="button" onClick={() => changeView('brief')}>Build the next version <ArrowRight size={15} /></button></div><div className="studio-list">{marks.map((f) => <div className="studio-list-row" key={f.id}><span className="studio-row-main"><strong>{f.comment}</strong><small>{f.target} · {ago(f.createdAt)}</small></span><span className="studio-review-chip">{f.status}</span><MarkChain mark={f} /></div>)}</div></section>}</div>
}

function CapabilityRow({ capability, readiness, onFocus }: { capability: Capability; readiness: number; onFocus: (capability: Capability) => void }) {
  return <button className="capability-row" type="button" onClick={() => onFocus(capability)}><span className="capability-color" style={{ background: capability.color }} /><span className="capability-copy"><strong>{capability.label}</strong><small>{capability.kicker}</small></span><span className="capability-track"><span style={{ width: `${readiness}%`, background: capability.color }} /></span><span className="capability-number" title="Must-haves the people agreed, out of everything in scope (counted, not guessed)">{readiness}% agreed</span><span className="capability-delta">{capability.delta}</span><ArrowDownRight size={15} className="capability-arrow" /></button>
}

function PreviewCard({ live, mode, setPreview, setToast, annotationMode = false, setAnnotationMode, onSelectTarget, annotationShape = 'object', onPick, tall = false, onAnnotate }: { onAnnotate?: () => void; live: Live; mode: 'home' | 'thread'; setPreview: (mode: 'home' | 'thread') => void; setToast: (value: string) => void; annotationMode?: boolean; setAnnotationMode?: (value: boolean) => void; onSelectTarget?: (value: string) => void; annotationShape?: AnnotationShape; onPick?: (p: Pick) => void; tall?: boolean }) {
  const held = live.backlog.filter((b) => b.kind === 'capture' && b.state !== 'suggested' && b.state !== 'probing').slice(-1)[0]
  const holdAs = (kind: BacklogItem['kind']) => {
    if (!held) return
    void api(`/api/use-cases/${live.id}/backlog/${held.id}`, { method: 'PATCH', json: { kind, group: kind === 'distraction' ? undefined : live.capabilities.find((c) => c.key === live.focus)?.label } })
      .then(() => setToast(kind === 'distraction' ? 'Parked without losing the thought' : 'Kept in the product shape'))
      .catch((e: Error) => setToast(e.message))
  }
  const open = previewUrl(live.preview.port, '/')
  return <div className={`preview-card ${tall ? 'is-tall' : ''}`}><div className="preview-header"><div><p className="eyebrow">Vibe → visible product</p><h3>What {live.name} feels like in the hand</h3>{open && <span className="studio-open-app-row"><a className="studio-open-app" href={`/use-cases/${live.id}/try`} target="_blank" rel="noopener noreferrer">Try it full screen and mark it up <MoveUpRight size={12} /></a><a className="studio-open-app is-quiet" href={open} target="_blank" rel="noopener noreferrer">{open.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></span>}</div><div className="preview-tools"><button className={`annotate-trigger ${annotationMode ? 'is-active' : ''}`} type="button" onClick={() => (setAnnotationMode ? setAnnotationMode(!annotationMode) : onAnnotate?.())}><MousePointer2 size={13} /> {annotationMode ? (annotationShape === 'circle' ? 'Drag a circle' : 'Click a surface') : 'Annotate'}</button><button className="icon-button subtle" type="button" onClick={() => (open ? window.open(`/use-cases/${live.id}/try`, '_blank', 'noopener') : setToast('The product opens full-screen once its first version runs'))} aria-label="Expand product preview"><Maximize2 size={15} /></button></div></div><div className="preview-tabs"><button className={mode === 'home' ? 'is-active' : ''} onClick={() => setPreview('home')} type="button">Entry moment</button><button className={mode === 'thread' ? 'is-active' : ''} onClick={() => setPreview('thread')} type="button">Held thought</button></div>{mode === 'home' ? <LiveFrame live={live} annotationMode={annotationMode} shape={annotationShape} tall={tall} onPick={(p) => { onSelectTarget?.(p.kind === 'region' ? 'Circled region' : 'Selected surface'); onPick?.(p) }} /> : <div className="product-preview-shell held-thread"><div className="preview-app-top"><span className="preview-kite">{live.name.toLowerCase()}.</span><span className="preview-preview-label">held thought</span><span className="preview-avatar">PO</span></div><div className="held-quote"><span>“</span><p>{held ? held.title : 'Nothing is waiting. Every thought you have had already has a home.'}</p><small>{held ? `captured ${ago(held.createdAt)} · Socra is listening` : 'capture one any time from the sidebar or your phone'}</small></div>{held && <div className="thread-actions"><button type="button" onClick={() => holdAs('epic')}>Keep with {live.name}</button><button type="button" onClick={() => holdAs('distraction')}>Let it wait</button></div>}</div>}</div>
}

type ConversationProps = { live: Live; act: Act; me: Me; replying: StudioMessage | null; setReplying: (m: StudioMessage | null) => void; voice: { listening: boolean; working: boolean; toggle: () => void }; onPick: (p: Pick) => void; selected: Capability; capabilities: Capability[]; messages: StudioMessage[]; draft: string; setDraft: (value: string) => void; sendMessage: (text?: string) => void; focusCapability: (capability: Capability) => void; previewMode: 'home' | 'thread'; setPreview: (mode: 'home' | 'thread') => void; toast: string; setToast: (value: string) => void; changeView: (view: StudioView) => void }

function ConversationView({ live, act, me, replying, setReplying, voice, onPick, selected, capabilities: caps, messages, draft, setDraft, sendMessage, focusCapability, previewMode, setPreview, setToast, changeView }: ConversationProps) {
  const options = optionsFrom(messages)
  return <div className="page-wrap conversation-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />The room is open</p><h1>Work with Socra.</h1><p>Talk in your own language. Socra will pull out the product truth, protect the nuance, and quietly turn agreement into forward motion.</p></div><div className="intro-aside"><span className="eyebrow">Current focus</span><strong>{selected.label}</strong><span>{selected.kicker}</span></div></div><div className="conversation-layout"><div className="conversation-main"><div className="conversation-stream"><ConversationStream messages={messages} scope={live.id} render={(message) => <MessageCard key={message.id} message={message} live={live} me={me} act={act} repliedTo={message.replyTo ? messages.find((m) => m.id === message.replyTo) : undefined} onReply={(m) => { setReplying(m); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input textarea')?.focus(), 50) }} replying={replying?.id === message.id} />} />{live.agentBusy && <article className="message-card muse is-thinking"><div className="message-meta"><span className="message-avatar muse"><Waves size={14} /></span><strong>Socra · Product physician</strong><span>now</span></div><p><span className="live-pulse" /> {live.agentStatus || 'Thinking it through…'}</p></article>}</div><Checkpoints live={live} me={me} act={act} /><div className="composer"><div className="composer-suggestions"><span className="eyebrow">{options.length ? 'Pick one, or several' : 'Try a direction'}</span><div>{options.map((o) => <button key={o.n} type="button" title={o.label} onClick={() => sendMessage(`${o.n}. ${o.label}`)}>{o.n}. {o.label.length > 46 ? `${o.label.slice(0, 46)}…` : o.label} <ArrowRight size={13} /></button>)}<button type="button" onClick={() => sendMessage('Yes, carry that forward.')}>Yes, carry that forward <ArrowRight size={13} /></button>{!options.length && <button type="button" onClick={() => sendMessage('The part I can’t explain yet is what should happen next. Ask me one question at a time.')}>I can’t explain the next part yet <ArrowRight size={13} /></button>}<button type="button" onClick={() => sendMessage('Help me think bigger: what else could this be, and what would make it ours alone?')}>Help me think bigger <ArrowRight size={13} /></button></div></div>{replying && <div className="studio-replying"><CornerDownRight size={13} /> <span>Replying to <strong>{replying.label.split(' · ')[0]}</strong>: “{replying.text.length > 140 ? `${replying.text.slice(0, 140)}…` : replying.text}”</span><button type="button" className="text-button" onClick={() => setReplying(null)}>Cancel</button></div>}<div className="composer-input"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder={voice.listening ? 'Listening… press the mic again when you’re done' : replying ? `Reply to ${replying.label.split(' · ')[0]}…` : 'Say what you’re seeing, wanting, or not sure about…'} rows={2} /><button className={`send-button studio-mic ${voice.listening ? 'is-listening' : ''}`} type="button" onClick={voice.toggle} disabled={voice.working} aria-pressed={voice.listening} aria-label={voice.listening ? 'Stop and send what you said' : 'Talk instead of typing'} title={voice.listening ? 'Stop and send' : 'Talk as long as you like; press again to stop'}><Mic size={16} /></button><button className="send-button" type="button" onClick={() => sendMessage()} aria-label={replying ? `Send your reply to ${replying.label.split(' · ')[0]}` : 'Send'}><Send size={17} /></button></div><div className="composer-foot"><span><Mic size={13} /> {voice.listening ? 'Listening until you press the mic again' : voice.working ? 'Turning what you said into text…' : 'You can also talk while you walk'}</span><span>Enter to send · Shift + Enter for a new line</span></div></div></div><aside className="conversation-aside"><TeamPanel live={live} /><ProgressView live={live} caps={caps} selected={selected} onFocus={focusCapability} /><PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} onPick={onPick} onAnnotate={() => changeView('review')} /><button className="button button-quiet full-width" type="button" onClick={() => changeView('review')}><MousePointer2 size={15} /> Try it and mark it up</button></aside></div></div>
}

/** Stored documents a message names by file name, each one a chip that opens it. */
function MentionedDocuments({ live, text }: { live: Live; text: string }) {
  const lower = text.toLowerCase()
  const docs = (live.documents ?? []).filter((d) => /\.[a-z0-9]{2,5}$/i.test(d.fileName) && lower.includes(d.fileName.toLowerCase()))
  const seen = new Set<string>()
  const shown = docs.filter((d) => (seen.has(d.fileName) ? false : (seen.add(d.fileName), true)))
  if (!shown.length) return null
  return <div className="studio-trace-links studio-message-docs">{shown.map((d) => <button type="button" key={d.id} onClick={() => window.dispatchEvent(new CustomEvent('studio-open-doc', { detail: d.id }))}><FileText size={12} /> {d.fileName} <ArrowRight size={11} /></button>)}</div>
}

function MessageCard({ message, live, me, act, repliedTo, onReply, replying }: { message: StudioMessage; live: Live; me: Me; act: Act; repliedTo?: StudioMessage; onReply?: (m: StudioMessage) => void; replying?: boolean }) {
  const canReply = !!onReply && message.role === 'muse' && !message.id.startsWith('user-') && message.label !== 'Claude Code'
  const specialist = !!message.specialist
  const userBadge = message.author && message.label !== 'You' ? initials(message.author) : message.authorRole ? roleShort(message.authorRole) : 'PO'
  return <article className={`message-card ${message.role}${specialist ? ' studio-specialist' : ''}${replying ? ' is-replying' : ''}`}>{repliedTo && <p className="studio-reply-to"><CornerDownRight size={12} /> Reply to {repliedTo.label.split(' · ')[0]}: “{repliedTo.text.length > 120 ? `${repliedTo.text.slice(0, 120)}…` : repliedTo.text}”</p>}<div className="message-meta">{message.role === 'muse' && !specialist && <span className="message-avatar muse">{message.label === 'Claude Code' ? <Code2 size={14} /> : <Waves size={14} />}</span>}{specialist && <span className="message-avatar signal">{specialistIcon(message.specialist)}</span>}{message.role === 'signal' && <span className="message-avatar signal"><Sparkles size={14} /></span>}{message.role === 'user' && <span className="message-avatar user">{userBadge}</span>}<strong>{message.label}</strong><span>{message.time}{message.addressed ? ` · to the ${message.addressed === 'business-analyst' ? 'business analyst' : message.addressed === 'ux' ? 'UX/UI designer' : message.addressed === 'domain' ? 'domain expert' : message.addressed}` : ''}{message.raw ? ' · spoken' : ''}</span>{message.role === 'signal' && message.label === 'Decision captured' && <span className="decision-chip"><Check size={12} /> added to product truth</span>}{message.role === 'signal' && message.label === 'Decision captured' && message.ref && <UndoChip live={live} decisionId={message.ref} me={me} act={act} />}</div><div className="studio-message-text"><Rich text={message.text} lines={message.role === 'user' ? 0 : 12} /></div><MentionedDocuments live={live} text={message.text} />{canReply && <button type="button" className="studio-reply-button" onClick={() => onReply!(message)}><MessageSquareReply size={13} /> Reply to {message.label.split(' · ')[0]}</button>}{message.ref?.startsWith('ann:') && <a className="studio-markup-thumb" href={`/api/feedback/${message.ref.slice(4)}/image`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${message.ref.slice(4)}/image`} alt="The marked-up screen" loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} /></a>}</article>
}

type ProductProps = { live: Live; act: Act; me: Me; selected: Capability; capabilities: Capability[]; backlog: BacklogItem[]; visibleBacklog: BacklogItem[]; showAllBacklog: boolean; setShowAllBacklog: (value: boolean) => void; curate: (id: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => void; capture: string; setCapture: (value: string) => void; captureIdea: () => void; approvalCount: number; changeView: (view: StudioView) => void; toast: string; setToast: (value: string) => void }

function ProductView({ live, act, me, selected, capabilities: caps, backlog, visibleBacklog, showAllBacklog, setShowAllBacklog, curate, capture, setCapture, captureIdea, approvalCount, changeView, setToast }: ProductProps) {
  const [editing, setEditing] = useState(false)
  // Count what this card lists, so the number matches the red rows below; Socra's suggestions wait on the Board.
  const waitingBacklog = live.backlog.filter((b) => needsTriage(b) && b.state !== 'suggested' && b.state !== 'probing').length
  const waitingOnBoard = live.backlog.filter((b) => needsTriage(b)).length - waitingBacklog
  const [prfaqDraft, setPrfaqDraft] = useState(live.prfaq)
  const { info: prfaqInfo, reload: reloadPrfaq } = usePrfaqInfo(live)
  const askPrfaq = useAskPrfaq(live, me, setToast)
  const nextStep = journeyOf(live).next
  const by = me.name || me.role
  const prfaqSave = useSaveState()
  // The editor stays open until the server confirms, so a failure shows "Not saved" and keeps the text.
  const savePrfaq = async () => { if (await prfaqSave.run(() => act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { prfaq: prfaqDraft, by } }), 'PRFAQ saved in your words — Socra will carry it into the spec', { rethrow: true }))) setEditing(false) }
  // Any one field of the story, saved to the product's own record (logged with who, handed to Socra).
  const saveField = (field: 'statement' | 'description' | 'audience' | 'customerQuote', label: string) => (next: string) => act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { [field]: next, by } }), `${label} saved in your words — Socra will carry it through`, { rethrow: true })
  const saveDecision = (id: string) => (next: string) => act(() => api(`/api/use-cases/${live.id}/decisions/${id}`, { method: 'PATCH', json: { text: next, by } }), 'Decision updated in your words — Socra is checking what it touches', { rethrow: true })
  const waiting = backlog.filter((b) => b.kind === 'capture').length
  // Newest first (Doug, Nov 21).
  const decisions = live.decisions.slice(-8).reverse()
  void caps
  return <div className="page-wrap product-page"><div className="page-intro"><div><p className="eyebrow">The living product shape</p><h1>Keep the dream visible<br />as it becomes specific.</h1><p>The PRFAQ is not a document at the end of the process. It is the shared surface where the original voice, approved decisions, and open questions can sit together.</p></div><div className="intro-actions"><button className="button button-primary" type="button" title={nextStep ? nextStep.why : 'Opens the conversation with Socra'} onClick={() => changeView(nextStep ? nextStep.view : 'conversation')}>{nextStep ? nextStep.cta : 'Continue with Socra'} <ArrowRight size={16} /></button>{nextStep && <span>Next: {nextStep.label}</span>}{approvalCount > 0 && <button className="text-button" type="button" title="They go into the PRD, the TRD and the build" onClick={() => document.getElementById('prfaq-decisions')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{approvalCount} {approvalCount === 1 ? 'decision' : 'decisions'} you approved go into the PRD and the build · see them</button>}</div></div><div className="product-shape-grid"><section className="prfaq-card"><div className="prfaq-toolbar"><div className="doc-title"><span className="doc-icon"><FileText size={16} /></span><span><strong>PRFAQ / {live.slug}-v0.{live.packageCount}</strong><small>living · last touched {ago(live.prfaqUpdatedAt ?? live.updatedAt)}</small></span></div><div className="toolbar-actions"><span className="locked-chip"><Check size={12} /> working truth</span>{editing ? <><SaveButton state={prfaqSave.state} label="Save" onClick={() => void savePrfaq()} /><button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)}>Cancel</button></> : <EditButton label={live.prfaq ? 'Edit the PRFAQ' : 'Write the PRFAQ'} title="Edit the press release and FAQ in your own words" onClick={() => { setPrfaqDraft(live.prfaq); setEditing(true) }} />}</div></div>{!editing && <PrfaqPanel live={live} me={me} info={prfaqInfo} reload={reloadPrfaq} setToast={setToast} />}<div className="prfaq-content"><EditableText value={live.audience} onSave={saveField('audience', 'Who it is for')} label="Edit" inline placeholder="Who is this for?"><div className="doc-kicker">{live.audience ? `FOR ${live.audience.toUpperCase()}` : 'FOR THE CUSTOMER THE MUSE IS STILL NAMING'}</div></EditableText><EditableText value={live.statement || ''} onSave={saveField('statement', 'Headline')} label="Edit headline" multiline rows={2} placeholder="The headline: what the customer gets"><h2>{live.statement || live.name}</h2></EditableText><EditableText value={live.description} onSave={saveField('description', 'Description')} label="Edit" multiline rows={5} placeholder="The lede: a few sentences on the product"><p className="doc-lede">{live.description || <span className="studio-muted">No description yet.</span>}</p></EditableText><div className="doc-divider" />{editing ? <><textarea className="spec-editor" value={prfaqDraft} autoFocus onChange={(event) => setPrfaqDraft(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); savePrfaq() } if (e.key === 'Escape') setEditing(false) }} rows={26} placeholder={'## Press release\n\nWrite the story in your own words…\n\n## FAQ\n\n**Q:** …\n**A:** …'} /><div className="studio-edit-actions"><SaveButton state={prfaqSave.state} label="Save" onClick={() => void savePrfaq()} /><button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)}>Cancel</button><small className="studio-muted">Markdown works: ## for a heading, **bold**, - for a list · Ctrl or ⌘ + Enter saves</small></div></> : live.prfaq ? <><PrfaqDoc live={live} info={prfaqInfo} ask={(gap) => void askPrfaq(gap)} /><PrfaqQuestions live={live} me={me} setToast={setToast} /></> : <div className="doc-section"><div className="doc-section-label"><span>01</span><strong>Why customers care</strong></div><div><p>Socra writes the press release and FAQ from your conversation. It appears here as soon as there is enough to say honestly.</p><EditableText value={live.customerQuote} onSave={saveField('customerQuote', 'Customer quote')} label={live.customerQuote ? 'Edit quote' : 'Add a customer quote'} multiline rows={3}>{live.customerQuote ? <div className="quote-callout"><span>“</span><p>{live.customerQuote.replace(/[“”]/g, '')}</p></div> : null}</EditableText></div></div>}<div className="doc-section" id="prfaq-decisions"><div className="doc-section-label"><span>{live.prfaq ? '··' : '02'}</span><strong>Decisions captured</strong></div><div className="decision-list">{decisions.length === 0 && <div className="open-question"><CircleHelp size={14} /><span>No decisions yet. A plain “yes” to Socra carries its proposal forward.</span><small>open with Socra</small></div>}{decisions.map((d) => <div key={d.id} className={d.status === 'approved' ? '' : 'open-question'}>{d.status === 'approved' ? <Check size={14} /> : <CircleHelp size={14} />}<EditableText value={d.text} onSave={saveDecision(d.id)} label="Edit" multiline rows={3} inline className="studio-decision-edit"><span>{d.text}</span></EditableText><small>{d.status === 'approved' ? 'approved' : d.status === 'assumed' ? 'assumed · say no to change it' : 'open with Socra'} · {ago(d.createdAt)}</small></div>)}</div></div></div></section><aside className="product-shape-aside"><div className="shape-summary"><div className="aside-block-header"><span className="eyebrow">Shape signal</span><Sparkles size={15} /></div><strong>{waiting ? `${waiting} ${waiting === 1 ? 'thought is' : 'thoughts are'} waiting to find a home.` : 'Every thought you have had has a home.'}</strong><p>{selected.signal}</p><button className="button button-small" type="button" onClick={() => changeView('conversation')}>Ask Socra <ArrowRight size={14} /></button></div><div className={`curation-card ${waitingBacklog ? 'studio-needs-card' : ''}`}><div className="curation-header"><div><p className={`eyebrow ${waitingBacklog > 0 ? 'studio-needs-label' : ''}`}>{waitingBacklog > 0 && <span className="studio-red-dot" />} Curated backlog{waitingBacklog > 0 && <span className="studio-needs-you">{waitingBacklog}</span>}</p><h3>{backlog.length} signals, held gently</h3>{waitingBacklog > 0 && <p className="studio-needs-line">{waitingBacklog} {waitingBacklog === 1 ? 'is' : 'are'} waiting on you: pick {waitingBacklog === 1 ? 'it' : 'one'} to work on it.</p>}{waitingOnBoard > 0 && <p className="studio-needs-line"><button className="text-button" type="button" onClick={() => changeView('pilot')}>{waitingOnBoard} {waitingOnBoard === 1 ? 'suggestion' : 'suggestions'} from {ASSISTANT_NAME} {waitingOnBoard === 1 ? 'waits' : 'wait'} on the Board <ArrowRight size={13} /></button></p>}</div><Filter size={15} /></div><BacklogList items={visibleBacklog} curate={curate} /><button className="text-button center-button" type="button" onClick={() => setShowAllBacklog(!showAllBacklog)}>{showAllBacklog ? 'Show fewer signals' : 'See every signal'} <ArrowRight size={14} /></button></div><div className="capture-card"><div><span className="capture-orb"><Mic size={15} /></span><div><strong>Catch the next thought</strong><small>It does not need to be useful yet.</small></div></div><div className="capture-input"><input id="ambient-capture" value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') captureIdea() }} placeholder="I keep thinking about…" /><button type="button" onClick={captureIdea} aria-label="Add thought"><Plus size={16} /></button></div></div></aside></div></div>
}

function BacklogPanel({ capture, setCapture, captureIdea, visibleBacklog, showAllBacklog, setShowAllBacklog, curate }: { capture: string; setCapture: (value: string) => void; captureIdea: () => void; visibleBacklog: BacklogItem[]; showAllBacklog: boolean; setShowAllBacklog: (value: boolean) => void; curate: (id: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => void }) {
  return <div className="backlog-panel"><div className="backlog-capture"><span className="capture-orb"><Mic size={15} /></span><div className="capture-copy"><strong>Catch the thought before it becomes a task</strong><small>Phone, voice, or a half-sentence is enough.</small></div><div className="capture-input"><input id="ambient-capture" value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') captureIdea() }} placeholder="I keep thinking about…" /><button type="button" onClick={captureIdea} aria-label="Add ambient thought"><Plus size={16} /></button></div></div><div className="backlog-list"><BacklogList items={visibleBacklog} curate={curate} /></div><button className="backlog-more" type="button" onClick={() => setShowAllBacklog(!showAllBacklog)}>{showAllBacklog ? 'Show fewer signals' : `See all ${visibleBacklog.length < 4 ? 'signals' : 'captured thoughts'}`} <ArrowRight size={14} /></button></div>
}

function BacklogList({ items, curate }: { items: BacklogItem[]; curate: (id: string, kind: BacklogItem['kind'] | 'edit' | 'withdraw') => void }) {
  const ctx = useContext(BacklogCtx)
  const [detail, setDetail] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [deferring, setDeferring] = useState(false)
  const [until, setUntil] = useState(() => inDays(14))
  type Extra = { needsYou?: boolean; triage?: string; onBoard?: string }
  // What waits on a person comes first, marked red.
  const ordered = [...items].sort((a, b) => Number(!!(b as Extra).needsYou) - Number(!!(a as Extra).needsYou))
  const BOARD_NAME: Record<string, string> = { queued: 'Backlog', ready: 'Ready to shape', building: 'Being made real', review: 'Human review', done: 'Done' }
  return <div className="backlog-items">{ordered.map((item) => { const x = item as BacklogItem & Extra; return <div className={`backlog-item ${x.needsYou ? 'studio-needs-item' : ''} ${deferredUntil(x) ? 'studio-deferred-item' : ''}`} key={item.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a')) { setConfirm(false); setDetail(item.id) } }}><div className={`backlog-kind ${item.kind}`}><span>{item.kind === 'capture' ? <Lightbulb size={14} /> : item.kind === 'epic' ? <Layers3 size={14} /> : <Timer size={14} />}</span></div><div className="backlog-item-copy"><div><strong>{x.needsYou && <span className="studio-red-dot" title="Waiting on you" />} {item.title}</strong><span className="backlog-age">{item.age}</span></div><p>{item.note}</p>{(() => { const d = deferredUntil(x); return d ? <small className="studio-deferred-note">Deferred · {d.getFullYear() > 9000 ? 'no date' : `back ${dayLabel(d)}`}</small> : null })()}{(item as BacklogItem & { annotationId?: string }).annotationId && <a className="studio-markup-thumb" href={`/api/feedback/${(item as BacklogItem & { annotationId?: string }).annotationId}/image`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${(item as BacklogItem & { annotationId?: string }).annotationId}/image`} alt="The marked-up screen" loading="lazy" /></a>}{x.onBoard && <button type="button" className="studio-on-board" onClick={() => ctx?.openBoard()}>On the Board · {BOARD_NAME[x.onBoard] ?? x.onBoard} <ArrowRight size={12} /></button>}<button type="button" className="studio-open-detail" onClick={() => { setConfirm(false); setDetail(item.id) }}>Open details</button><div className="backlog-tags"><span>{(item as BacklogItem & { ownerState?: string }).ownerState ?? kindLabels[item.kind]}</span><span>{item.group}</span><span>{item.source}</span></div></div></div> })}{(() => { const it = items.find((i) => i.id === detail); if (!it || !ctx) return null; const x = it as BacklogItem & Extra & { annotationId?: string; ownerState?: string }; const open = !x.onBoard && x.triage !== 'rejected'; const close = () => { setDetail(''); setConfirm(false); setDeferring(false) }
    return <div className="studio-card-overlay" onClick={(e) => { if (e.detail < 2) close() }}><aside className="studio-card-panel" onClick={(e) => e.stopPropagation()} aria-label="Backlog item details">
      <div className="studio-card-head"><p className="eyebrow">Backlog item</p><button className="icon-button subtle" type="button" onClick={close} aria-label="Close"><X size={16} /></button></div>
      <h3>{x.needsYou && <span className="studio-red-dot" title="Waiting on you" />} {it.title}</h3>
      <p>{it.note || 'No more detail yet.'}</p>
      <div className="backlog-tags"><span>{x.ownerState ?? kindLabels[it.kind]}</span><span>{it.group}</span><span>{it.source}</span><span>{it.age}</span></div>
      {x.annotationId && <a className="studio-markup-thumb" href={`/api/feedback/${x.annotationId}/image`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${x.annotationId}/image`} alt="The marked-up screen" loading="lazy" /></a>}
      {x.onBoard && <button type="button" className="studio-on-board" onClick={() => { close(); ctx.openBoard() }}>On the Board · {BOARD_NAME[x.onBoard] ?? x.onBoard} <ArrowRight size={12} /></button>}
      <div className="studio-detail-more"><button type="button" className="text-button" onClick={() => { close(); curate(it.id, 'epic') }}><Layers3 size={13} /> Group as a capability</button><button type="button" className="text-button" onClick={() => { close(); curate(it.id, 'edit') }}><PenLine size={13} /> Change the wording</button></div>
      {x.triage === 'rejected' && <p><small>Rejected. Kept in history.</small></p>}
      {x.triage === 'deferred' && (() => { const d = deferredUntil(x); return <p><small>{d ? (d.getFullYear() > 9000 ? 'Deferred, no date set.' : `Deferred until ${dayLabel(d)}. It turns red again that day.`) : 'Back from deferral: it needs you again.'}</small></p> })()}
      {deferring && <DeferAsk until={until} setUntil={setUntil} busy={false} onDefer={() => { close(); ctx.decide(it.id, 'deferred', until) }} onCancel={() => setDeferring(false)} />}
      {open && !confirm && !deferring && <div className="studio-detail-actions"><button type="button" className="button button-primary" onClick={() => setConfirm(true)}>Accept</button><button type="button" className="button button-quiet" onClick={() => { setUntil(inDays(14)); setDeferring(true) }}>{x.triage === 'deferred' ? 'Change the date' : 'Defer'}</button><button type="button" className="button button-quiet" onClick={() => { close(); ctx.decide(it.id, 'rejected') }}>Reject</button></div>}
      {open && confirm && <div className="studio-work-ask" role="group" aria-label="Work on this now?"><strong>Work on this now?</strong><small>Yes puts it in Ready to shape on the Board and {ASSISTANT_NAME} starts shaping it. No just adds it to the Board&apos;s Backlog.</small><span><button type="button" className="button button-primary button-small" onClick={() => { close(); ctx.workOn(it.id) }}>Yes, work on it now</button><button type="button" className="button button-quiet button-small" onClick={() => { close(); ctx.decide(it.id, 'accepted') }}>Not yet, add to Backlog</button></span></div>}
      <ItemRecord live={ctx.live} me={ctx.me} node={`backlog:${it.id}`} setToast={ctx.setToast} />
    </aside></div> })()}</div>
}

type ReadinessProps = { live: Live; capabilities: Capability[]; readiness: Record<string, number>; overallReadiness: number; selected: Capability; focusCapability: (capability: Capability) => void; changeView: (view: ViewId) => void }

type LiveSpecSection = ReturnType<typeof toSpec>[number]
type SpecViewProps = {
  live: Live
  act: Act
  reload: () => Promise<void>
  changeView: (view: StudioView, node?: string) => void
  setToast: (value: string) => void
  specSections: LiveSpecSection[]
  messages: ConversationMessage[]
  evidence: EvidenceItem[]
  backlog: BacklogItem[]
  execution: ExecutionItem[]
  initialTab?: 'prd' | 'trd'
  focusKey?: string
  openDoc: (id: string) => void
  openTrace: (id: string) => void
  me?: Me
}

function SpecView({ live, act, changeView, setToast, specSections, initialTab = 'prd', focusKey = '', openTrace, me }: SpecViewProps) {
  const by = me ? me.name || me.role : ''
  const whyChanged = (node: string) => changeView('truth', node)
  // The PRD and the TRD are separate screens (Doug, Nov 21): each shows only its own sections.
  const tab = initialTab
  const focused = specSections.find((x) => x.tab === initialTab && (x.key === focusKey || x.ref === focusKey))
  const [selectedId, setSelectedId] = useState(focused?.id ?? specSections.find((x) => x.tab === initialTab)?.id ?? specSections[0]?.id ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(focused?.content ?? specSections[0]?.content ?? '')
  const [reviewMode, setReviewMode] = useState(false)
  const revisionSave = useSaveState()
  const sections = specSections.filter((section) => section.tab === tab)
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0]
  const tabPercent = (t: 'prd' | 'trd') => { const s = specSections.filter((section) => section.tab === t && section.review !== 'remove'); return s.length ? Math.round(s.reduce((sum, section) => sum + section.completeness, 0) / s.length) : 0 }
  const progress = tabPercent(tab)
  const chooseSection = (section: LiveSpecSection) => {
    setSelectedId(section.id)
    setDraft(section.content)
    setEditing(false)
  }
  const focusSection = (key: string) => { const s = sections.find((x) => x.key === key); if (s) chooseSection(s) }
  const probe = () => void act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { probe: true, by } }), `${ASSISTANT_NAME} is sending the right specialist to ask about ${selected.title}`).then(() => changeView('conversation'))
  if (!selected) return <div className="page-wrap spec-page"><div className="empty-column">The living specification is being laid out. One moment.</div></div>
  const review = (choice: 'keep' | 'revise' | 'challenge' | 'remove' | '', note = '') =>
    act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { review: choice, note } }), choice === 'keep' ? `${selected.title} accepted into the living ${tab.toUpperCase()} — its provenance stays attached` : choice === 'remove' ? `${selected.title} removed — its evidence and conversation are kept` : choice ? `${selected.title} sent back to Socra to ${choice}` : `${selected.title} back in play`)
  const acceptInference = () => { setEditing(false); void review('keep'); if (reviewMode) nextOpen() }
  const saveRevision = async () => {
    if (await revisionSave.run(() => act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { content: draft, by } }), `${selected.title} saved in your words — Socra is carrying it into what it touches`, { rethrow: true }))) setEditing(false)
  }
  const setStatus = (status: string) => void act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { status, by } }), `${selected.title} is now ${status.replace(/-/g, ' ')}`)
  const nextOpen = () => {
    const queue = sections.filter((s) => !s.review && s.basis !== 'confirmed')
    const i = queue.findIndex((s) => s.id === selected.id)
    const n = queue[(i + 1) % Math.max(1, queue.length)] ?? sections[(sections.indexOf(selected) + 1) % sections.length]
    if (n) chooseSection(n)
  }
  // A provenance step opens the record it names when one matches; otherwise the screen where that kind of record lives.
  const traceAction = (step: { type: string; detail: string }) => {
    const d = (step.detail ?? '').toLowerCase().replace(/…$/, '').trim()
    const near = (t: string) => { const x = (t ?? '').toLowerCase(); return !!d && !!x && (x === d || (d.length > 12 && (x.includes(d) || d.includes(x.slice(0, 60))))) }
    if (step.type === 'evidence') {
      const e = live.evidence.find((x) => d.includes(x.id) || near(x.insight) || near(x.source))
      if (e) return openTrace(e.id)
      return changeView('evidence')
    }
    if (step.type === 'conversation') {
      const m = live.messages.find((x) => x.role === 'user' && near(x.content))
      return m ? changeView('truth', `graph:msg:${m.id}`) : changeView('conversation')
    }
    if (step.type === 'backlog') {
      const b = live.backlog.find((x) => near(x.title))
      return b ? changeView('truth', `graph:backlog:${b.id}`) : changeView('product')
    }
    if (step.type === 'annotation') {
      const f = live.feedback.find((x) => near(x.comment))
      return f ? changeView('truth', `graph:ann:${f.id}`) : changeView('review')
    }
    if (step.type === 'execution') return changeView('pilot')
    return changeView('truth', `graph:spec:${selected.key}`)
  }
  // A related record's chip says what it is (its title), not its database id.
  const relatedLabel = (id: string) => {
    const clip = (t: string) => (t.length > 48 ? `${t.slice(0, 47)}…` : t)
    const e = live.evidence.find((x) => x.id === id); if (e) return `Evidence · ${clip(e.insight)}`
    const d = live.decisions.find((x) => x.id === id); if (d) return `Decision · ${clip(d.text)}`
    const b = live.backlog.find((x) => x.id === id); if (b) return `Backlog · ${clip(b.title)}`
    const m = live.moves.find((x) => x.id === id); if (m) return `Card · ${clip(m.title)}`
    return id
  }
  // A related record opens: another section here, an evidence trace, or the record in the truth graph.
  const openRelated = (id: string) => {
    const s = specSections.find((x) => x.ref === id || x.key === id)
    if (s) { if (s.tab !== tab) { changeView(s.tab === 'prd' ? 'spec' : 'trd', s.key); return } chooseSection(s); return }
    if (live.evidence.some((e) => e.id === id)) return openTrace(id)
    const kind = live.decisions.some((x) => x.id === id) ? 'decision' : live.backlog.some((x) => x.id === id) ? 'backlog' : live.moves.some((x) => x.id === id) ? 'move' : live.feedback.some((x) => x.id === id) ? 'ann' : ''
    changeView('truth', kind ? `graph:${kind}:${id}` : `graph:spec:${selected.key}`)
  }
  return <div className="page-wrap spec-page">
    <div className="page-intro spec-intro"><div>{tab === 'prd' ? <><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Step 3 · Product requirements (PRD)</p><h1>Define what the product<br /><em>must do.</em></h1><p>Who it is for, how many of them, a day in their life, what it must do and how you will know it worked. The business analyst asks; your answers become the PRD, and every inference stays visible and reversible.</p></> : <><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Step 4 · Technical design (TRD)</p><h1>Work out how it<br /><em>will be built.</em></h1><p>The product engineer and the solution architect ask how the work really happens: who decides what, what runs on its own, which systems it talks to and when. From your answers they infer the architecture.</p></>}</div><div className="spec-intro-side"><div className="spec-progress"><span className="eyebrow">{tab === 'prd' ? 'PRD' : 'TRD'} completeness</span><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{sections.filter((section) => section.status !== 'draft').length} of {sections.length} sections have a shaped signal</small></div>{tab === 'prd' ? <button className="button button-primary" type="button" onClick={() => changeView('trd')}>Next: technical design <ArrowRight size={15} /></button> : <button className="button button-primary" type="button" onClick={() => changeView('brief')}><Play size={15} /> Build the prototype</button>}</div></div>
    {me && <SpecGuide live={live} me={me} tab={tab} setToast={setToast} onFocus={focusSection} />}
    <div className="spec-layout"><aside className="spec-rail"><div className="rail-heading"><div><span className="eyebrow">{tab.toUpperCase()} sections</span><h3>Working outline</h3></div><ListFilter size={15} /></div>{sections.map((section) => <button className={`spec-section-item ${selected.id === section.id ? 'is-active' : ''} ${section.review === 'remove' ? 'is-removed' : ''}`} key={section.id} type="button" onClick={() => chooseSection(section)}><span className={`spec-signal ${section.status} ${section.confidence}`} /><span className="spec-section-copy"><strong>{section.title}</strong><small>{section.ref} · {section.kicker}</small></span><span className="spec-section-percent">{section.completeness}%</span></button>)}<div className="spec-rail-note"><Sparkles size={14} /><p><strong>Inference is visible.</strong> Nothing becomes “confirmed” just because Socra suggested it.</p></div></aside><section className="spec-document"><div className="spec-doc-header"><div><p className="eyebrow">{selected.ref} · {selected.kicker}</p><h2>{selected.title}</h2></div><div className="spec-doc-actions"><span className={`spec-status ${selected.status}`}>{selected.status}</span><span className={`confidence ${selected.confidence}`}>{selected.confidence} confidence</span></div></div><div className="spec-content-card"><div className="spec-content-meta"><span><Timer size={13} /> Updated from {selected.source} · {ago(selected.updatedAt)}</span><span>{selected.completeness}% complete</span></div>{editing ? <textarea className="spec-editor" value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveRevision() } if (e.key === 'Escape') setEditing(false) }} rows={16} /> : <div className="spec-body-copy">{selected.content ? <StudioMarkdown text={selected.content} /> : <p>Not yet researched. Ask Socra to probe, or write it in your own words.</p>}</div>}<div className="spec-action-row">{editing ? <><SaveButton state={revisionSave.state} label="Save" onClick={() => void saveRevision()} /><button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)}>Cancel</button><small className="studio-muted">Markdown works · Ctrl or ⌘ + Enter saves · kept with your name</small></> : <><button className="button button-primary button-small" type="button" onClick={acceptInference}><Check size={13} /> Accept inference</button><button className="button button-quiet button-small studio-edit-button" type="button" onClick={() => { setDraft(selected.content); setEditing(true) }}><Pencil size={13} /> Edit</button><button className="button button-quiet button-small" type="button" onClick={() => void review('challenge', 'Challenged in review')} title="Ask Socra what this rests on"><CircleHelp size={13} /> Challenge</button>{selected.review === 'remove' ? <button className="button button-quiet button-small" type="button" onClick={() => void review('')}>Bring it back</button> : <button className="button button-quiet button-small" type="button" onClick={() => void review('remove', 'Removed in review')}><X size={13} /> Remove</button>}<button className="text-button" type="button" onClick={() => whyChanged(`spec:${selected.key}`)} title="Every change to this section and what caused it"><History size={13} /> Why did this change?</button><SpecDocUpload live={live} section={selected.key} label="Add a document" setToast={setToast} /><button className="text-button" type="button" onClick={probe} title="A specialist asks you the questions that would make this section stronger">Ask {ASSISTANT_NAME} to probe <ArrowRight size={13} /></button></>}</div></div><SpecReviewTools section={selected} onStatus={setStatus} reviewMode={reviewMode} setReviewMode={setReviewMode} onNext={nextOpen} /><div className="spec-related-row"><span className="eyebrow">Related records</span>{selected.related.length ? selected.related.map((id) => <button type="button" className="related-chip" key={id} onClick={() => openRelated(id)}><Target size={11} /> {relatedLabel(id)}</button>) : <span className="empty-related">No linked record yet — that is a gap worth probing.</span>}</div><div className="spec-gap-card"><div><span className="eyebrow">What would make this stronger?</span><strong>{selected.confidence === 'open' ? 'This section is marked open: it needs a person’s decision or new evidence.' : `${selected.completeness}% complete, ${selected.confidence} confidence, ${selected.trace.length} recorded ${selected.trace.length === 1 ? 'step' : 'steps'}.`}</strong></div><button className="button button-quiet button-small" type="button" onClick={() => changeView(selected.confidence === 'open' ? 'conversation' : 'validation')}>{selected.confidence === 'open' ? 'Open the question' : 'Review validation'} <ArrowRight size={13} /></button></div></section><aside className="trace-rail"><div className="rail-heading"><div><span className="eyebrow">Provenance rail</span><h3>How this got here</h3></div><Network size={15} /></div><p className="trace-intro">Each step below is a real record: what was said, found or decided about this section.</p><div className="trace-list">{selected.trace.length === 0 && <p className="trace-intro">No trace yet: nothing has been said or found about this section.</p>}{selected.trace.map((step, index) => <button className="trace-step" key={`${selected.id}-${index}`} type="button" onClick={() => traceAction(step)}><span className={`trace-dot ${step.type}`}><span /></span><span className="trace-step-copy"><small>{index + 1} · {step.label}</small><strong>{step.detail}</strong></span><ArrowRight size={13} /></button>)}</div><div className="trace-footer"><CircleHelp size={14} /><span><strong>Open loop</strong>{(() => { const open = live.decisions.filter((d) => d.status === 'open' && selected.related.includes(d.id)).length; return open ? ` ${open} open ${open === 1 ? 'decision is' : 'decisions are'} linked to this section.` : ` No open decision is linked to this section; it is ${selected.completeness}% complete.` })()}</span></div></aside></div>
    <ImpactPanel live={live} sectionKey={selected.key} />
    <VersionHistory live={live} act={act} />
  </div>
}

function ReadinessView({ live, capabilities: caps, readiness, overallReadiness, selected, focusCapability, changeView }: ReadinessProps) {
  return <div className="page-wrap readiness-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Readiness is a conversation</p><h1>Find the ceiling,<br />not a false finish line.</h1><p>A capability is ready when the product can make a promise and keep it. The percentages are signals for where to look next — not grades for the team.</p></div><div className="readiness-hero-score"><div className="eyebrow">Current honest read</div><strong>{overallReadiness}%</strong><span>ready for a thin-slice pilot</span></div></div><div className="readiness-detail-grid"><section className="ceiling-card"><div className="ceiling-header"><div><p className="eyebrow">Capability ceiling</p><h2>What still needs to become true</h2></div><span className="ceiling-legend"><span className="legend-dot ready" />ready <span className="legend-dot open" />needs conversation</span></div><div className="ceiling-list">{caps.map((capability) => <div className="ceiling-row" key={capability.id}><div className="ceiling-row-title"><span className="capability-color" style={{ background: capability.color }} /><div><strong>{capability.label}</strong><small>{capability.kicker}</small></div><strong className="ceiling-number">{readiness[capability.id] ?? capability.readiness}%</strong></div><div className="ceiling-track"><span style={{ width: `${readiness[capability.id] ?? capability.readiness}%`, background: capability.color }} /><i style={{ left: `${readiness[capability.id] ?? capability.readiness}%` }} /></div><p>{capability.description}</p><div className="ceiling-row-footer"><span><MoveUpRight size={13} /> {capability.delta}</span><button type="button" onClick={() => focusCapability(capability)}>Work the edge <ArrowRight size={13} /></button></div></div>)}</div></section><aside className="readiness-aside"><div className="ceiling-callout"><span className="signal-icon"><Flame size={16} /></span><p><strong>The next honest move</strong>{(() => { const weakest = [...caps].sort((a, b) => (readiness[a.id] ?? a.readiness) - (readiness[b.id] ?? b.readiness))[0]; return weakest ? `${weakest.label} is the least ready capability (${readiness[weakest.id] ?? weakest.readiness}%). ${weakest.id === selected.id ? 'It is where Socra is working now.' : `Socra is working on ${selected.label} now.`}` : 'No capabilities yet: Socra writes them from the conversation.' })()}</p><button className="button button-primary full-width" type="button" onClick={() => focusCapability(selected)}>Open this capability <ArrowRight size={15} /></button></div><div className="readiness-principles"><p className="eyebrow">How the Studio decides</p><div><span>01</span><p><strong>Promise before output</strong>Make sure the customer experience is clear before the build gets busy.</p></div><div><span>02</span><p><strong>Trace every move</strong>Every story should point back to a capability and a decision.</p></div><div><span>03</span><p><strong>Invite the human at the edge</strong>Questions belong in the conversation, not hidden in a workflow.</p></div></div><button className="button button-quiet full-width" type="button" onClick={() => changeView('pilot')}><GitBranch size={15} /> See the traceable build lane</button></aside></div><ReadinessFactors live={live} /></div>
}



export default App


function ValidationView({ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }: { live: Live; validationChecks: Record<string, boolean>; validationScore: number; toggleValidation: (key: string) => void; role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void; recommendationState: RecommendationItem[]; askRecommendation: (recommendation: RecommendationItem) => void; changeView: (view: ViewId) => void; setTechnicalOpen: (value: boolean) => void; technicalOpen: boolean; agentRoutes: Array<{ id: string; agent: string; action: string; state: string; detail: string }>; probeQuestion: string }) {
  const checks = [
    { id: 'problem', label: 'The customer problem is specific', detail: `We know what feels broken before ${live.name} enters the room.` },
    { id: 'customer', label: 'The first customer is named', detail: 'The owner can describe who needs this now, not everyone who might want it.' },
    { id: 'evidence', label: 'Evidence is attached to the claim', detail: 'Conversation, research, and uploaded notes point to the same pattern.' },
    { id: 'proof', label: 'The proof point is observable', detail: 'We can tell when the customer has felt the promise.' },
    { id: 'thinSlice', label: 'A thin slice is possible', detail: 'The first pilot can prove one meaningful customer moment.' },
  ]
  return <div className="page-wrap validation-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />A use case is ready when it can make a promise</p><h1>Validate the use case<br /><em>before</em> you build around it.</h1><p>Socra turns the conversation, evidence, and open questions into a recommendation. It does not create a gate. It tells you what would make the next prototype honest.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => changeView('brief')}>Build the prototype <ArrowRight size={16} /></button></div></div><div className="validation-grid"><section className="validation-card"><div className="validation-score-row"><div><p className="eyebrow">Use case readiness</p><h2>{validationScore}%</h2><p>{validationScore >= 80 ? 'Strong enough to prototype the thin slice.' : 'Keep probing the proof point before you widen the build.'}</p></div><div className="score-orbit"><div><strong>{validationScore}%</strong><small>confidence</small></div></div></div><div className="validation-checks">{checks.map((check) => <button className={`validation-check ${validationChecks[check.id] ? 'is-done' : ''}`} key={check.id} type="button" onClick={() => toggleValidation(check.id)}><span className="check-box">{validationChecks[check.id] && <Check size={13} />}</span><span><strong>{check.label}</strong><small>{live.validation?.[check.id]?.note || check.detail}</small></span><span className="check-status">{validationChecks[check.id] ? 'confirmed' : 'probe this'}</span></button>)}</div></section><aside className="validation-aside"><div className="recommendation-stack"><div className="stack-header"><div><p className="eyebrow">Socra recommendations</p><h3>Questions worth pulling forward</h3></div><Sparkles size={16} /></div>{recommendationState.length === 0 && <p className="trace-intro">Socra pulls considerations, workflows and human pauses forward here as it learns the product.</p>}{recommendationState.map((recommendation) => <button className="recommendation-card" type="button" key={recommendation.id} onClick={() => askRecommendation(recommendation)}><div className={`recommendation-kind ${recommendation.kind}`}>{recommendation.kind === 'workflow' ? <Network size={14} /> : recommendation.kind === 'hitl' ? <UserRound size={14} /> : <CircleHelp size={14} />}</div><div><strong>{recommendation.title}</strong><p>{recommendation.reason}</p><small>Ask this in Socra conversation <ArrowRight size={12} /></small></div></button>)}</div><div className="technical-signal-card"><div className="stack-header"><div><p className="eyebrow">Quiet technical interpretation</p><h3>The system is noticing patterns</h3></div><Bot size={16} /></div>{probeQuestion && <div className="probe-question"><span className="signal-icon"><CircleHelp size={14} /></span><p><strong>Probe now</strong>{probeQuestion}</p></div>}<p>{live.techNotes[0] || 'No technical notes yet. The solution architect and product engineer write them as the shape settles.'}</p><button className="text-button" type="button" onClick={() => setTechnicalOpen(!technicalOpen)}>{technicalOpen ? 'Hide technical read' : 'Inspect technical read'} <ArrowRight size={14} /></button>{technicalOpen && <div className="technical-drawer"><div><span className="technical-dot active" /><strong>Agentic workflow candidate</strong><small>{recommendationState.find((r) => r.kind === 'workflow')?.title ?? live.backlog.find((b) => b.recKind === 'workflow')?.title ?? 'None suggested yet'} · Inngest Agent Kit router</small></div><div><span className="technical-dot hitl" /><strong>Human-in-the-loop point</strong><small>{recommendationState.find((r) => r.kind === 'hitl')?.title ?? live.backlog.find((b) => b.recKind === 'hitl')?.title ?? 'The owner approves every change of meaning'}</small></div><div><span className="technical-dot ui" /><strong>UI surface suggestion</strong><small>{live.components.length ? `shadcn/ui ${live.components.slice(0, 4).map((c) => c.name).join(' + ')}` : 'shadcn/ui, chosen once the PRD has a shape'}</small></div>{live.techNotes.slice(1, 4).map((n) => <div key={n}><span className="technical-dot ui" /><strong>Technical note</strong><small>{n}</small></div>)}</div>}</div><div className="routing-mini"><p className="eyebrow">Agent Kit route</p>{agentRoutes.slice(0, 3).map((route, index) => <div className="routing-row" key={route.id}><span className={`route-node ${route.state}`} />{index < 2 && <span className="route-line" />}<span><strong>{route.agent}</strong><small>{route.action}</small></span><span className="route-state">{route.state}</span></div>)}</div></aside></div></div>
}

function EvidenceView({ live, act, me, evidence, changeView, role, setRole, setToast, openDoc, openTrace }: { live: Live; act: Act; me: Me; evidence: EvidenceItem[]; changeView: (view: ViewId) => void; role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void; setToast: (value: string) => void; openDoc: (id: string) => void; openTrace: (id: string) => void }) {
  const docOf = (id: string) => live.evidence.find((e) => e.id === id)?.documentId ?? ''
  const [filter, setFilter] = useState<'all' | 'interview' | 'research' | 'uploaded'>('all')
  const [editingEv, setEditingEv] = useState('')
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
  return <div className="page-wrap evidence-page"><div className="page-intro"><div><p className="eyebrow">Evidence library · everything Socra is allowed to believe</p><h1>Keep the “why”<br />close to the work.</h1><p>Upload research, attach an interview, or let a conversation become evidence. Every signal stays traceable to the use case, PRFAQ, or a decision.</p></div><div className="intro-actions"><label className="button button-primary file-button"><Upload size={15} /> Add research<input type="file" multiple accept=".md,.txt,.pdf,.docx,.csv,.json,.png,.jpg,.jpeg" onChange={addEvidence} /></label></div></div><div className="evidence-toolbar"><div><span className="eyebrow">{evidence.length} sources connected</span><strong>Confidence grows when signals agree.</strong></div><div className="evidence-filters">{([['all', 'All evidence'], ['interview', 'Interviews'], ['research', 'Research'], ['uploaded', 'Uploads']] as const).map(([k, label]) => <button key={k} className={filter === k ? 'is-active' : ''} type="button" onClick={() => setFilter(k)}>{label}</button>)}</div></div><div className="evidence-grid">{shown.length === 0 && <div className="empty-column">No sources here yet. Upload research, or let the conversation become evidence.</div>}{shown.map((item) => editingEv === item.id ? <EvidenceEditCard key={item.id} live={live} act={act} by={me.name || me.role} ev={live.evidence.find((e) => e.id === item.id)} onDone={() => setEditingEv('')} /> : <article className="evidence-card" key={item.id}><div className="evidence-card-top"><span className={`evidence-type ${item.type}`}>{item.type}</span><span className={`confidence ${item.confidence}`}>{item.confidence === 'high' ? <Check size={11} /> : item.confidence === 'medium' ? <CircleHelp size={11} /> : <Timer size={11} />} {item.confidence}</span></div><h3>{item.insight}</h3><button type="button" className={`evidence-source studio-evidence-open${docOf(item.id) ? ' has-doc' : ''}`} onClick={() => (docOf(item.id) ? openDoc(docOf(item.id)) : openTrace(item.id))} title={docOf(item.id) ? 'Open the document' : 'Open where this came from'}><FileText size={13} /><span><strong>{item.source}</strong><small>{item.trace}</small></span></button><div className="studio-evidence-actions"><button className="text-button" type="button" onClick={() => openTrace(item.id)}>See trace <ExternalLink size={12} /></button><EditButton onClick={() => setEditingEv(item.id)} title="Correct this evidence in your own words" /></div></article>)}</div><EvidenceDocuments live={live} openDoc={openDoc} /><div className="evidence-footer"><div><span className="signal-icon"><Database size={15} /></span><p><strong>Socra’s rule</strong>Research can inform the conversation, but it cannot silently become a requirement. The owner still decides what belongs.</p></div><button className="button button-quiet" type="button" onClick={() => changeView('validation')}>Use evidence to validate <ArrowRight size={14} /></button></div></div>
}

/** One evidence card, opened for editing: what it says, where it came from, what it supports, how sure it is. */
function EvidenceEditCard({ live, act, by, ev, onDone }: { live: Live; act: Act; by: string; ev?: Live['evidence'][number]; onDone: () => void }) {
  const [d, setD] = useState({ insight: ev?.insight ?? '', source: ev?.source ?? '', trace: ev?.trace ?? '', confidence: ev?.confidence ?? 'medium' })
  if (!ev) return null
  const save = () => void act(() => api(`/api/use-cases/${live.id}/evidence/${ev.id}`, { method: 'PATCH', json: { ...d, insight: d.insight.trim(), by } }), 'Evidence updated in your words — Socra is checking what it supports').then(onDone)
  return <article className="evidence-card studio-evidence-editing" onKeyDown={(e) => { if (e.key === 'Escape') onDone(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}>
    <label className="studio-edit-label">What it says<textarea className="spec-editor" rows={4} value={d.insight} autoFocus onChange={(e) => setD({ ...d, insight: e.target.value })} /></label>
    <label className="studio-edit-label">Where it came from<input className="studio-input" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} /></label>
    <label className="studio-edit-label">What it supports<input className="studio-input" value={d.trace} onChange={(e) => setD({ ...d, trace: e.target.value })} /></label>
    <label className="studio-edit-label">How sure<select className="studio-input" value={d.confidence} onChange={(e) => setD({ ...d, confidence: e.target.value })}><option value="high">High</option><option value="medium">Medium</option><option value="open">Open</option></select></label>
    <div className="studio-edit-actions"><button className="button button-primary button-small" type="button" onClick={save} disabled={d.insight.trim().length < 2}><Check size={13} /> Save</button><button className="button button-quiet button-small" type="button" onClick={onDone}>Cancel</button></div>
  </article>
}

/** Every document stored for this product (uploads, card attachments, files the Studio wrote), each one openable. */
function EvidenceDocuments({ live, openDoc }: { live: Live; openDoc: (id: string) => void }) {
  if (!live.documents?.length) return null
  // One row per file name: the newest copy whose file is still there, with how many copies exist.
  const groups = new Map<string, typeof live.documents>()
  for (const d of live.documents) { const k = d.fileName.trim().toLowerCase(); groups.set(k, [...(groups.get(k) ?? []), d]) }
  const rows = [...groups.values()].map((g) => ({ d: [...g].sort((a, b) => Number(b.exists !== false) - Number(a.exists !== false) || +new Date(b.createdAt) - +new Date(a.createdAt))[0], copies: g.length }))
  return <section className="studio-card studio-doc-library"><div className="stack-header"><div><p className="eyebrow">Documents · {rows.length}</p><h3>Everything stored for {live.name}</h3></div><FileText size={16} /></div><ul className="studio-card-files">{rows.map(({ d, copies }) => <li key={d.id}><FileText size={13} /><button type="button" className="studio-link-button" onClick={() => openDoc(d.id)}>{d.fileName}</button><small>{d.origin === 'upload' ? (d.moveId ? 'on a card' : 'uploaded') : 'written in the Studio'} · {ago(d.createdAt)}{copies > 1 ? ` · ${copies} copies, newest shown` : ''}{d.exists === false ? ' · record only, file removed' : ''}</small>{d.exists !== false && <a className="studio-card-dl" href={`/api/use-cases/${live.id}/documents/${d.id}?as=download`} download={d.fileName} aria-label={`Download ${d.fileName}`}><Download size={13} /></a>}</li>)}</ul></section>
}

function BriefView({ live, act, buildNow, validationScore, repositoryUrl, generatedFiles, prototypeStatus, generatePrototype, generationVersion, setTechnicalOpen, technicalOpen, changeView, role, setRole, setToast }: { live: Live; act: Act; buildNow: (opts?: { redesign?: boolean; fresh?: boolean }) => void; validationScore: number; repositoryUrl: string; generatedFiles: string[]; prototypeStatus: 'idle' | 'assembling' | 'ready'; generatePrototype: () => void; setTechnicalOpen: (value: boolean) => void; technicalOpen: boolean; changeView: (view: ViewId) => void; role: 'owner' | 'engineer'; setRole: (role: 'owner' | 'engineer') => void; setToast: (value: string) => void; generationVersion: number }) {
  const components = live.components.map((c) => c.name)
  const trd = live.spec.filter((x) => x.tab === 'trd' && x.review !== 'remove')
  const trdShaped = trd.filter((x) => x.content.trim()).length
  const agentRoutes = live.routes
  const openDecisions = live.decisions.filter((d) => d.status !== 'approved').length
  const [registerOpen, setRegisterOpen] = useState(false)
  return <div className="page-wrap brief-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Step 6 · Build the prototype</p><h1>Build it from<br /><em>everything you decided.</em></h1><p>Press Build and Claude Code builds a working prototype. There is nothing to package by hand: your PRFAQ, PRD, TRD, evidence, decisions and board go to it automatically, with the why behind each one. The list below shows what it gets.</p></div><div className="intro-actions"><button className="button button-primary" type="button" onClick={() => buildNow()} disabled={live.generateBusy}><Play size={15} />{live.generateBusy ? 'Claude Code is building…' : live.preview.hasApp ? `Build version ${live.generateCount + 1} with Claude Code` : 'Build it with Claude Code'}</button><button className="button button-quiet" type="button" onClick={generatePrototype} disabled={prototypeStatus === 'assembling'}><PackageOpen size={15} />{prototypeStatus === 'assembling' ? 'Assembling ZIP…' : prototypeStatus === 'ready' ? 'Generate again + download ZIP' : 'Download Claude Code ZIP'}</button><span className="studio-intro-note">{live.generateBusy ? `${live.generateStatus ? `${live.generateStatus}. ` : ''}Building on your Claude plan; the preview updates when it’s done` : repositoryUrl || 'Builds run on your Claude plan; the ZIP is for your own Claude Code'}</span></div></div><div className="brief-layout"><section className="brief-manifest"><div className="manifest-header"><div><p className="eyebrow">What Claude Code gets</p><h2>{generatedFiles.length ? `${generatedFiles.length} files sent with the last build` : 'Bundled automatically when you build'}</h2><span className="generation-count">Iteration {generationVersion || 0}</span></div><span className={`package-status ${prototypeStatus}`}><span />{prototypeStatus === 'ready' ? 'downloaded' : prototypeStatus === 'assembling' ? 'working' : 'draft'}</span></div><div className="manifest-grid"><ManifestItem icon={<Target size={15} />} title="Validated use case" detail={`${validationScore}% readiness recommendation`} done={validationScore >= 80} /><ManifestItem icon={<FileText size={15} />} title="PRFAQ + decisions" detail={`${live.prfaq.trim() ? 'Customer promise written' : 'No PRFAQ yet'}, ${live.decisions.length} decisions, ${openDecisions} open`} done={Boolean(live.prfaq.trim()) && live.decisions.length > 0} /><ManifestItem icon={<Database size={15} />} title="Evidence library" detail={live.evidence.length ? `${live.evidence.length} sources: ${Object.entries(live.evidence.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] ?? 0) + 1 }), {})).map(([t, n]) => `${n} ${t}`).join(', ')}` : 'No sources yet'} done={live.evidence.length > 0} /><ManifestItem icon={<Code2 size={15} />} title="Technical requirements" detail={`${trdShaped} of ${trd.length} TRD sections written`} done={trd.length > 0 && trdShaped === trd.length} /><ManifestItem icon={<Layers3 size={15} />} title="shadcn/ui component map" detail={components.length ? `${components.length} suggested primitives, ready to adapt` : 'Not mapped yet'} done={components.length > 0} /><ManifestItem icon={<Bot size={15} />} title="Inngest Agent Kit routes" detail={agentRoutes.length ? `${agentRoutes.length} routes: ${agentRoutes.map((r) => r.agent).join(', ')}` : 'No routes yet'} done={agentRoutes.length > 0} /></div><div className="file-list"><div className="eyebrow">Package contents</div>{generatedFiles.length ? generatedFiles.map((file) => <div key={file}><FileText size={13} /><a className="studio-package-file" href={`/api/use-cases/${live.id}/package/files/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer">{file}</a><a className="studio-card-dl" href={`/api/use-cases/${live.id}/package/files/${encodeURIComponent(file)}?as=download`} download={file} aria-label={`Download ${file}`}><Download size={13} /></a></div>) : <div><span>Nothing assembled yet. Build it or download the ZIP and the package files appear here, each one openable.</span></div>}</div></section><aside className="brief-aside"><div className="brief-side-card"><div className="stack-header"><div><p className="eyebrow">Component recommendations</p><h3>UI baseline for the thin slice</h3></div><Settings2 size={16} /></div><div className="component-pills">{components.length ? components.map((component) => <span key={component}>{component}</span>) : <small className="studio-muted">No component map yet. It is written from the PRD once the shape is clear.</small>}</div><button className="text-button" type="button" onClick={() => setTechnicalOpen(!technicalOpen)}>{technicalOpen ? 'Hide mapping rationale' : 'Show mapping rationale'} <ArrowRight size={13} /></button>{technicalOpen && <div className="mapping-note">{live.components.some((c) => c.why) ? live.components.filter((c) => c.why).map((c) => `${c.name}: ${c.why}`).join(' ') : 'The component map is written from the PRD with the shadcn registry once the shape is clear.'}</div>}</div><div className="brief-side-card routing-card"><div className="stack-header"><div><p className="eyebrow">Agent Kit orchestration</p><h3>Visible, not overwhelming</h3></div><RefreshCw size={16} /></div><div className="route-timeline">{agentRoutes.map((route) => <div key={route.id}><span className={`route-node ${route.state}`} /><div><strong>{route.agent}</strong><small>{route.action}</small></div><span className="route-state">{route.state}</span></div>)}</div></div><div className="human-register"><div className="stack-header"><div><p className="eyebrow">Human-in-the-loop register</p><h3>Meaning stays yours</h3></div><UserRound size={16} /></div><p>{live.decisions.length} decisions are tracked; {openDecisions} {openDecisions === 1 ? 'remains' : 'remain'} open before production hardening.</p><button className="button button-quiet full-width" type="button" onClick={() => setRegisterOpen(!registerOpen)}>Review open decision <ArrowRight size={14} /></button>{registerOpen && <DecisionRegister live={live} act={act} />}</div><button className="button button-quiet full-width" type="button" onClick={() => changeView('connections')}><FolderGit2 size={15} /> Review repository connection</button></aside></div><BuildHistory live={live} act={act} buildNow={buildNow} /></div>
}

function ManifestItem({ icon, title, detail, done }: { icon: React.ReactNode; title: string; detail: string; done: boolean }) {
  return <div className="manifest-item"><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div>{done ? <Check size={13} /> : <Timer size={13} className="studio-muted" />}</div>
}

function ConnectionsView({ live, act, setToast, changeView }: { live: Live; act: Act; setToast: (value: string) => void; changeView: (view: ViewId) => void }) {
  const [repositoryUrl, setRepositoryUrl] = useState(live.repoUrl)
  const [linearWorkspace, setLinearWorkspace] = useState(live.linearTeam)
  const repoSave = useSaveState()
  const linearSave = useSaveState()
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
  return <div className="page-wrap connections-page"><div className="page-intro"><div><p className="eyebrow">Connections · where the work goes next</p><h1>Keep the loop<br /><em>open.</em></h1><p>Claude Code can generate the first ZIP now. A connected repository gives the next iteration a durable home, while Linear can become an optional synchronized view of the same product truth.</p></div><div className="intro-actions"><span className="connection-status"><span className="live-pulse" /> Local workspace active</span><button className="button button-primary" type="button" onClick={() => changeView('brief')}>Back to prototype brief <ArrowRight size={16} /></button></div></div><div className="connections-grid"><section className="connection-card"><div className="connection-card-header"><span className="connection-logo github"><GitBranch size={18} /></span><div><p className="eyebrow">Source of truth</p><h2>Git repository</h2></div><span className="connection-badge">{live.connections.github && live.repoUrl ? 'Connected' : live.repoUrl ? 'URL saved' : 'Needs URL'}</span></div><p>Provide the repository URL where the generated package or future prototype branch should be pushed. {live.connections.github ? 'The GitHub token on Settings gives the Studio push permission; every build is pushed here automatically.' : 'Add a GitHub token on Settings (Models and keys) before the first real push.'}</p><label>Repository URL<input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/org/repository" /></label><div className="connection-actions"><SaveButton className="button button-primary" state={repoSave.state} disabled={repositoryUrl.trim() === (live.repoUrl ?? '')} label="Save repository" onClick={() => void repoSave.run(() => act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { repoUrl: repositoryUrl.trim() } }), 'Repository URL saved — the next package can target this repository', { rethrow: true }))} /><button className="button button-quiet" type="button" onClick={() => sync('git')}><RefreshCw size={14} /> {gitSync === 'syncing' ? 'Syncing…' : gitSync === 'synced' ? 'Synced' : 'Sync package'}</button></div><div className="connection-note"><CircleHelp size={14} /><span>{live.gitStatus ? `${live.gitStatus}${live.gitPushedAt ? ` · ${ago(live.gitPushedAt)}` : ''}` : 'Opinionated default: keep the generated ZIP as an auditable handoff, then commit the unpacked package to a dedicated prototype branch.'}</span></div></section><section className="connection-card"><div className="connection-card-header"><span className="connection-logo linear"><Layers3 size={18} /></span><div><p className="eyebrow">Optional synchronization</p><h2>Linear workspace</h2></div><span className={`connection-badge ${live.connections.linear ? '' : 'muted'}`}>{live.connections.linear ? 'Key on Settings' : 'Optional'}</span></div><p>If the team uses Linear, the Studio can synchronize capabilities, epics, and stories after the owner has shaped them. The Studio remains the conversational source of truth.</p><label>Linear team<input value={linearWorkspace} onChange={(event) => setLinearWorkspace(event.target.value)} placeholder="Team key or name, e.g. ENG" /></label><div className="connection-actions"><SaveButton className="button button-primary" state={linearSave.state} disabled={linearWorkspace.trim() === (live.linearTeam ?? '')} label="Save workspace" onClick={() => void linearSave.run(() => act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { linearTeam: linearWorkspace.trim() } }), 'Linear workspace saved — sync remains opt-in', { rethrow: true }))} /><button className="button button-quiet" type="button" onClick={() => sync('linear')}><RefreshCw size={14} /> {linearSync === 'syncing' ? 'Syncing…' : linearSync === 'synced' ? 'Synced' : 'Preview + sync map'}</button></div><div className="connection-note"><CircleHelp size={14} /><span>{live.linearStatus ? `${live.linearStatus}${live.linearSyncedAt ? ` · ${ago(live.linearSyncedAt)}` : ''}` : 'Sync should never erase the conversational context. It should only project the curated backlog and spec diffs into Linear.'}</span></div></section></div><SyncPreview live={live} syncState={syncState} refresh={tick} /><div className="connection-flow"><div><span className="eyebrow">The proposed loop</span><strong>Studio → Claude Code ZIP → Git branch → Pilot → optional Linear sync</strong></div><div className="connection-flow-nodes"><span>Product truth</span><ArrowRight size={14} /><span>Prototype package</span><ArrowRight size={14} /><span>Repository</span><ArrowRight size={14} /><span>Iteration</span></div></div><ProvidersCard /></div>
}
function AnnotationPanel({ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }: { annotationMode: boolean; setAnnotationMode: (value: boolean) => void; annotationTarget: string; annotationNote: string; setAnnotationNote: (value: string) => void; isListening: boolean; toggleVoice: () => void; addAnnotation: () => void; captureFrame: (mode?: 'surface' | 'screen') => void; capturedFrame: string; annotationShape: 'object' | 'circle' | 'full-screen'; setAnnotationShape: (value: 'object' | 'circle' | 'full-screen') => void }) {
  return <div className={`annotation-panel ${annotationMode || annotationTarget ? 'is-open' : ''}`}><div className="annotation-panel-top"><div><p className="eyebrow">Vibe annotation layer</p><h3>Point at the part you want to change.</h3></div><button className="icon-button subtle" type="button" onClick={() => setAnnotationMode(false)} aria-label="Close annotation mode"><X size={15} /></button></div><p className="annotation-copy">Click a part of the live product, or drag a circle around a region, and describe what you’re seeing. Your note becomes a backlog signal with the captured frame attached.</p><div className="annotation-target-row"><span className="annotation-pin"><MousePointer2 size={14} /></span><span>{annotationTarget || 'No surface selected yet'}</span>{annotationTarget && <span className="selected-chip"><Check size={12} /> selected</span>}</div><div className="annotation-modes"><span className="eyebrow">Capture context</span><button className={annotationShape === 'object' ? 'is-active' : ''} type="button" onClick={() => setAnnotationShape('object')}><MousePointer2 size={12} /> Object</button><button className={annotationShape === 'circle' ? 'is-active' : ''} type="button" onClick={() => setAnnotationShape('circle')}><CircleHelp size={12} /> Circle region</button><button className={annotationShape === 'full-screen' ? 'is-active' : ''} type="button" onClick={() => setAnnotationShape('full-screen')}><Maximize2 size={12} /> Full screen</button></div><div className="annotation-composer"><textarea value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} placeholder="What should feel different here?" rows={2} /><div className="annotation-actions"><button className={`voice-button ${isListening ? 'is-listening' : ''}`} type="button" onClick={toggleVoice}><Mic size={14} /> {isListening ? 'Listening…' : 'Add voice note'}</button><div><button className="button button-quiet button-small" type="button" onClick={() => captureFrame(annotationShape === 'full-screen' ? 'screen' : 'surface')}><Maximize2 size={13} /> {annotationShape === 'full-screen' ? 'Capture screen' : annotationShape === 'circle' ? 'Capture circle' : 'Capture frame'}</button><button className="button button-primary button-small" type="button" onClick={addAnnotation} disabled={!annotationNote.trim()}>Add to backlog <ArrowRight size={13} /></button></div></div></div>{capturedFrame && <div className="captured-frame"><img src={capturedFrame} alt="Captured product preview frame" /><span>Frame attached to the annotation</span></div>}</div>
}
