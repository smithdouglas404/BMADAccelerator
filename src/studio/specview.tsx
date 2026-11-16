'use client'
// The Living specification on shadcn/ui + Animate UI: the outline, the section being read (with Accept,
// Revise, Challenge, Remove and its review state), how it got here, what a change touches, and the
// versions. Same calls as the older screen.
import { useEffect, useState } from 'react'
import { ArrowRight, Check, ChevronDown, CircleHelp, Code2, FileText, History, Network, Sparkles, Target, Timer, Wand2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SPEC_BASIS, SPEC_STATUSES } from '@/lib/studio/spec'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, ago, toSpec, type Live } from './live'
import { StudioMarkdown } from './extras'
import type { StudioView } from './flow'
import { Empty, PageHeader, Row, Section, SectionBody, StatusBadge } from './kit'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
type SpecSection = ReturnType<typeof toSpec>[number]
type Tone = 'ok' | 'warn' | 'off' | 'info' | 'suggest'

const CONF_TONE: Record<string, Tone> = { high: 'ok', medium: 'info', open: 'warn' }
const STATUS_TONE: Record<string, Tone> = { draft: 'off', 'in-review': 'warn', approved: 'ok', 'needs-evidence': 'warn', inferred: 'suggest' }
const TRACE_DOT: Record<string, string> = { conversation: 'bg-primary', evidence: 'bg-info', backlog: 'bg-suggest', execution: 'bg-warning', annotation: 'bg-destructive' }

/** Markdown from Socra, in the new type scale. */
export function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('text-base leading-relaxed [&_.quote-callout]:my-3 [&_.quote-callout]:border-l-2 [&_.quote-callout]:border-primary [&_.quote-callout]:pl-3 [&_.quote-callout>span]:hidden [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:mb-1 [&_p]:mb-3 [&_p]:text-foreground [&_li]:text-foreground [&_p]:text-base [&_li]:text-base [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5', className)}>
      <StudioMarkdown text={text} />
    </div>
  )
}

type Props = { live: Live; act: Act; changeView: (view: StudioView, node?: string) => void; specSections: SpecSection[] }

