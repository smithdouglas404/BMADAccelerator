'use client'
// The flow around the design team's screens: who is working on the product, the next best move, the
// Socra's visible specialists, numbered option chips, checkpoints with Approve and Reject, and the side
// menu's four groups. On shadcn/ui + Animate UI.
import { useEffect, useState } from 'react'
import { Check, Compass, Layers3, PenTool, Scale, UserRound, Users, Wrench, X } from 'lucide-react'
import { ROLES, SPECIALISTS, numberedOptions } from '@/lib/studio/core'
import type { ViewId } from './data'
import { api, initials, type Live, type StudioMessage } from './live'
import { NextMoveBar } from './overview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'


/** The Studio's views: the team's ten plus a full-width place to try the product and mark it up. */
export type StudioView = ViewId | 'review' | 'agents' | 'storymap'

/** The side menu in four groups, in the order work usually moves. Every one of the team's views stays. */
export const NAV_GROUPS: { title: string; items: { id: StudioView; label: string; hint: string }[] }[] = [
  {
    title: 'Shape it',
    items: [
      { id: 'overview', label: 'Whole product', hint: 'See the shape' },
      { id: 'conversation', label: 'Work with Socra', hint: 'Move the idea' },
      { id: 'product', label: 'Product shape', hint: 'Living PRFAQ' },
      { id: 'spec', label: 'Living specification', hint: 'PRD + TRD, traced' },
    ],
  },
  {
    title: 'Prove it',
    items: [
      { id: 'validation', label: 'Validate use case', hint: 'Test the proof' },
      { id: 'evidence', label: 'Evidence & signals', hint: 'Keep the why' },
      { id: 'truth', label: 'Product Truth Graph', hint: 'See the meaning' },
      { id: 'storymap', label: 'Story map', hint: 'How stories connect' },
      { id: 'readiness', label: 'Pilot readiness', hint: 'Find the ceiling' },
    ],
  },
  {
    title: 'See it',
    items: [
      { id: 'review', label: 'Try & mark up', hint: 'The live product' },
      { id: 'pilot', label: 'Board', hint: 'What is in play' },
    ],
  },
  {
    title: 'Ship it',
    items: [
      { id: 'brief', label: 'Prototype brief', hint: 'Build with Claude Code' },
      { id: 'agents', label: 'Agents', hint: 'What runs, and why' },
      { id: 'connections', label: 'Connections', hint: 'Repository & Linear' },
    ],
  },
]

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

export const roleShort = (role: string) => (role === 'Product owner' ? 'PO' : role === 'Product engineer' ? 'PE' : role === 'Business analyst' ? 'BA' : role === 'UX/UI designer' ? 'UX' : role === 'Architect' ? 'AR' : role === 'Subject-matter expert' ? 'SME' : 'ST')

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

/** The one thing worth doing next, from where the product actually stands. */
export function nextMove(live: Live): { text: string; view: StudioView; cta: string } | null {
  const said = live.messages.filter((m) => m.role === 'user').length
  const open = live.decisions.filter((d) => d.status === 'open').length
  const unreviewed = live.spec.filter((s) => (s.basis === 'inferred' || s.basis === 'recommended') && !s.review).length
  if (!live.capabilities.length) return { text: 'Socra is laying out the product. Tell it anything else on your mind meanwhile.', view: 'conversation', cta: 'Talk to Socra' }
  if (open) return { text: `${open} ${open === 1 ? 'checkpoint needs' : 'checkpoints need'} a decision from you.`, view: 'conversation', cta: 'Decide' }
  if (said < 2) return { text: 'Answer Socra’s first question: a number, a yes or your own words.', view: 'conversation', cta: 'Answer' }
  if (!live.preview.hasApp && !live.generateBusy) return { text: 'There is enough to build a first version you can click through.', view: 'brief', cta: 'Build it' }
  if (live.preview.hasApp && !live.feedback.length) return { text: 'Try the product and mark anything that should change.', view: 'review', cta: 'Try it' }
  if (unreviewed) return { text: `${unreviewed} spec ${unreviewed === 1 ? 'section was' : 'sections were'} inferred for you. Keep, revise or remove them.`, view: 'spec', cta: 'Review' }
  if (live.validationScore < 60) return { text: 'The use case isn’t proven yet. See which signals are still soft.', view: 'validation', cta: 'Validate' }
  if (live.readiness.overall >= 65) return { text: 'Ready for a thin-slice pilot with real people.', view: 'pilot', cta: 'Open the Board' }
  return { text: 'Keep shaping with Socra; it will say when to build again.', view: 'conversation', cta: 'Continue' }
}

export function NextMove({ live, changeView }: { live: Live; changeView: (v: StudioView) => void }) {
  const m = nextMove(live)
  if (!m) return null
  return <NextMoveBar text={m.text} cta={m.cta} onGo={() => changeView(m.view)} />
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


