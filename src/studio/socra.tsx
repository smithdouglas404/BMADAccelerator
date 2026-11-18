'use client'
// Work with Socra, on shadcn/ui + Animate UI: the conversation reads at 16px, Socra's numbered options are
// big tap targets that answer with their number, checkpoints say plainly that a person decides, and the
// composer stays at the bottom of the screen while the conversation scrolls. Every handler is the same
// one the older screen used.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, CircleHelp, Code2, FileText, Mic, MousePointer2, Send, ShieldCheck, Sparkles, Undo2, Waves, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SPECIALISTS, numberedOptions } from '@/lib/studio/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, initials, type Live, type StudioMessage } from './live'
import { SPECIALIST_ROUTE, optionsFrom, roleShort, specialistIcon, talkingTo, type Me, type StudioView } from './flow'
import { PageHeader, StatusBadge } from './kit'
import type { Capability } from './data'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

export type ConversationProps = {
  live: Live
  act: Act
  me: Me
  talkTo: string
  setTalkTo: (k: string) => void
  voice: { listening: boolean; working: boolean; toggle: () => void }
  selected: Capability
  capabilities: Capability[]
  messages: StudioMessage[]
  draft: string
  setDraft: (value: string) => void
  sendMessage: (text?: string) => void
  focusCapability: (capability: Capability) => void
  setToast: (value: string) => void
  changeView: (view: StudioView) => void
  /** The product preview (still on the older screen styles until "Try & mark up" moves). */
  preview: ReactNode
}

const ADDRESSED: Record<string, string> = { 'business-analyst': 'business analyst', ux: 'UX/UI designer', domain: 'domain expert', architect: 'solution architect', engineer: 'product engineer' }

