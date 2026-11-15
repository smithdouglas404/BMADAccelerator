'use client'
// The flow around the design team's screens: who is working on the product, the next best move, the
// Muse's visible specialists, numbered option chips, checkpoints with Approve and Reject, and the side
// menu's four groups. Built from the team's classes; the few new ones are in studio-extras.css.
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Compass, Layers3, PenTool, Scale, ShieldCheck, Sparkles, Undo2, UserRound, Users, Waves, Wrench, X } from 'lucide-react'
import { ROLES, SPECIALISTS, numberedOptions } from '@/lib/studio/core'
import type { ViewId } from './data'
import { api, initials, type Live, type StudioMessage } from './live'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

/** The Studio's views: the team's ten plus a full-width place to try the product and mark it up. */
export type StudioView = ViewId | 'review'

/** The side menu in four groups, in the order work usually moves. Every one of the team's views stays. */
export const NAV_GROUPS: { title: string; items: { id: StudioView; label: string; hint: string }[] }[] = [
  {
    title: 'Shape it',
    items: [
      { id: 'overview', label: 'Whole product', hint: 'See the shape' },
      { id: 'conversation', label: 'Work with Muse', hint: 'Move the idea' },
      { id: 'product', label: 'Product shape', hint: 'Living PRFAQ' },
      { id: 'spec', label: 'Living specification', hint: 'PRD + TRD, traced' },
    ],
  },
  {
    title: 'Prove it',
    items: [
      { id: 'validation', label: 'Validate use case', hint: 'Test the proof' },
      { id: 'evidence', label: 'Evidence & signals', hint: 'Keep the why' },
      { id: 'readiness', label: 'Pilot readiness', hint: 'Find the ceiling' },
    ],
  },
  {
    title: 'See it',
    items: [{ id: 'review', label: 'Try & mark up', hint: 'The live product' }],
  },
  {
    title: 'Ship it',
    items: [
      { id: 'brief', label: 'Prototype brief', hint: 'Build with Claude Code' },
      { id: 'pilot', label: 'Make it real', hint: 'Trace the build' },
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
    <div className="studio-people">
      <button className="top-avatar studio-avatar-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={me.name ? `${me.name} · ${me.role}` : me.role}>{me.name ? initials(me.name) : roleShort(me.role)}</button>
      {open && (
        <div className="studio-people-menu" role="dialog" aria-label="People on this product">
          <p className="eyebrow">You</p>
          <input className="studio-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <select className="studio-input" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <button className="button button-primary button-small" type="button" onClick={() => void save()}><Check size={13} /> Save</button>
          <p className="eyebrow">On this product · {live.members.length}</p>
          <div className="studio-people-list">
            {live.members.length === 0 && <small className="studio-muted">Only you so far.</small>}
            {live.members.map((m) => <div key={m.id}><span className="avatar">{initials(m.name)}</span><span><strong>{m.name}</strong><small>{m.role}</small></span><button type="button" aria-label={`Remove ${m.name}`} onClick={() => remove(m.id)}><X size={12} /></button></div>)}
          </div>
          <div className="studio-people-add">
            <input className="studio-input" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Add someone" />
            <select className="studio-input" value={other.role} onChange={(e) => setOther({ ...other, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            <button className="button button-quiet button-small" type="button" onClick={() => void add()}><Users size={13} /> Add</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The one thing worth doing next, from where the product actually stands. */
export function nextMove(live: Live): { text: string; view: StudioView; cta: string } | null {
  const said = live.messages.filter((m) => m.role === 'user').length
  const open = live.decisions.filter((d) => d.status === 'open').length
  const unreviewed = live.spec.filter((s) => (s.basis === 'inferred' || s.basis === 'recommended') && !s.review).length
  if (!live.capabilities.length) return { text: 'The Muse is laying out the product. Tell it anything else on your mind meanwhile.', view: 'conversation', cta: 'Talk to the Muse' }
  if (open) return { text: `${open} ${open === 1 ? 'checkpoint needs' : 'checkpoints need'} a decision from you.`, view: 'conversation', cta: 'Decide' }
  if (said < 2) return { text: 'Answer the Muse’s first question: a number, a yes or your own words.', view: 'conversation', cta: 'Answer' }
  if (!live.preview.hasApp && !live.generateBusy) return { text: 'There is enough to build a first version you can click through.', view: 'brief', cta: 'Build it' }
  if (live.preview.hasApp && !live.feedback.length) return { text: 'Try the product and mark anything that should change.', view: 'review', cta: 'Try it' }
  if (unreviewed) return { text: `${unreviewed} spec ${unreviewed === 1 ? 'section was' : 'sections were'} inferred for you. Keep, revise or remove them.`, view: 'spec', cta: 'Review' }
  if (live.validationScore < 60) return { text: 'The use case isn’t proven yet. See which signals are still soft.', view: 'validation', cta: 'Validate' }
  if (live.readiness.overall >= 65) return { text: 'Ready for a thin-slice pilot with real people.', view: 'pilot', cta: 'Make it real' }
  return { text: 'Keep shaping with the Muse; it will say when to build again.', view: 'conversation', cta: 'Continue' }
}

export function NextMove({ live, changeView }: { live: Live; changeView: (v: StudioView) => void }) {
  const m = nextMove(live)
  if (!m) return null
  return <div className="studio-banner studio-next"><Sparkles size={14} /><span><strong>Next best move</strong> {m.text}</span><button type="button" onClick={() => changeView(m.view)}>{m.cta} <ArrowRight size={13} /></button></div>
}

const SPECIALIST_ICON: Record<string, React.ReactNode> = { 'business-analyst': <Scale size={13} />, architect: <Layers3 size={13} />, engineer: <Wrench size={13} />, ux: <PenTool size={13} />, domain: <Compass size={13} /> }
const SPECIALIST_ROUTE: Record<string, string> = { 'business-analyst': 'Business Analyst', architect: 'Solution Architect', engineer: 'Product Engineer', ux: 'UX / Component Mapper', domain: 'Domain Expert' }
export const specialistIcon = (key?: string) => SPECIALIST_ICON[key ?? ''] ?? <UserRound size={13} />

/** The Muse and its specialists, what each is doing, and who you are talking to. */
export function TeamPanel({ live, to, setTo }: { live: Live; to: string; setTo: (k: string) => void }) {
  const domainName = useMemo(() => [...live.messages].reverse().find((m) => m.role === 'agent' && m.addressed === 'domain')?.agent.replace(/ · Specialist$/, ''), [live.messages])
  const state = (key: string) => live.routes.find((r) => r.agent === SPECIALIST_ROUTE[key])
  return (
    <div className="aside-block studio-team">
      <div className="aside-block-header"><span className="eyebrow">The Muse’s team</span><Users size={15} /></div>
      <div className="lens-list">
        <button type="button" className={to === '' ? 'is-active' : ''} onClick={() => setTo('')}><span className="message-avatar muse"><Waves size={12} /></span><span><strong>Muse</strong><small>leads the conversation</small></span>{to === '' ? <Check size={13} /> : <ArrowRight size={13} />}</button>
        {SPECIALISTS.map((s) => {
          const r = state(s.key)
          return <button type="button" key={s.key} className={to === s.key ? 'is-active' : ''} onClick={() => setTo(s.key)} title={`Ask the ${s.name.toLowerCase()}: ${s.focus}`}><span className="message-avatar signal">{SPECIALIST_ICON[s.key]}</span><span><strong>{s.key === 'domain' && domainName ? domainName : s.name}</strong><small>{r?.state === 'active' ? r.detail || 'working now' : r?.state === 'complete' ? 'shared findings' : s.focus}</small></span>{to === s.key ? <Check size={13} /> : <ArrowRight size={13} />}</button>
        })}
      </div>
    </div>
  )
}

export const talkingTo = (key: string, live: Live) => {
  if (!key) return 'the Muse'
  const s = SPECIALISTS.find((x) => x.key === key)
  if (key === 'domain') {
    const n = [...live.messages].reverse().find((m) => m.role === 'agent' && m.addressed === 'domain')?.agent.replace(/ · Specialist$/, '')
    if (n) return `the ${n.toLowerCase()}`
  }
  return `the ${s?.name.toLowerCase() ?? 'Muse'}`
}

/** The numbered choices in the latest Muse or specialist message, as chips that answer with their number. */
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

/** Open checkpoints: what only the people on the product can decide, with Approve, Reject and a comment. */
export function Checkpoints({ live, me, act }: { live: Live; me: Me; act: Act }) {
  const open = live.decisions.filter((d) => d.status === 'open')
  const [notes, setNotes] = useState<Record<string, string>>({})
  if (!open.length) return null
  const by = me.name ? `${me.name} (${me.role})` : `The ${me.role.toLowerCase()}`
  const decide = (id: string, status: 'approved' | 'rejected') => {
    const comment = (notes[id] || '').trim()
    void act(() => api(`/api/use-cases/${live.id}/decisions/${id}`, { method: 'PATCH', json: { status, ...(comment ? { answer: comment } : {}), by } }), status === 'approved' ? 'Approved. The Muse carries it into the product.' : 'Rejected. It stays out of the build; the Muse will suggest another way.')
    setNotes((n) => ({ ...n, [id]: '' }))
  }
  return (
    <div className="studio-checkpoints">
      {open.map((d) => {
        const options = Array.isArray(d.options) ? (d.options as { label?: string }[]).map((o) => o.label).filter(Boolean) : []
        return (
          <article key={d.id} className="message-card signal studio-checkpoint">
            <div className="message-meta"><span className="message-avatar signal"><ShieldCheck size={14} /></span><strong>Checkpoint · needs a person</strong><span>{d.agent && d.agent !== 'Muse' ? `raised by ${d.agent}` : 'raised by the Muse'}</span></div>
            <p>{d.text}{options.length > 0 && <small className="studio-checkpoint-options">Suggested: {options.join(' · ')}</small>}</p>
            <div className="studio-checkpoint-actions">
              <input className="studio-input" value={notes[d.id] || ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} placeholder="Comment (optional): why, or what instead" />
              <button className="button button-primary button-small" type="button" onClick={() => decide(d.id, 'approved')}><Check size={13} /> Approve</button>
              <button className="button button-quiet button-small" type="button" onClick={() => decide(d.id, 'rejected')}><X size={13} /> Reject</button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** Undo on a "Decision captured" card: the approval made by a yes or a pick goes back to open. */
export function UndoChip({ live, decisionId, me, act }: { live: Live; decisionId: string; me: Me; act: Act }) {
  return <button className="decision-chip studio-undo" type="button" onClick={() => void act(() => api(`/api/use-cases/${live.id}/messages`, { method: 'PATCH', json: { undo: decisionId, author: me } }), 'Undone. The decision is open again.')}><Undo2 size={12} /> Undo</button>
}
