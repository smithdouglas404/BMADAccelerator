'use client'
// The flow around the design team's screens: who is working on the product, the next best move, the
// Socra's visible specialists, numbered option chips, checkpoints with Approve and Reject, and the side
// menu's life-cycle path. On shadcn/ui + Animate UI.
import { useEffect, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Compass, Layers3, PenTool, Scale, Undo2, UserRound, Users, Wrench, X } from 'lucide-react'
import { ROLES, SPECIALISTS, numberedOptions, personaOf, type Persona } from '@/lib/studio/core'
import type { ViewId } from './data'
import { api, initials, type Live, type StudioMessage } from './live'
import { journey, needsTriage, hasDetail } from '@/lib/studio/journey'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'


/** The Studio's views: the team's ten plus a full-width place to try the product and mark it up. 'trd' is the
 *  Living specification opened on its technical tab, so the TRD has its own place under Technology. */
export type StudioView = ViewId | 'review' | 'agents' | 'storymap' | 'trd'

export type NavItem = { id: StudioView; label: string; hint: string; tip: string }

/** The side menu (Doug, Nov 18): the path in the order a product is made, numbered, then the tools that help
 *  along the way in their own group. Story first, then talk it through, then PRD, TRD, build, try, ship. */
export const NAV_GROUPS: { title: string; about: string; items: NavItem[] }[] = [
  {
    title: 'Your path',
    about: 'Start at 1 and work down',
    items: [
      { id: 'product', label: '1 · Product story (PRFAQ)', hint: 'Start here: the promise', tip: 'Start here. Write the story first: the press release and FAQ that say what the customer gets and why it matters, before anything is built.' },
      { id: 'conversation', label: '2 · Talk to Socra', hint: 'Talk it through', tip: 'Type or speak what you need in your own words. Socra and its specialists ask questions, and every answer becomes requirements in the PRD.' },
      { id: 'spec', label: '3 · Requirements doc (PRD)', hint: 'What it must do', tip: 'This helps you with the product requirements document (PRD): who it is for, what it must do, acceptance criteria. Keep, revise or remove what Socra inferred.' },
      { id: 'trd', label: '4 · Technical design (TRD)', hint: 'How it will be built', tip: 'This helps with the technical requirements document (TRD): architecture, data, integrations, security and scale, written by the solution architect.' },
      { id: 'pilot', label: '5 · Board (Kanban)', hint: 'Every requirement, and what’s next', tip: 'The Kanban board: everything you or Socra captured. New items are marked red until you deal with them. Pick one to work on it and it moves to Ready to shape. Moving a card asks Socra for the next step.' },
      { id: 'brief', label: '6 · Generate the prototype', hint: 'Build it with Claude Code', tip: 'Press Generate to have Claude Code build a working prototype from your PRD and TRD. You can also download the package as a ZIP.' },
      { id: 'review', label: '7 · Try & mark up', hint: 'Click through it, mark changes', tip: 'Use the prototype and mark anything that should change. Each mark becomes a new backlog item for you to accept.' },
      { id: 'readiness', label: '8 · Ready to pilot?', hint: 'What still holds it back', tip: 'How ready each capability is for a thin-slice pilot with real people, and what is holding it back.' },
      { id: 'connections', label: '9 · Ship: repository & Linear', hint: 'Where the code and work go', tip: 'Connect the Git repository the builds push to, and optionally sync the backlog to Linear.' },
    ],
  },
  {
    title: 'Tools along the way',
    about: 'Use any time',
    items: [
      { id: 'overview', label: 'Whole product', hint: 'Where everything stands', tip: 'One page with the product’s shape, how ready each capability is and what Socra is working on.' },
      { id: 'validation', label: 'Validate use case', hint: 'Is the problem real?', tip: 'Checks the problem, the customer, the evidence and the thin slice. Shows which signals are still soft and what to ask next.' },
      { id: 'evidence', label: 'Evidence & signals', hint: 'Why we believe it', tip: 'Interviews, research and uploads that back each decision, so the why is never lost.' },
      { id: 'storymap', label: 'Story map', hint: 'How the stories connect', tip: 'The user stories laid out along the customer journey, with the links between them.' },
      { id: 'truth', label: 'Product Truth Graph', hint: 'Every decision and why', tip: 'Every statement, decision and change, labelled fact, inference or decision, with what caused it.' },
      { id: 'agents', label: 'Agents', hint: 'The AI helpers it needs', tip: 'The agents the product needs, what each one does, its approvals and its memory.' },
    ],
  },
]