export function ConversationView({ live, act, me, talkTo, setTalkTo, voice, selected, capabilities, messages, draft, setDraft, sendMessage, focusCapability, setToast, changeView, preview }: ConversationProps) {
  const options = optionsFrom(messages)
  // The message the options come from shows them as buttons, so the composer stays small.
  const optionsAt = options.length ? [...messages].reverse().find((m) => m.role !== 'user' && m.role !== 'signal' && numberedOptions(m.text).length)?.id : undefined
  const to = talkingTo(talkTo, live)
  const end = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLDivElement>(null)
  const count = messages.length
  // Open on the newest message, and keep it in view as the conversation grows.
  const first = useRef(true)
  useEffect(() => {
    // The composer sticks to the bottom of the screen, so the newest message sits just above it.
    const toEnd = (behavior: ScrollBehavior) => {
      if (!end.current) return
      const top = end.current.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + (composer.current?.offsetHeight ?? 0) + 16
      window.scrollTo({ top: Math.max(0, top), behavior })
    }
    if (first.current) {
      first.current = false
      const t = window.setTimeout(() => toEnd('auto'), 400)
      return () => window.clearTimeout(t)
    }
    toEnd('smooth')
  }, [count, live.agentBusy])

  return (
    <div data-ui className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 content-start gap-5">
        <PageHeader title="Work with Socra" eyebrow="The room is open" headline={<>Work with <em>Socra.</em></>} description="Talk in your own words. Socra and its team pull out what the product needs, and a yes turns it into a decision." />

        <div className="grid gap-3" aria-live="polite">
          {messages.map((m) => <MessageCard key={m.id} message={m} live={live} me={me} act={act} options={m.id === optionsAt ? options : undefined} onOption={(o) => sendMessage(`${o.n}. ${o.label}`)} />)}
          {live.agentBusy && (
            <article className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3.5">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><Waves className="size-4" /></span>
              <span className="text-base text-muted-foreground"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-primary align-middle" />{live.agentStatus || 'Thinking it through…'}</span>
            </article>
          )}
        </div>

        <Checkpoints live={live} me={me} act={act} />
        <div ref={end} />

        <div ref={composer} className="sticky bottom-0 z-10 -mx-4 grid gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-4 backdrop-blur md:-mx-8 md:px-8">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
            {options.map((o) => (
              <Button key={o.n} type="button" variant="outline" size="sm" title={o.label} className="max-w-72 shrink-0 border-primary/30 bg-primary/5" onClick={() => sendMessage(`${o.n}. ${o.label}`)}>
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{o.n}</span><span className="truncate">{o.label}</span>
              </Button>
            ))}
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => sendMessage('Yes, carry that forward.')}><Check className="size-4" /> Yes, carry that forward</Button>
            {!options.length && <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => sendMessage('The part I can’t explain yet is what should happen next. Ask me one question at a time.')}>I can’t explain the next part yet</Button>}
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => sendMessage('Help me think bigger: what else could this be, and what would make it ours alone?')}><Sparkles className="size-4" /> Help me think bigger</Button>
          </div>
          {talkTo && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone="info">Talking to {to}</StatusBadge>
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setTalkTo('')}>Back to Socra</Button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
            <Textarea
              aria-label={`Message to ${to}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder={voice.listening ? 'Listening… press the mic again when you’re done' : talkTo ? `Ask ${to}…` : 'Say what you’re seeing, wanting, or not sure about…'}
              rows={2}
              className="max-h-60 min-h-12 resize-none border-0 bg-transparent px-2 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant={voice.listening ? 'default' : 'outline'} onClick={voice.toggle} disabled={voice.working} aria-pressed={voice.listening} aria-label={voice.listening ? 'Stop and send what you said' : 'Talk instead of typing'} className={cn('size-10', voice.listening && 'animate-pulse')}>
                  <Mic className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{voice.listening ? 'Stop and send' : 'Talk as long as you like; press again to stop'}</TooltipContent>
            </Tooltip>
            <Button type="button" size="icon" onClick={() => sendMessage()} aria-label={`Send to ${to}`} className="size-10"><Send className="size-5" /></Button>
          </div>
          <p className="hidden flex-wrap justify-between gap-2 text-xs text-muted-foreground sm:flex">
            <span>{voice.listening ? 'Listening until you press the mic again' : voice.working ? 'Turning what you said into text…' : 'Press the mic to talk instead of typing'}</span>
            <span className="hidden sm:inline">Enter sends · Shift + Enter for a new line</span>
          </p>
        </div>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-4">
        <RailCard title="Current focus">
          <div className="grid gap-2 px-4 pb-4">
            <div className="flex items-center gap-2"><span className="h-4 w-1.5 rounded-full" style={{ background: selected.color }} /><h3 className="text-lg font-semibold">{selected.label}</h3></div>
            <p className="text-sm text-muted-foreground">{selected.description || selected.kicker}</p>
            <div className="flex items-center gap-3"><Progress value={selected.readiness} className="h-1.5" /><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{selected.readiness}% ready</span></div>
            <Button type="button" variant="link" size="sm" className="h-auto justify-self-start p-0" onClick={() => setToast(selected.signal || `${selected.label} is ${selected.readiness}% ready${selected.delta ? `: ${selected.delta}` : ''}. Socra asks about it next because it is the capability in focus.`)}><CircleHelp className="size-4" /> Why this now?</Button>
          </div>
        </RailCard>

        <TeamRail live={live} to={talkTo} setTo={setTalkTo} />

        <RailCard title="Move the focus">
          <div className="grid px-2 pb-2">
            {capabilities.map((c) => (
              <button key={c.id} type="button" onClick={() => focusCapability(c)} aria-current={c.id === selected.id} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent', c.id === selected.id && 'bg-accent')}>
                <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.readiness}%</span>
              </button>
            ))}
          </div>
        </RailCard>

        <div className="grid gap-2">
          {preview}
          <Button type="button" variant="outline" onClick={() => changeView('review')}><MousePointer2 className="size-4" /> Try it and mark it up</Button>
        </div>
      </aside>
    </div>
  )
}

function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border border-border bg-card pt-3">
      <h2 className="px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

/** Socra and its specialists; pick one to talk to them directly. */
function TeamRail({ live, to, setTo }: { live: Live; to: string; setTo: (k: string) => void }) {
  const domainName = useMemo(() => [...live.messages].reverse().find((m) => m.role === 'agent' && m.addressed === 'domain')?.agent.replace(/ · Specialist$/, ''), [live.messages])
  const state = (key: string) => live.routes.find((r) => r.agent === SPECIALIST_ROUTE[key])
  const people = [
    { key: '', name: 'Socra', icon: <Waves className="size-4" />, line: 'leads the conversation', lead: true },
    ...SPECIALISTS.map((s) => {
      const r = state(s.key)
      return { key: s.key as string, name: s.key === 'domain' && domainName ? domainName : s.name, icon: specialistIcon(s.key), line: r?.state === 'active' ? r.detail || 'working now' : r?.state === 'complete' ? 'shared findings' : s.focus, lead: false, busy: r?.state === 'active' }
    }),
  ]
  return (
    <RailCard title="Socra’s team">
      <div className="grid px-2 pb-2">
        {people.map((p) => (
          <button key={p.key || 'socra'} type="button" onClick={() => setTo(p.key)} aria-pressed={to === p.key} title={p.lead ? 'Talk to Socra' : `Ask the ${p.name.toLowerCase()} directly`} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent', to === p.key && 'bg-accent')}>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', p.lead ? 'bg-primary text-primary-foreground' : 'bg-info/15 text-info')}>{p.icon}</span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">{p.line}</span>
            </span>
            {to === p.key ? <Check className="size-4 text-primary" /> : 'busy' in p && p.busy ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : <ArrowRight className="size-4 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </RailCard>
  )
}

type Option = { n: number; label: string }
const OPTION_LINE = /^\s*(?:\*\*)?\d{1,2}[.)](?:\*\*)?\s+\S/

function MessageCard({ message, live, me, act, options, onOption }: { message: StudioMessage; live: Live; me: Me; act: Act; options?: Option[]; onOption: (o: Option) => void }) {
  const specialist = !!message.specialist
  const decision = message.role === 'signal' && message.label === 'Decision captured'
  const meta = [message.time, message.addressed ? `to the ${ADDRESSED[message.addressed] ?? message.addressed}` : '', message.raw ? 'spoken' : ''].filter(Boolean).join(' · ')

  if (message.role === 'signal') {
    return (
      <article className={cn('flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3', decision ? 'border-primary/30 bg-primary/5' : 'border-info/25 bg-info/5')}>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', decision ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info')}>{decision ? <Check className="size-4" /> : <Sparkles className="size-4" />}</span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-semibold">{message.label}</strong>{decision && <StatusBadge tone="ok">added to product truth</StatusBadge>}<span className="text-xs text-muted-foreground">{meta}</span></div>
          <p className="text-base whitespace-pre-line">{message.text}</p>
        </div>
        {decision && message.ref && <UndoButton live={live} decisionId={message.ref} me={me} act={act} />}
      </article>
    )
  }

  const user = message.role === 'user'
  const badge = message.author && message.label !== 'You' ? initials(message.author) : message.authorRole ? roleShort(message.authorRole) : 'PO'
  const avatar = user
    ? <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{badge}</span>
    : specialist
      ? <span className="grid size-8 shrink-0 place-items-center rounded-full bg-info/15 text-info">{specialistIcon(message.specialist)}</span>
      : <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">{message.label === 'Claude Code' ? <Code2 className="size-4" /> : <Waves className="size-4" />}</span>
  return (
    <article className={cn('flex gap-3 rounded-xl border px-4 py-3.5', user ? 'border-border bg-secondary/40 sm:ml-12' : specialist ? 'border-info/20 bg-card' : 'border-primary/20 bg-card')}>
      {avatar}
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <strong className="text-sm font-semibold">{message.label}</strong>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </div>
        <p className="text-base leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line">{options ? message.text.split('\n').filter((l) => !OPTION_LINE.test(l)).join('\n').trim() : message.text}</p>
        {options && (
          <div className="mt-1 grid gap-2">
            <p className="text-xs text-muted-foreground">Pick one, or answer in your own words below</p>
            {options.map((o) => (
              <button key={o.n} type="button" onClick={() => onOption(o)} className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-left text-base transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{o.n}</span>
                <span className="min-w-0 flex-1">{o.label}</span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        <MentionedDocuments live={live} text={message.text} />
        {message.ref?.startsWith('ann:') && (
          <a className="mt-1 block max-w-xs overflow-hidden rounded-lg border border-border" href={`/api/feedback/${message.ref.slice(4)}/image`} target="_blank" rel="noreferrer">
            <img src={`/api/feedback/${message.ref.slice(4)}/image`} alt="The marked-up screen" loading="lazy" className="w-full" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
          </a>
        )}
      </div>
    </article>
  )
}

/** Stored documents a message names by file name, each one a chip that opens it. */
function MentionedDocuments({ live, text }: { live: Live; text: string }) {
  const lower = text.toLowerCase()
  const docs = (live.documents ?? []).filter((d) => /\.[a-z0-9]{2,5}$/i.test(d.fileName) && lower.includes(d.fileName.toLowerCase()))
  const seen = new Set<string>()
  const shown = docs.filter((d) => (seen.has(d.fileName) ? false : (seen.add(d.fileName), true)))
  if (!shown.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((d) => <Button key={d.id} type="button" size="sm" variant="outline" className="max-w-full" onClick={() => window.dispatchEvent(new CustomEvent('studio-open-doc', { detail: d.id }))}><FileText className="size-4" /> <span className="truncate">{d.fileName}</span> <ArrowRight className="size-4" /></Button>)}
    </div>
  )
}

/** Undo on a "Decision captured" card: the approval made by a yes or a pick goes back to open. */
function UndoButton({ live, decisionId, me, act }: { live: Live; decisionId: string; me: Me; act: Act }) {
  return <Button type="button" variant="ghost" size="sm" onClick={() => void act(() => api(`/api/use-cases/${live.id}/messages`, { method: 'PATCH', json: { undo: decisionId, author: me } }), 'Undone. The decision is open again.')}><Undo2 className="size-4" /> Undo</Button>
}

/** What only a person may decide: Approve or Reject, with an optional comment. */
function Checkpoints({ live, me, act }: { live: Live; me: Me; act: Act }) {
  const open = live.decisions.filter((d) => d.status === 'open')
  const [notes, setNotes] = useState<Record<string, string>>({})
  if (!open.length) return null
  const by = me.name ? `${me.name} (${me.role})` : `The ${me.role.toLowerCase()}`
  const decide = (id: string, status: 'approved' | 'rejected') => {
    const comment = (notes[id] || '').trim()
    void act(() => api(`/api/use-cases/${live.id}/decisions/${id}`, { method: 'PATCH', json: { status, ...(comment ? { answer: comment } : {}), by } }), status === 'approved' ? 'Approved. Socra carries it into the product.' : 'Rejected. It stays out of the build; Socra will suggest another way.')
    setNotes((n) => ({ ...n, [id]: '' }))
  }
  return (
    <div className="grid gap-3">
      {open.map((d) => {
        const options = Array.isArray(d.options) ? (d.options as { label?: string }[]).map((o) => o.label).filter(Boolean) : []
        return (
          <article key={d.id} className="grid gap-3 rounded-xl border border-warning/35 bg-warning/5 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-warning/15 text-warning"><ShieldCheck className="size-4" /></span>
              <strong className="text-sm font-semibold">Checkpoint: a person decides</strong>
              <span className="text-xs text-muted-foreground">{d.agent && d.agent !== 'Socra' ? `raised by ${d.agent}` : 'raised by Socra'}</span>
            </div>
            <p className="text-base">{d.text}</p>
            {options.length > 0 && <p className="text-sm text-muted-foreground">Suggested: {options.join(' · ')}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Comment on this checkpoint" className="min-w-48 flex-1" value={notes[d.id] || ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} placeholder="Comment (optional): why, or what instead" />
              <Button type="button" size="sm" onClick={() => decide(d.id, 'approved')}><Check className="size-4" /> Approve</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => decide(d.id, 'rejected')}><X className="size-4" /> Reject</Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