export function SpecView({ live, act, changeView, specSections }: Props) {
  const [tab, setTab] = useState<'prd' | 'trd'>('prd')
  const [selectedId, setSelectedId] = useState(specSections[0]?.id ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(specSections[0]?.content ?? '')
  const [reviewMode, setReviewMode] = useState(false)
  const sections = specSections.filter((s) => s.tab === tab)
  const selected = sections.find((s) => s.id === selectedId) ?? sections[0]
  const tabPercent = (t: 'prd' | 'trd') => { const s = specSections.filter((x) => x.tab === t && x.review !== 'remove'); return s.length ? Math.round(s.reduce((sum, x) => sum + x.completeness, 0) / s.length) : 0 }
  const choose = (s: SpecSection) => { setSelectedId(s.id); setDraft(s.content); setEditing(false) }
  const selectTab = (t: 'prd' | 'trd') => { setTab(t); const n = specSections.find((s) => s.tab === t); if (n) choose(n) }
  if (!selected) return <div data-ui className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-8"><PageHeader title="Living specification" description="The living specification is being laid out. One moment." /></div>

  const label = tab.toUpperCase()
  const review = (choice: 'keep' | 'revise' | 'challenge' | 'remove' | '', note = '') =>
    act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { review: choice, note } }), choice === 'keep' ? `${selected.title} accepted into the living ${label}; its provenance stays attached` : choice === 'remove' ? `${selected.title} removed; its evidence and conversation are kept` : choice ? `${selected.title} sent back to Socra to ${choice}` : `${selected.title} back in play`)
  const nextOpen = () => {
    const queue = sections.filter((s) => !s.review && s.basis !== 'confirmed')
    const i = queue.findIndex((s) => s.id === selected.id)
    const n = queue[(i + 1) % Math.max(1, queue.length)] ?? sections[(sections.indexOf(selected) + 1) % sections.length]
    if (n) choose(n)
  }
  const accept = () => { setEditing(false); void review('keep'); if (reviewMode) nextOpen() }
  const saveRevision = () => {
    setEditing(false)
    void act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { content: draft, review: 'revise', note: 'Edited in the owner’s own words' } }), `Revision saved for ${selected.title}; downstream impact is ready to review`)
  }
  const setStatus = (status: string) => void act(() => api(`/api/use-cases/${live.id}/spec/${selected.key}`, { method: 'PATCH', json: { status } }), `${selected.title} is now ${status.replace(/-/g, ' ')}`)
  const traceGo = (type: string) => {
    const to: Record<string, StudioView> = { conversation: 'conversation', evidence: 'evidence', backlog: 'product', execution: 'pilot', annotation: 'review' }
    if (to[type]) changeView(to[type])
  }
  const related = (id: string) => { const s = specSections.find((x) => x.ref === id || x.key === id); if (s) { setTab(s.tab); choose(s) } }

  return (
    <div data-ui className="mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader title="Living specification" description="Socra turns the conversation, evidence and marks on the prototype into a real spec. Every inference stays visible and reversible: nothing is confirmed just because Socra suggested it." />

      <Tabs value={tab} onValueChange={(v) => selectTab(v as 'prd' | 'trd')}>
        <TabsList aria-label="Which document" className="!h-10 !w-full !flex-row sm:!w-fit">
          <TabsTrigger value="prd" className="!w-auto flex-1 !justify-center gap-2 px-4 text-sm"><FileText className="size-4" /> Product <span className="max-sm:hidden">requirements</span> <span className="text-xs text-muted-foreground">{tabPercent('prd')}%</span></TabsTrigger>
          <TabsTrigger value="trd" className="!w-auto flex-1 !justify-center gap-2 px-4 text-sm"><Code2 className="size-4" /> Technical <span className="max-sm:hidden">requirements</span> <span className="text-xs text-muted-foreground">{tabPercent('trd')}%</span></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <Section title={`${label} outline`} description={`${tabPercent(tab)}% complete · ${sections.filter((s) => s.status !== 'draft').length} of ${sections.length} past draft`}>
          <div className="px-5 pb-1"><Progress value={tabPercent(tab)} className="mt-3 h-1.5" /></div>
          <nav aria-label={`${label} sections`} className="grid grid-cols-1 p-2">
            {sections.map((s) => (
              <button key={s.id} type="button" onClick={() => choose(s)} aria-current={selected.id === s.id} className={cn('flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent', selected.id === s.id && 'bg-accent', s.review === 'remove' && 'opacity-50 line-through')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', s.confidence === 'high' ? 'bg-primary' : s.confidence === 'medium' ? 'bg-info' : 'bg-warning')} />
                <span className="grid min-w-0 flex-1"><span className="truncate text-sm font-medium">{s.title}</span><span className="truncate text-xs text-muted-foreground">{s.ref} · {s.kicker}</span></span>
                <span className="text-xs text-muted-foreground tabular-nums">{s.completeness}%</span>
              </button>
            ))}
          </nav>
          <p className="flex gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground"><Sparkles className="size-4 shrink-0 text-primary" /> Inference is visible. Nothing becomes confirmed just because Socra suggested it.</p>
        </Section>

        <Section
          title={selected.title}
          description={<span className="flex flex-wrap items-center gap-2"><span>{selected.ref} · {selected.kicker}</span><StatusBadge tone={STATUS_TONE[selected.status] ?? 'off'}>{selected.status.replace(/-/g, ' ')}</StatusBadge><StatusBadge tone={CONF_TONE[selected.confidence] ?? 'info'}>{selected.confidence} confidence</StatusBadge></span>}
        >
          <SectionBody>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Timer className="size-3.5" /> From {selected.source} · {ago(selected.updatedAt)}</span><span>{selected.completeness}% complete</span></p>
            {editing
              ? <Textarea aria-label="Section text" value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} className="min-h-60 text-base md:text-base" />
              : selected.content ? <Prose text={selected.content} /> : <p className="text-base text-muted-foreground">Not yet researched. Ask Socra to probe, or write it in your own words.</p>}
            <div className="flex flex-wrap gap-2">
              {editing ? <>
                <Button onClick={saveRevision}><Check className="size-4" /> Save revision</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </> : <>
                <Button onClick={accept}><Check className="size-4" /> Accept</Button>
                <Button variant="outline" onClick={() => { setDraft(selected.content); setEditing(true) }}><Wand2 className="size-4" /> Revise</Button>
                <Button variant="outline" onClick={() => void review('challenge', 'Challenged in review')} title="Ask Socra what this rests on"><CircleHelp className="size-4" /> Challenge</Button>
                {selected.review === 'remove'
                  ? <Button variant="outline" onClick={() => void review('')}>Bring it back</Button>
                  : <Button variant="outline" onClick={() => void review('remove', 'Removed in review')}><X className="size-4" /> Remove</Button>}
              </>}
            </div>
          </SectionBody>
          <div className="grid grid-cols-1 gap-3 border-t border-border px-5 py-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="spec-state" className="text-xs text-muted-foreground">State</Label>
              <Select value={selected.status} onValueChange={setStatus}>
                <SelectTrigger id="spec-state" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SPEC_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-1.5">
              <p className="text-xs text-muted-foreground">How we know</p>
              <div className="flex flex-wrap items-center gap-1.5"><StatusBadge tone={selected.basis === 'confirmed' ? 'ok' : selected.basis === 'inferred' ? 'suggest' : 'info'}>{SPEC_BASIS.find((b) => b.key === selected.basis)?.label ?? selected.basis}</StatusBadge>{selected.review && <StatusBadge tone="off">{selected.review}{selected.reviewNote ? `: “${selected.reviewNote}”` : ''}</StatusBadge>}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <div className="flex items-center gap-2"><Switch id="spec-review-mode" checked={reviewMode} onCheckedChange={(v) => { setReviewMode(v); if (v) nextOpen() }} /><Label htmlFor="spec-review-mode" className="text-sm">Review one at a time</Label></div>
              {reviewMode && <Button variant="ghost" size="sm" onClick={nextOpen}>Next section <ArrowRight className="size-4" /></Button>}
              <span className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => changeView('truth', `spec:${selected.key}`)}><History className="size-4" /> Why did this change?</Button>
              <Button variant="ghost" size="sm" onClick={() => changeView('conversation')}>Ask Socra to probe <ArrowRight className="size-4" /></Button>
            </div>
          </div>
          <div className="grid gap-2 border-t border-border px-5 py-4">
            <p className="text-xs text-muted-foreground">Related records</p>
            <div className="flex flex-wrap gap-1.5">{selected.related.length ? selected.related.map((id) => <Button key={id} variant="outline" size="sm" onClick={() => related(id)}><Target className="size-3.5" /> {id}</Button>) : <span className="text-sm text-muted-foreground">No linked record yet: a gap worth probing.</span>}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-4">
            <p className="text-sm"><span className="font-semibold">What would make this stronger? </span>{selected.confidence === 'open' ? 'This section needs a human decision or new evidence.' : selected.completeness < 70 ? 'One more focused question could raise confidence.' : 'The shape is strong enough to carry into a thin slice.'}</p>
            <Button variant="outline" size="sm" onClick={() => changeView(selected.confidence === 'open' ? 'conversation' : 'validation')}>{selected.confidence === 'open' ? 'Open the question' : 'Review validation'} <ArrowRight className="size-4" /></Button>
          </div>
        </Section>

        <Section title="How this got here" description="Each step that shaped this section. Click one to see where it lives." className="lg:col-span-2 xl:col-span-1">
          {selected.trace.length === 0 && <Empty>No trace yet: nothing has been said or found about this section.</Empty>}
          {selected.trace.map((step, i) => (
            <button key={`${selected.id}-${i}`} type="button" onClick={() => traceGo(step.type)} className="flex items-start gap-3 border-b border-border px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', TRACE_DOT[step.type] ?? 'bg-muted-foreground')} />
              <span className="grid min-w-0 flex-1 gap-0.5"><span className="text-xs text-muted-foreground">{i + 1} · {step.label}</span><span className="text-sm">{step.detail}</span></span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          <p className="flex gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground"><CircleHelp className="size-4 shrink-0" />{selected.completeness < 70 ? 'One unanswered question is holding this section below pilot-ready.' : 'This section can now inform the next prototype move.'}</p>
        </Section>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SpecImpact live={live} sectionKey={selected.key} />
        <SpecVersions live={live} act={act} />
      </div>
    </div>
  )
}

type Impact = { prd: { key: string; ref: string; title: string }[]; trd: { key: string; ref: string; title: string }[]; backlog: { id: string; title: string }[]; workflows: { id: string; title: string }[]; moves: { id: string; title: string; status: string }[]; artifacts: string[]; linear: { title: string; url: string }[] }

/** What a change to this section touches downstream. */
function SpecImpact({ live, sectionKey }: { live: Live; sectionKey: string }) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const stamp = live.spec.find((s) => s.key === sectionKey)?.updatedAt ?? live.updatedAt
  useEffect(() => {
    void api<Impact>(`/api/use-cases/${live.id}/impact?section=${encodeURIComponent(sectionKey)}`, { cache: 'no-store' }).then(setImpact).catch(() => setImpact(null))
  }, [live.id, sectionKey, stamp])
  const rows: [string, string[]][] = impact ? [
    ['PRD sections', impact.prd.map((s) => `${s.ref} ${s.title}`)],
    ['TRD sections', impact.trd.map((s) => `${s.ref} ${s.title}`)],
    ['Backlog', impact.backlog.map((b) => b.title)],
    ['Agent workflows', impact.workflows.map((b) => b.title)],
    ['Build moves', impact.moves.map((m) => `${m.title} (${m.status})`)],
    ['Generated files', impact.artifacts],
    ['Linear', impact.linear.map((l) => l.title)],
  ] : []
  const total = rows.reduce((n, [, v]) => n + v.length, 0)
  return (
    <Section title={!impact ? 'What a change here touches' : total ? `A change here touches ${total} ${total === 1 ? 'thing' : 'things'}` : 'Nothing else depends on this yet'} description="So you can see the knock-on effects before you change it." action={<Network className="size-4 text-muted-foreground" />}>
      {rows.filter(([, v]) => v.length).map(([k, v]) => <Row key={k} title={<>{k} <span className="font-normal text-muted-foreground">· {v.length}</span></>} detail={<>{v.slice(0, 6).join(' · ')}{v.length > 6 ? ` · and ${v.length - 6} more` : ''}</>} />)}
    </Section>
  )
}

