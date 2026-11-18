'use client'
// Whole product, and the held-thoughts list it shares with Product shape, on shadcn/ui + Animate UI.
// The backlog's change and withdraw use a dialog instead of the browser's prompt and confirm boxes.
import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, FileText, Layers3, Lightbulb, PenLine, Plus, Sparkles, Timer, Waves, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { api, ago, sessionLine, type Live, type StudioMessage } from './live'
import type { BacklogItem, Capability } from './data'
import type { Me, StudioView } from './flow'
import { Empty, PageHeader, Section, SectionBody, StatusBadge } from './kit'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
export type HeldItem = BacklogItem & { ownerState?: string; annotationId?: string }

const KIND: Record<BacklogItem['kind'], { label: string; icon: ReactNode; tone: 'info' | 'ok' | 'off' }> = {
  capture: { label: 'new thought', icon: <Lightbulb className="size-4" />, tone: 'info' },
  epic: { label: 'part of the product', icon: <Layers3 className="size-4" />, tone: 'ok' },
  distraction: { label: 'parked for later', icon: <Timer className="size-4" />, tone: 'off' },
}

type OverviewProps = {
  live: Live
  act: Act
  me: Me
  selected: Capability
  capabilities: Capability[]
  readiness: Record<string, number>
  overallReadiness: number
  approvalCount: number
  messages: StudioMessage[]
  backlog: HeldItem[]
  focusCapability: (c: Capability) => void
  changeView: (v: StudioView) => void
  capture: string
  setCapture: (v: string) => void
  captureIdea: () => void
  /** The live product preview with mark-up (still on the older styles until Try & mark up moves). */
  preview: ReactNode
}

export function OverviewView({ live, act, me, selected, capabilities, readiness, overallReadiness, approvalCount, messages, backlog, focusCapability, changeView, capture, setCapture, captureIdea, preview }: OverviewProps) {
  const lastSocra = [...messages].reverse().find((m) => m.role === 'muse')
  const lastYou = [...messages].reverse().find((m) => m.role === 'user')
  const clip = (t: string, n = 260) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t)
  return (
    <div data-ui className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title={live.name}
        eyebrow="The whole product"
        headline={<>Make the product <em>legible</em><br />before you make it real.</>}
        description={live.statement || live.description}
        actions={<>
          <Button variant="outline" onClick={() => changeView('product')}><FileText className="size-4" /> Product shape</Button>
          <Button onClick={() => changeView('conversation')}>Continue with Socra <ArrowRight className="size-4" /></Button>
        </>}
      />
      <p className="-mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{live.audience || 'Audience still being named'}</span><span aria-hidden>·</span><span>updated {ago(live.updatedAt)}</span><span aria-hidden>·</span><span>{sessionLine(live.session)}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ready for a thin-slice pilot" value={`${overallReadiness}%`}><Progress value={overallReadiness} className="mt-1 h-1.5" /></Stat>
        <Stat label="Decisions carried forward" value={String(approvalCount)}>{live.decisions.some((d) => d.status === 'open') && <span className="text-xs text-warning">{live.decisions.filter((d) => d.status === 'open').length} waiting for a person</span>}</Stat>
        <Stat label="Thoughts held" value={String(backlog.length)}><span className="text-xs text-muted-foreground">in your words, not tickets</span></Stat>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section statement={<>From the floor <em>to the ceiling.</em></>} title="Where the product can stand today" description={selected.signal || 'Readiness guides what to learn next; it never blocks a build.'} action={<Button variant="ghost" size="sm" onClick={() => changeView('readiness')}>Full readiness <ArrowRight className="size-4" /></Button>}>
          {capabilities.length === 0 && <Empty>Socra is laying the floor: the parts of the product appear here in a moment.</Empty>}
          {capabilities.map((c) => {
            const value = readiness[c.id] ?? c.readiness
            return (
              <button key={c.id} type="button" onClick={() => focusCapability(c)} className={cn('grid gap-1.5 border-b border-border px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60', c.id === selected.id && 'bg-accent/60')}>
                <span className="flex items-center gap-2"><span className="h-4 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.label}</span><span className="text-xs text-muted-foreground tabular-nums">{value}%</span><ArrowRight className="size-4 text-muted-foreground" /></span>
                <Progress value={value} className="h-1" />
                <span className="truncate text-xs text-muted-foreground">{c.kicker}</span>
              </button>
            )
          })}
        </Section>

        <Section statement={<>What Socra is <em>helping you see.</em></>} title="Where the conversation is" description={live.agentBusy ? live.agentStatus || 'Socra is thinking' : `Socra is guiding the ${selected.label.toLowerCase()} conversation`} action={<Button variant="ghost" size="sm" onClick={() => changeView('conversation')}>Open <ArrowRight className="size-4" /></Button>}>
          <SectionBody>
            <div className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Waves className="size-4" /></span>
              <div className="grid gap-1"><p className="text-sm font-semibold">Socra</p><p className="text-base whitespace-pre-line">{clip(lastSocra?.text ?? `Socra is reading what you said about ${live.name} and laying out everything a product like it needs.`)}</p></div>
            </div>
            <div className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">You</span>
              <div className="grid gap-1"><p className="text-sm font-semibold">You</p><p className="text-base whitespace-pre-line text-muted-foreground">{clip(lastYou?.text ?? live.description)}</p></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Check className="size-4 text-primary" /> {approvalCount} {approvalCount === 1 ? "decision" : "decisions"} carried forward</span>
              <Button size="sm" onClick={() => changeView('conversation')}>Keep going <ArrowRight className="size-4" /></Button>
            </div>
          </SectionBody>
        </Section>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3">{preview}</div>

      <HeldThoughts live={live} act={act} me={me} selected={selected} items={backlog} capture={capture} setCapture={setCapture} captureIdea={captureIdea} action={<Button variant="ghost" size="sm" onClick={() => changeView('product')}>Product shape <ArrowRight className="size-4" /></Button>} />
    </div>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return <div className="grid content-start gap-1 rounded-xl border border-border bg-card px-5 py-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p>{children}</div>
}