/** The four ways in (Doug, Nov 18). The path stays in life-cycle order for everyone; who you are decides where
 *  you start, which tools sit beside the path, and how Socra talks. Nothing is hidden: the rest is under "More". */
export const PERSONAS: { key: Persona; role: string; label: string; blurb: string; start: StudioView; tools: StudioView[] }[] = [
  { key: 'first', role: 'First-time creator', label: 'First time here', blurb: 'Just say what you need. Socra guides every step in plain words.', start: 'product', tools: ['pilot'] },
  { key: 'owner', role: 'Product owner', label: 'Product owner', blurb: 'Shape the idea, decide priorities, and see it built.', start: 'product', tools: ['pilot', 'overview', 'validation', 'evidence'] },
  { key: 'ba', role: 'Business analyst', label: 'Business analyst', blurb: 'Requirements, flows, rules and acceptance criteria.', start: 'spec', tools: ['pilot', 'validation', 'evidence', 'storymap', 'truth'] },
  { key: 'tech', role: 'Tech lead', label: 'Tech lead / engineer', blurb: 'Architecture, data, integrations, agents and the build.', start: 'trd', tools: ['pilot', 'agents', 'truth', 'storymap'] },
]
export const personaFor = (role: string) => PERSONAS.find((p) => p.key === personaOf(role)) ?? PERSONAS[1]

/** The menu for a persona: the whole path in order, its tools, and every other tool under "More". */
export function menuFor(role: string) {
  const p = personaFor(role)
  const [path, tools] = NAV_GROUPS
  const groups = [path, { ...tools, items: tools.items.filter((i) => p.tools.includes(i.id)) }].filter((g) => g.items.length)
  const more = tools.items.filter((i) => !p.tools.includes(i.id))
  return { persona: p, groups, more }
}

/** Where a use case stands: one percentage and the step that moves it to the next one. */
export function journeyOf(live: Live) {
  const inferred = live.spec.filter((s) => s.basis === 'inferred' || s.basis === 'recommended')
  return journey({
    userMessages: live.messages.filter((m) => m.role === 'user').length,
    openDecisions: live.decisions.filter((d) => d.status === 'open').length,
    approvedDecisions: live.decisions.filter((d) => d.status === 'approved').length,
    needsYou: live.backlog.filter((b) => needsTriage(b)).length,
    reviewedSections: inferred.filter((s) => s.review).length,
    unreviewedSections: inferred.filter((s) => !s.review).length,
    detailedCards: live.moves.filter((m) => m.status !== 'queued' && hasDetail(m.prompt ?? '')).length,
    builds: live.generateCount,
    markups: live.feedback.length,
    validationScore: live.validationScore,
  })
}

export type Me = { name: string; role: string }

/** Who is at this browser: a name and a role, remembered here. Several people can share one product. */
export function useMe(): [Me, (m: Me) => void] {
  const [me, setMeState] = useState<Me>({ name: '', role: 'Product owner' })
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem('studio-me') || 'null') as Me | null
      if (v && typeof v.role === 'string') setMeState({ name: v.name || '', role: v.role })
    } catch { /* private window: keep the default */ }
  }, [])
  const setMe = (m: Me) => {
    setMeState(m)
    try { window.localStorage.setItem('studio-me', JSON.stringify(m)) } catch { /* ignore */ }
  }
  return [me, setMe]
}

export const roleShort = (role: string) => (role === 'Product owner' ? 'PO' : role === 'Product engineer' ? 'PE' : role === 'Business analyst' ? 'BA' : role === 'UX/UI designer' ? 'UX' : role === 'Architect' ? 'AR' : role === 'Tech lead' ? 'TL' : role === 'First-time creator' ? 'NEW' : role === 'Subject-matter expert' ? 'SME' : 'ST')