/** One spec version per package, with its diff, and a restore that comes back as a new version. */
function SpecVersions({ live, act }: { live: Live; act: Act }) {
  const [open, setOpen] = useState<number | null>(null)
  const revs = [...live.specRevisions].sort((a, b) => b.version - a.version)
  return (
    <Section title={`Spec versions · ${revs.length}`} description="Every package keeps the spec it was built from." action={<History className="size-4 text-muted-foreground" />}>
      {revs.length === 0 && <Empty>The first version is saved when the first Claude Code package is assembled.</Empty>}
      {revs.map((r, i) => (
        <div key={r.id} className="grid border-b border-border last:border-b-0">
          <div className="flex items-center gap-2 px-5 py-3">
            <button type="button" aria-expanded={open === r.version} onClick={() => setOpen(open === r.version ? null : r.version)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <ChevronDown className={cn('size-4 shrink-0 transition-transform', open === r.version && 'rotate-180')} />
              <span className="grid min-w-0"><span className="text-sm font-semibold">Version {r.version}</span><span className="truncate text-xs text-muted-foreground">{r.reason} · {ago(r.createdAt)}</span></span>
            </button>
            {i > 0 && <Button variant="outline" size="sm" onClick={() => void act(() => api(`/api/use-cases/${live.id}/spec/restore`, { json: { version: r.version } }), `Spec restored to version ${r.version}, saved as a new version`)}>Restore</Button>}
          </div>
          {open === r.version && <pre className="mx-5 mb-3 max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs whitespace-pre-wrap">{r.diff || 'No changes from the version before.'}</pre>}
        </div>
      ))}
    </Section>
  )
}