/** Everything people thought of, held in their words: catch a new one, group it into the product, park it, change it or withdraw it. */
export function HeldThoughts({ live, act, me, selected, items, capture, setCapture, captureIdea, action, limit = 4 }: { live: Live; act: Act; me: Me; selected: Capability; items: HeldItem[]; capture: string; setCapture: (v: string) => void; captureIdea: () => void; action?: ReactNode; limit?: number }) {
  const [all, setAll] = useState(false)
  const [editing, setEditing] = useState<HeldItem | null>(null)
  const [draft, setDraft] = useState('')
  const [withdrawing, setWithdrawing] = useState<HeldItem | null>(null)
  const by = me.name || me.role
  const shown = all ? items : items.slice(0, limit)
  const group = (item: HeldItem, kind: 'epic' | 'distraction') =>
    void act(() => api(`/api/use-cases/${live.id}/backlog/${item.id}`, { method: 'PATCH', json: { kind, group: kind === 'distraction' ? undefined : selected.label } }), kind === 'distraction' ? 'Parked without losing the thought' : `Kept with ${selected.label}`)
  const saveEdit = () => {
    const title = draft.trim()
    if (editing && title && title !== editing.title) void act(() => api(`/api/use-cases/${live.id}/backlog/${editing.id}`, { method: 'PATCH', json: { title, by } }), 'Changed: Socra is carrying it through')
    setEditing(null)
  }
  const withdraw = () => {
    if (withdrawing) void act(() => api(`/api/use-cases/${live.id}/backlog/${withdrawing.id}`, { method: 'PATCH', json: { withdraw: true, by } }), 'Withdrawn, and kept in the history')
    setWithdrawing(null)
  }
  return (
    <Section statement={<>Everything you thought of. <em>Not everything you need to do.</em></>} title={`Thoughts held · ${items.length}`} description="Everything you thought of, in your words. Not everything you need to do." action={action}>
      <div className="flex gap-2 border-b border-border px-5 py-3">
        <Input aria-label="Catch a thought" value={capture} onChange={(e) => setCapture(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') captureIdea() }} placeholder="I keep thinking about…" />
        <Button type="button" onClick={captureIdea} disabled={!capture.trim()}><Plus className="size-4" /> Hold it</Button>
      </div>
      {items.length === 0 && <Empty>Nothing held yet. A half-sentence is enough; Socra finds where it belongs.</Empty>}
      {shown.map((item) => {
        const k = KIND[item.kind] ?? KIND.capture
        return (
          <div key={item.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border px-5 py-3.5 last:border-b-0">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">{k.icon}</span>
            <div className="grid min-w-0 flex-1 basis-64 gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2"><p className="text-base font-medium">{item.title}</p><span className="text-xs text-muted-foreground">{item.age}</span></div>
              {item.note && item.note !== item.title && <p className="text-sm text-muted-foreground">{item.note}</p>}
              {item.annotationId && <a className="block max-w-56 overflow-hidden rounded-lg border border-border" href={`/api/feedback/${item.annotationId}/image`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${item.annotationId}/image`} alt="The marked-up screen" loading="lazy" className="w-full" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} /></a>}
              <div className="flex flex-wrap items-center gap-1.5"><StatusBadge tone={k.tone}>{item.ownerState || k.label}</StatusBadge><span className="text-xs text-muted-foreground">{[item.group, item.source].filter(Boolean).join(' · ')}</span></div>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => group(item, 'epic')} title={`Keep it with ${selected.label}`}><Layers3 className="size-4" /> Keep</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => group(item, 'distraction')} title="Park it for later"><Timer className="size-4" /> Park</Button>
              <Button type="button" size="icon" variant="ghost" className="size-9" aria-label={`Change “${item.title}”`} onClick={() => { setEditing(item); setDraft(item.title) }}><PenLine className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-9" aria-label={`Withdraw “${item.title}”`} onClick={() => setWithdrawing(item)}><X className="size-4" /></Button>
            </div>
          </div>
        )
      })}
      {items.length > limit && <div className="px-5 py-3"><Button type="button" variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`} <ArrowRight className="size-4" /></Button></div>}

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null) }}>
        <DialogContent data-ui className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Change it in your own words</DialogTitle><DialogDescription>Socra carries the change through the spec and the board.</DialogDescription></DialogHeader>
          <Textarea aria-label="The thought" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="text-base md:text-base" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } }} />
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveEdit} disabled={!draft.trim()}><Check className="size-4" /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!withdrawing} onOpenChange={(v) => { if (!v) setWithdrawing(null) }}>
        <AlertDialogContent data-ui>
          <AlertDialogHeader><AlertDialogTitle>Withdraw “{withdrawing?.title}”?</AlertDialogTitle><AlertDialogDescription>It stays in the history, and Socra takes it out of the spec and the board.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={withdraw}>Withdraw</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

/** The next best move, as one line above every screen. */
export function NextMoveBar({ text, cta, onGo }: { text: string; cta: string; onGo: () => void }) {
  return (
    <div data-ui className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm"><span className="font-semibold text-primary">Next best move</span> <span className="text-foreground">{text}</span></p>
        <Button size="sm" onClick={onGo}>{cta} <ArrowRight className="size-4" /></Button>
      </div>
    </div>
  )
}