/** The team's top-bar avatar, opening who you are and who else works on this product. */
export function PeopleMenu({ live, me, setMe, setToast }: { live: Live; me: Me; setMe: (m: Me) => void; setToast: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(me.name)
  const [role, setRole] = useState(me.role)
  const [other, setOther] = useState({ name: '', role: 'Business analyst' })
  useEffect(() => { setName(me.name); setRole(me.role) }, [me.name, me.role])
  const save = async () => {
    const m = { name: name.trim(), role }
    setMe(m)
    if (m.name) await api(`/api/use-cases/${live.id}/members`, { json: m }).catch(() => undefined)
    setToast(m.name ? `You're working as ${m.name}, ${m.role.toLowerCase()}` : `You're working as the ${m.role.toLowerCase()}`)
    setOpen(false)
  }
  const add = async () => {
    if (!other.name.trim()) return
    await api(`/api/use-cases/${live.id}/members`, { json: { name: other.name.trim(), role: other.role } }).catch((e: Error) => setToast(e.message))
    setOther({ name: '', role: other.role })
    setToast('Added. Send them this page’s link: everyone works on the same product.')
  }
  const remove = (id: string) => void api(`/api/use-cases/${live.id}/members?member=${id}`, { method: 'DELETE' }).catch(() => undefined)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" aria-label="People on this product" title={me.name ? `${me.name} · ${me.role}` : me.role} className="grid size-9 place-items-center rounded-full bg-[#5f483a] text-sm font-semibold text-[#f6d8bf] ring-offset-background transition hover:ring-2 hover:ring-primary/50">{me.name ? initials(me.name) : roleShort(me.role)}</button>
      </SheetTrigger>
      <SheetContent data-ui side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border"><SheetTitle className="text-xl">People on this product</SheetTitle><SheetDescription className="text-sm">Every message carries who said it, and Socra answers at each person’s level.</SheetDescription></SheetHeader>
        <div className="grid gap-4 border-b border-border p-4">
          <h3 className="text-base font-semibold">You</h3>
          <div className="grid gap-1.5"><Label htmlFor="me-name" className="text-sm">Your name</Label><Input id="me-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
          <div className="grid gap-1.5"><Label htmlFor="me-role" className="text-sm">Your role</Label><Select value={role} onValueChange={setRole}><SelectTrigger id="me-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
          <Button type="button" onClick={() => void save()} className="justify-self-start gap-1.5"><Check className="size-4" /> Save</Button>
        </div>
        <div className="grid gap-3 p-4">
          <h3 className="text-base font-semibold">On this product · {live.members.length}</h3>
          {live.members.length === 0 && <p className="text-sm text-muted-foreground">Only you so far.</p>}
          <ul className="grid gap-2">{live.members.map((m) => <li key={m.id} className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{initials(m.name)}</span><span className="grid min-w-0 flex-1"><span className="truncate text-sm font-semibold">{m.name}</span><span className="text-xs text-muted-foreground">{m.role}</span></span><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => remove(m.id)}><X className="size-4" /></Button></li>)}</ul>
          <div className="grid gap-2 rounded-lg border border-border p-3">
            <Label htmlFor="add-person" className="text-sm font-medium">Add someone</Label>
            <Input id="add-person" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Their name" />
            <Select value={other.role} onValueChange={(v) => setOther({ ...other, role: v })}><SelectTrigger aria-label="Their role" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
            <Button type="button" variant="outline" onClick={() => void add()} disabled={!other.name.trim()} className="justify-self-start gap-1.5"><Users className="size-4" /> Add</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Where the use case stands as a percentage, and the one step that moves it to the next percentage. */
export function NextMove({ live, changeView }: { live: Live; changeView: (v: StudioView) => void }) {
  const j = journeyOf(live)
  const [open, setOpen] = useState(false)
  const next = j.next
  return (
    <div data-ui className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-8">
      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <span className="text-lg font-semibold tabular-nums text-primary" title="How far this use case has come">{j.percent}%</span>
          <Progress value={j.percent} className="h-2 w-28 shrink-0" aria-label={`${j.percent}% of the way`} />
          <p className="min-w-0 flex-1 basis-64 text-sm">
            {next
              ? <><span className="font-semibold">Next: {next.label}</span> <span className="text-muted-foreground">{next.why}</span> <span className="whitespace-nowrap text-xs font-medium text-primary">+{next.weight}% → {j.percent + next.weight}%</span></>
              : <><span className="font-semibold">Every step done</span> <span className="text-muted-foreground">Keep shaping with Socra; it will say when to build again.</span></>}
          </p>
          <Button type="button" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open} className="text-muted-foreground">{open ? 'Hide steps' : 'All steps'} <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} /></Button>
          <Button type="button" onClick={() => changeView(next ? next.view : 'conversation')}>{next ? next.cta : 'Continue'} <ArrowRight className="size-4" /></Button>
        </div>
        {open && (
          <ol className="grid gap-1 border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {j.steps.map((s) => (
              <li key={s.key}>
                <button type="button" onClick={() => changeView(s.view)} className={cn('flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground', s === next && 'bg-accent text-accent-foreground font-medium')}>
                  {s.done ? <Check className="size-4 shrink-0 text-primary" /> : <span className={cn('size-2 shrink-0 rounded-full mx-1', s === next ? 'bg-primary' : 'bg-border')} />}
                  <span className={cn('min-w-0 flex-1', s.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.done ? 'done' : `+${s.weight}%`}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

const SPECIALIST_ICON: Record<string, React.ReactNode> = { 'business-analyst': <Scale size={13} />, architect: <Layers3 size={13} />, engineer: <Wrench size={13} />, ux: <PenTool size={13} />, domain: <Compass size={13} /> }
export const SPECIALIST_ROUTE: Record<string, string> = { 'business-analyst': 'Business Analyst', architect: 'Solution Architect', engineer: 'Product Engineer', ux: 'UX / Component Mapper', domain: 'Domain Expert' }
export const specialistIcon = (key?: string) => SPECIALIST_ICON[key ?? ''] ?? <UserRound size={13} />


export const talkingTo = (key: string, live: Live) => {
  if (!key) return 'Socra'
  const s = SPECIALISTS.find((x) => x.key === key)
  if (key === 'domain') {
    const n = [...live.messages].reverse().find((m) => m.role === 'agent' && m.addressed === 'domain')?.agent.replace(/ · Specialist$/, '')
    if (n) return `the ${n.toLowerCase()}`
  }
  return `the ${s?.name.toLowerCase() ?? 'Socra'}`
}

/** The numbered choices in the latest Socra or specialist message, as chips that answer with their number. */
export function optionsFrom(messages: StudioMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') return []
    if (m.role === 'signal') continue
    const o = numberedOptions(m.text)
    if (o.length) return o
  }
  return []
}


/** Undo on a "Decision captured" card: the approval made by a yes or a pick goes back to open. */
export function UndoChip({ live, decisionId, me, act }: { live: Live; decisionId: string; me: Me; act: Act }) {
  return <Button type="button" variant="ghost" size="sm" onClick={() => void act(() => api(`/api/use-cases/${live.id}/messages`, { method: 'PATCH', json: { undo: decisionId, author: me } }), 'Undone. The decision is open again.')}><Undo2 className="size-4" /> Undo</Button>
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

const PERSONA_ICON: Record<Persona, typeof Compass> = { first: Compass, owner: UserRound, ba: Scale, tech: Wrench }

/** "Who are you?" the first time someone opens a use case on this browser. They can change it any time. */
export function PersonaPicker({ onPick, forceOpen = false, onClose }: { onPick: (p: (typeof PERSONAS)[number]) => void; forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (forceOpen) { setOpen(true); return }
    try { if (!window.localStorage.getItem('studio-persona-chosen')) setOpen(true) } catch { /* private window: don't nag */ }
  }, [forceOpen])
  const change = (v: boolean) => { setOpen(v); if (!v) onClose?.() }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent data-ui className="sm:max-w-2xl" aria-label="Who are you?">
        <DialogHeader>
          <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">Who are you?</p>
          <DialogTitle className="text-2xl font-semibold tracking-tight">Pick how you work. The Studio fits itself to you.</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">The path stays in order for everyone, from the story to shipping. Who you are decides where you start, which tools sit beside the path, and how Socra talks to you. Nothing is hidden: other tools are under More. Change it any time from the menu.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {PERSONAS.map((p) => {
            const Icon = PERSONA_ICON[p.key]
            return (
              <button key={p.key} type="button" onClick={() => { onPick(p); change(false) }} className="group grid gap-1.5 rounded-lg border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground"><Icon className="size-4" /></span>
                <span className="text-base font-semibold">{p.label}</span>
                <span className="text-sm text-muted-foreground">{p.blurb}</span>
              </button>
            )
          })}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => change(false)}>Decide later</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The menu's "Working as …" line, which reopens the picker. */
export function PersonaSwitch({ me, onPick }: { me: Me; onPick: (p: (typeof PERSONAS)[number]) => void }) {
  const [open, setOpen] = useState(false)
  const p = personaFor(me.role)
  const Icon = PERSONA_ICON[p.key]
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Change who you are: the menu, your starting page and how Socra talks change with it" className="flex min-h-9 w-full items-center gap-2.5 rounded-md border border-sidebar-border bg-background px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><Icon className="size-4" /></span>
        <span className="grid min-w-0 flex-1 leading-tight"><span className="text-xs text-muted-foreground">Working as</span><span className="truncate font-semibold">{p.label}</span></span>
        <span className="text-xs font-medium text-primary">Change</span>
      </button>
      {open && <PersonaPicker forceOpen onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  )
}
