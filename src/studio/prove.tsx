'use client'
// Product shape, Validate use case, Evidence & signals and Pilot readiness on shadcn/ui + Animate UI.
// Same calls as the older screens; Product shape reuses the held-thoughts list from Whole product, so
// its edit and withdraw use dialogs instead of the browser's prompt and confirm.
import { useState, type ChangeEvent } from 'react'
import { ArrowRight, Bot, Check, CircleHelp, Database, ExternalLink, FileText, Flame, GitBranch, MoveUpRight, Network, Pencil, Sparkles, Timer, Upload, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ago, type Live } from './live'
import type { Capability, EvidenceItem, RecommendationItem } from './data'
import type { Me, StudioView } from './flow'
import { Empty, PageHeader, Row, Section, SectionBody, StatusBadge } from './kit'
import { Prose } from './specview'
import { HeldThoughts, type HeldItem } from './overview'
import { RoleLens } from './brief'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
type Role = 'owner' | 'engineer'
type Tone = 'ok' | 'warn' | 'off' | 'info' | 'suggest'
const PAGE = 'mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8'
const SPLIT = 'grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]'
const COLUMN = 'grid min-w-0 grid-cols-1 content-start gap-6'

/** A thin bar in a given colour (capability colours aren't theme tokens). */
function Bar({ value, color }: { value: number; color?: string }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, value))}%`, ...(color ? { background: color } : {}) }} /></div>
}

/* ------------------------------------------------------------------ Product shape */

export function ProductView({ live, act, me, selected, backlog, capture, setCapture, captureIdea, approvalCount, changeView }: { live: Live; act: Act; me: Me; selected: Capability; backlog: HeldItem[]; capture: string; setCapture: (v: string) => void; captureIdea: () => void; approvalCount: number; changeView: (view: StudioView) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(live.prfaq)
  const save = () => { setEditing(false); void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { prfaq: draft } }), 'PRFAQ saved in your words. Socra will carry it into the spec') }
  const waiting = backlog.filter((b) => b.kind === 'capture').length
  const decisions = live.decisions.slice(-8)
  return (
    <div data-ui className={PAGE}>
      <PageHeader
        title="Product shape"
        description="The press release and FAQ, kept alive: the original voice, approved decisions and open questions side by side."
        actions={<><span className="text-sm text-muted-foreground">{approvalCount} {approvalCount === 1 ? 'approval' : 'approvals'} carried forward</span><Button type="button" onClick={() => changeView('conversation')} className="gap-1.5">Keep shaping <ArrowRight className="size-4" /></Button></>}
      />
      <div className={SPLIT}>
        <div className={COLUMN}>
          <Section
            title={live.statement || live.name}
            description={<>PRFAQ · {live.slug}-v0.{live.packageCount} · last touched {ago(live.prfaqUpdatedAt ?? live.updatedAt)}{live.audience ? ` · for ${live.audience}` : ''}</>}
            action={editing
              ? <><Button type="button" size="sm" onClick={save} className="gap-1.5"><Check className="size-4" /> Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></>
              : <Button type="button" size="sm" variant="outline" onClick={() => { setDraft(live.prfaq); setEditing(true) }} className="gap-1.5"><Pencil className="size-4" /> Edit in your words</Button>}
          >
            <SectionBody className="gap-5">
              {live.description && <p className="text-lg text-muted-foreground">{live.description}</p>}
              {editing
                ? <Textarea aria-label="PRFAQ text" value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} className="font-mono text-sm" />
                : live.prfaq
                  ? <Prose text={live.prfaq} />
                  : <div className="grid gap-3"><p className="text-base">Socra writes the press release and FAQ from your conversation. It appears here as soon as there is enough to say honestly.</p>{live.customerQuote && <blockquote className="border-l-2 border-primary pl-3 font-serif text-lg">“{live.customerQuote.replace(/[“”]/g, '')}”</blockquote>}</div>}
            </SectionBody>
          </Section>
          <Section title="Decisions captured" description="A plain yes to Socra carries its proposal forward; an assumed one stays until someone says no.">
            {decisions.length === 0 && <Empty>No decisions yet.</Empty>}
            {decisions.map((d) => (
              <Row key={d.id} title={<span className="font-medium">{d.text}</span>} detail={ago(d.createdAt)} badge={<StatusBadge tone={d.status === 'approved' ? 'ok' : d.status === 'assumed' ? 'suggest' : d.status === 'rejected' ? 'off' : 'warn'}>{d.status === 'approved' ? 'Approved' : d.status === 'assumed' ? 'Assumed, say no to change it' : d.status === 'rejected' ? 'Rejected' : 'Open with Socra'}</StatusBadge>} />
            ))}
          </Section>
        </div>
        <aside className={COLUMN}>
          <Section title={waiting ? `${waiting} ${waiting === 1 ? 'thought is' : 'thoughts are'} waiting for a home` : 'Every thought has a home'} description={selected.signal} action={<Sparkles className="size-4 text-primary" />}>
            <SectionBody><Button type="button" size="sm" variant="outline" onClick={() => changeView('conversation')} className="justify-self-start gap-1.5">Ask Socra <ArrowRight className="size-4" /></Button></SectionBody>
          </Section>
          <HeldThoughts live={live} act={act} me={me} selected={selected} items={backlog} capture={capture} setCapture={setCapture} captureIdea={captureIdea} limit={6} />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Validate use case */

const CHECKS = (name: string) => [
  { id: 'problem', label: 'The customer problem is specific', detail: `We know what feels broken before ${name} enters the room.` },
  { id: 'customer', label: 'The first customer is named', detail: 'The owner can describe who needs this now, not everyone who might want it.' },
  { id: 'evidence', label: 'Evidence is attached to the claim', detail: 'Conversation, research and uploaded notes point to the same pattern.' },
  { id: 'proof', label: 'The proof point is observable', detail: 'We can tell when the customer has felt the promise.' },
  { id: 'thinSlice', label: 'A thin slice is possible', detail: 'The first pilot can prove one meaningful customer moment.' },
]
const REC_ICON = { workflow: Network, hitl: UserRound, consider: CircleHelp } as const
const REC_LABEL = { workflow: 'Workflow', hitl: 'Human pause', consider: 'Consider' } as const

export function ValidationView({ live, validationChecks, validationScore, toggleValidation, role, setRole, recommendationState, askRecommendation, changeView, setTechnicalOpen, technicalOpen, agentRoutes, probeQuestion }: { live: Live; validationChecks: Record<string, boolean>; validationScore: number; toggleValidation: (key: string) => void; role: Role; setRole: (role: Role) => void; recommendationState: RecommendationItem[]; askRecommendation: (r: RecommendationItem) => void; changeView: (view: StudioView) => void; setTechnicalOpen: (v: boolean) => void; technicalOpen: boolean; agentRoutes: { id: string; agent: string; action: string; state: string; detail: string }[]; probeQuestion: string }) {
  const workflow = recommendationState.find((r) => r.kind === 'workflow')?.title ?? live.backlog.find((b) => b.recKind === 'workflow')?.title ?? 'None suggested yet'
  const hitl = recommendationState.find((r) => r.kind === 'hitl')?.title ?? live.backlog.find((b) => b.recKind === 'hitl')?.title ?? 'The owner approves every change of meaning'
  return (
    <div data-ui className={PAGE}>
      <PageHeader
        title="Validate the use case"
        description="Socra turns the conversation, evidence and open questions into a recommendation. It isn't a gate: it tells you what would make the next prototype honest."
        actions={<><RoleLens role={role} setRole={setRole} /><Button type="button" onClick={() => changeView('brief')} className="gap-1.5">Prepare the prototype brief <ArrowRight className="size-4" /></Button></>}
      />
      <div className={SPLIT}>
        <div className={COLUMN}>
          <Section title="Use case readiness" description={validationScore >= 80 ? 'Strong enough to prototype the thin slice.' : 'Keep probing the proof point before you widen the build.'} action={<span className="text-2xl font-semibold text-primary">{validationScore}%</span>}>
            <SectionBody><Bar value={validationScore} /></SectionBody>
            <ul aria-label="Validation checks" className="grid grid-cols-1">
              {CHECKS(live.name).map((c) => {
                const done = !!validationChecks[c.id]
                return (
                  <li key={c.id} className="border-t border-border">
                    <button type="button" aria-pressed={done} onClick={() => toggleValidation(c.id)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/50">
                      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded border', done ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{done && <Check className="size-3.5" />}</span>
                      <span className="grid min-w-0 flex-1 gap-0.5"><span className="text-sm font-semibold">{c.label}</span><span className="text-xs text-muted-foreground">{live.validation?.[c.id]?.note || c.detail}</span></span>
                      <StatusBadge tone={done ? 'ok' : 'warn'}>{done ? 'Confirmed' : 'Probe this'}</StatusBadge>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>
          <Section title="Agent Kit route" description="The first agents in line, so nothing runs out of sight." action={<Bot className="size-4 text-muted-foreground" />}>
            {agentRoutes.length === 0 && <Empty>No agent routes yet.</Empty>}
            {agentRoutes.slice(0, 3).map((r) => <Row key={r.id} title={r.agent} detail={r.action}><StatusBadge tone={r.state === 'complete' || r.state === 'done' ? 'ok' : r.state === 'active' ? 'info' : r.state === 'waiting' ? 'warn' : 'off'}>{r.state}</StatusBadge></Row>)}
          </Section>
        </div>
        <aside className={COLUMN}>
          <Section title="Questions worth pulling forward" description="Socra’s recommendations. Pick one to ask it in the conversation." action={<Sparkles className="size-4 text-primary" />}>
            {recommendationState.length === 0 && <Empty>Socra pulls considerations, workflows and human pauses forward here as it learns the product.</Empty>}
            {recommendationState.map((r) => {
              const Icon = REC_ICON[r.kind]
              return (
                <button key={r.id} type="button" onClick={() => askRecommendation(r)} className="flex w-full items-start gap-3 border-b border-border px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-accent/50">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary"><Icon className="size-4" /></span>
                  <span className="grid min-w-0 flex-1 gap-1"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{r.title}<StatusBadge tone={r.kind === 'hitl' ? 'warn' : r.kind === 'workflow' ? 'info' : 'suggest'}>{REC_LABEL[r.kind]}</StatusBadge></span><span className="text-xs text-muted-foreground">{r.reason}</span><span className="inline-flex items-center gap-1 text-xs font-medium text-primary">Ask Socra <ArrowRight className="size-3.5" /></span></span>
                </button>
              )
            })}
          </Section>
          <Section title="What the system is noticing" description="The technical read, without making anyone learn agent vocabulary." action={<Bot className="size-4 text-muted-foreground" />}>
            <SectionBody>
              {probeQuestion && <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3"><CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" /><p className="text-sm"><span className="font-semibold">Probe now. </span>{probeQuestion}</p></div>}
              <p className="text-sm">{live.techNotes[0] || 'Socra notes where a workflow could run on its own and where a person must pause it before meaning changes.'}</p>
              <Button type="button" size="sm" variant="ghost" aria-expanded={technicalOpen} onClick={() => setTechnicalOpen(!technicalOpen)} className="justify-self-start gap-1.5 px-2">{technicalOpen ? 'Hide the technical read' : 'Show the technical read'} <ArrowRight className={cn('size-4 transition-transform', technicalOpen && 'rotate-90')} /></Button>
              {technicalOpen && (
                <dl className="grid gap-3 text-sm">
                  {([['Agentic workflow candidate', `${workflow} · Inngest Agent Kit router`], ['Human-in-the-loop point', hitl], ['UI suggestion', live.components.length ? `shadcn/ui ${live.components.slice(0, 4).map((c) => c.name).join(' + ')}` : 'shadcn/ui, chosen once the PRD has a shape'], ...live.techNotes.slice(1, 4).map((n) => ['Technical note', n])] as [string, string][]).map(([k, v], i) => <div key={i} className="grid gap-0.5"><dt className="text-xs font-medium text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
                </dl>
              )}
            </SectionBody>
          </Section>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Evidence & signals */

const EVIDENCE_FILTERS = [['all', 'All evidence'], ['interview', 'Interviews'], ['research', 'Research'], ['uploaded', 'Uploads']] as const
const CONF_TONE: Record<EvidenceItem['confidence'], Tone> = { high: 'ok', medium: 'info', open: 'warn' }
const TYPE_TONE: Record<EvidenceItem['type'], Tone> = { interview: 'info', research: 'suggest', uploaded: 'off', conversation: 'ok' }

export function EvidenceView({ live, act, evidence, changeView, role, setRole, setToast }: { live: Live; act: Act; evidence: EvidenceItem[]; changeView: (view: StudioView) => void; role: Role; setRole: (role: Role) => void; setToast: (value: string) => void }) {
  const [filter, setFilter] = useState<(typeof EVIDENCE_FILTERS)[number][0]>('all')
  const [traceOf, setTraceOf] = useState('')
  const addEvidence = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('kind', filter === 'interview' || filter === 'research' ? filter : 'uploaded')
    setToast(`${files.map((f) => f.name).join(', ')} added to the evidence library. Socra is reading it`)
    void act(async () => {
      const res = await fetch(`/api/use-cases/${live.id}/documents`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'The upload did not go through')
    })
  }
  const shown = filter === 'all' ? evidence : evidence.filter((e) => e.type === filter)
  return (
    <div data-ui className={PAGE}>
      <PageHeader
        title="Evidence & signals"
        description="Everything Socra is allowed to believe. Upload research, attach an interview, or let a conversation become evidence; each one stays traceable to the use case, PRFAQ or a decision."
        actions={<><RoleLens role={role} setRole={setRole} /><Button asChild><label className="cursor-pointer gap-1.5"><Upload className="size-4" /> Add research<input type="file" multiple hidden accept=".md,.txt,.pdf,.docx,.csv,.json,.png,.jpg,.jpeg" onChange={addEvidence} aria-label="Add research files" /></label></Button></>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter evidence" className="flex flex-wrap gap-1.5">
          {EVIDENCE_FILTERS.map(([k, label]) => <Button key={k} type="button" size="sm" variant={filter === k ? 'secondary' : 'ghost'} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</Button>)}
        </div>
        <span className="text-sm text-muted-foreground">{evidence.length} {evidence.length === 1 ? 'source' : 'sources'} connected. Confidence grows when signals agree.</span>
      </div>
      {shown.length === 0
        ? <Section title="Nothing here yet"><Empty>Upload research, or let the conversation become evidence.</Empty></Section>
        : (
          <ul aria-label="Evidence" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((item) => (
              <li key={item.id} className="grid min-w-0 content-start gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={TYPE_TONE[item.type]}>{item.type}</StatusBadge><StatusBadge tone={CONF_TONE[item.confidence]}>{item.confidence === 'open' ? 'open question' : `${item.confidence} confidence`}</StatusBadge></div>
                <h3 className="text-base font-semibold [overflow-wrap:anywhere]">{item.insight}</h3>
                <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground"><FileText className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{item.source}</span></div>
                <Button type="button" size="sm" variant="ghost" aria-expanded={traceOf === item.id} onClick={() => setTraceOf(traceOf === item.id ? '' : item.id)} className="justify-self-start gap-1.5 px-2">Where it leads <ExternalLink className="size-4" /></Button>
                {traceOf === item.id && <p className="rounded-lg bg-muted p-3 text-sm">{item.trace || 'Connected to the product shape.'}</p>}
              </li>
            ))}
          </ul>
        )}
      <Section title="Socra’s rule" description="Research can inform the conversation, but it can't silently become a requirement. The owner still decides what belongs." action={<Database className="size-4 text-primary" />}>
        <SectionBody><Button type="button" variant="outline" size="sm" onClick={() => changeView('validation')} className="justify-self-start gap-1.5">Use the evidence to validate <ArrowRight className="size-4" /></Button></SectionBody>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------------ Pilot readiness */

const PRINCIPLES: [string, string][] = [
  ['Promise before output', 'Make sure the customer experience is clear before the build gets busy.'],
  ['Trace every move', 'Every story points back to a capability and a decision.'],
  ['Invite the person at the edge', 'Questions belong in the conversation, not hidden in a workflow.'],
]

export function ReadinessView({ live, capabilities, readiness, overallReadiness, selected, focusCapability, changeView }: { live: Live; capabilities: Capability[]; readiness: Record<string, number>; overallReadiness: number; selected: Capability; focusCapability: (c: Capability) => void; changeView: (view: StudioView) => void }) {
  return (
    <div data-ui className={PAGE}>
      <PageHeader
        title="Pilot readiness"
        description="A capability is ready when the product can make a promise and keep it. The percentages show where to look next; they aren't grades for the team."
        actions={<div className="grid justify-items-end"><span className="text-3xl font-semibold text-primary">{overallReadiness}%</span><span className="text-sm text-muted-foreground">ready for a thin-slice pilot</span></div>}
      />
      <div className={SPLIT}>
        <div className={COLUMN}>
          <Section title="What still needs to become true" description="Each capability, how far it has come, and where to push next.">
            {capabilities.map((c) => {
              const value = readiness[c.id] ?? c.readiness
              return (
                <div key={c.id} className="grid min-w-0 gap-2.5 border-b border-border px-5 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="grid min-w-0 flex-1 gap-0.5"><span className="text-base font-semibold">{c.label}</span><span className="text-xs text-muted-foreground">{c.kicker}</span></span>
                    <span className="text-lg font-semibold">{value}%</span>
                  </div>
                  <Bar value={value} color={c.color} />
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MoveUpRight className="size-3.5" /> {c.delta}</span><Button type="button" size="sm" variant="ghost" onClick={() => focusCapability(c)} className="gap-1.5 px-2">Work on this with Socra <ArrowRight className="size-4" /></Button></div>
                </div>
              )
            })}
          </Section>
          <ReadinessFactors live={live} />
        </div>
        <aside className={COLUMN}>
          <Section title="The next honest move" description={`${selected.label} has the clearest path to a meaningful pilot moment. Socra is ready to help you sharpen its promise.`} action={<Flame className="size-4 text-warning" />}>
            <SectionBody><Button type="button" onClick={() => focusCapability(selected)} className="gap-1.5">Open {selected.label} <ArrowRight className="size-4" /></Button></SectionBody>
          </Section>
          <Section title="How the Studio decides">
            <ol className="grid grid-cols-1">
              {PRINCIPLES.map(([t, d], i) => <li key={t} className="flex gap-3 border-b border-border px-5 py-3.5 last:border-b-0"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span><span className="grid gap-0.5"><span className="text-sm font-semibold">{t}</span><span className="text-xs text-muted-foreground">{d}</span></span></li>)}
            </ol>
          </Section>
          <Button type="button" variant="outline" onClick={() => changeView('pilot')} className="gap-1.5"><GitBranch className="size-4" /> See the board</Button>
        </aside>
      </div>
    </div>
  )
}

/** Explainable readiness: the factors behind the one number. */
export function ReadinessFactors({ live }: { live: Live }) {
  return (
    <Section title={`What the ${live.readiness.overall}% is made of`} description="Calculated from the product truth. It guides; it never blocks." action={<Timer className="size-4 text-muted-foreground" />}>
      {live.readiness.factors.map((f) => (
        <div key={f.key} className="grid gap-1.5 border-b border-border px-5 py-3.5 last:border-b-0">
          <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{f.label}</span><span className="tabular-nums">{f.value}%</span></div>
          <Bar value={f.value} />
          <span className="text-xs text-muted-foreground">{f.detail}</span>
        </div>
      ))}
    </Section>
  )
}
