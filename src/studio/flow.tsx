'use client'
// The flow around the design team's screens: who is working on the product, the next best move, the
// Socra's visible specialists, numbered option chips, checkpoints with Approve and Reject, and the side
// menu's four groups. Built from the team's classes; the few new ones are in studio-extras.css.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, Compass, Layers3, PenTool, Scale, ShieldCheck, Undo2, UserRound, Users, Waves, Wrench, X } from 'lucide-react'
import { ROLES, SPECIALISTS, numberedOptions, personaOf, type Persona } from '@/lib/studio/core'
import type { ViewId } from './data'
import { api, initials, type Live, type StudioMessage } from './live'
import { journey, needsTriage, hasDetail } from '@/lib/studio/journey'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

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
      { id: 'brief', label: '5 · Generate the prototype', hint: 'Build it with Claude Code', tip: 'Press Generate to have Claude Code build a working prototype from your PRD and TRD. You can also download the package as a ZIP.' },
      { id: 'review', label: '6 · Try & mark up', hint: 'Click through it, mark changes', tip: 'Use the prototype and mark anything that should change. Each mark becomes a new backlog item for you to accept.' },
      { id: 'readiness', label: '7 · Ready to pilot?', hint: 'What still holds it back', tip: 'How ready each capability is for a thin-slice pilot with real people, and what is holding it back.' },
      { id: 'connections', label: '8 · Ship: repository & Linear', hint: 'Where the code and work go', tip: 'Connect the Git repository the builds push to, and optionally sync the backlog to Linear.' },
    ],
  },
  {
    title: 'Tools along the way',
    about: 'Use any time',
    items: [
      { id: 'pilot', label: 'Backlog & board', hint: 'Every requirement, and what’s next', tip: 'Everything you or Socra captured lands here. New items are marked red until you work on them, accept or reject them. Moving a card asks Socra for the next step.' },
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

/** Where the use case stands as a percentage, and the one step that moves it to the next percentage. */
export function NextMove({ live, changeView }: { live: Live; changeView: (v: StudioView) => void }) {
  const j = journeyOf(live)
  const [open, setOpen] = useState(false)
  if (!j.next) return <div className="studio-banner studio-next studio-journey"><span className="studio-journey-pct">{j.percent}%</span><span className="studio-journey-track"><span style={{ width: `${j.percent}%` }} /></span><span><strong>Every step done</strong> Keep shaping with Socra; it will say when to build again.</span><button type="button" onClick={() => changeView('conversation')}>Continue <ArrowRight size={13} /></button></div>
  return (
    <div className="studio-journey-wrap">
      <div className="studio-banner studio-next studio-journey">
        <span className="studio-journey-pct" title="How far this use case has come">{j.percent}%</span>
        <span className="studio-journey-track" aria-hidden><span style={{ width: `${j.percent}%` }} /></span>
        <span><strong>Next: {j.next.label}</strong> {j.next.why} <em className="studio-journey-gain">+{j.next.weight}% → {j.percent + j.next.weight}%</em></span>
        <button type="button" className="studio-journey-steps-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide steps' : 'All steps'}</button>
        <button type="button" onClick={() => changeView(j.next!.view)}>{j.next.cta} <ArrowRight size={13} /></button>
      </div>
      {open && <ol className="studio-journey-steps">{j.steps.map((s) => <li key={s.key} className={s.done ? 'is-done' : s === j.next ? 'is-next' : ''}><button type="button" onClick={() => changeView(s.view)}>{s.done ? <Check size={12} /> : <span className="studio-journey-dot" />}<span>{s.label}</span><small>{s.done ? 'done' : `+${s.weight}%`}</small></button></li>)}</ol>}
    </div>
  )
}

const SPECIALIST_ICON: Record<string, React.ReactNode> = { 'business-analyst': <Scale size={13} />, architect: <Layers3 size={13} />, engineer: <Wrench size={13} />, ux: <PenTool size={13} />, domain: <Compass size={13} /> }
const SPECIALIST_ROUTE: Record<string, string> = { 'business-analyst': 'Business Analyst', architect: 'Solution Architect', engineer: 'Product Engineer', ux: 'UX / Component Mapper', domain: 'Domain Expert' }
export const specialistIcon = (key?: string) => SPECIALIST_ICON[key ?? ''] ?? <UserRound size={13} />

/** Socra and its specialists, what each is doing, and who you are talking to. */
export function TeamPanel({ live, to, setTo }: { live: Live; to: string; setTo: (k: string) => void }) {
  const domainName = useMemo(() => [...live.messages].reverse().find((m) => m.role === 'agent' && m.addressed === 'domain')?.agent.replace(/ · Specialist$/, ''), [live.messages])
  const state = (key: string) => live.routes.find((r) => r.agent === SPECIALIST_ROUTE[key])
  return (
    <div className="aside-block studio-team">
      <div className="aside-block-header"><span className="eyebrow">Socra’s team</span><Users size={15} /></div>
      <div className="lens-list">
        <button type="button" className={to === '' ? 'is-active' : ''} onClick={() => setTo('')}><span className="message-avatar muse"><Waves size={12} /></span><span><strong>Socra</strong><small>leads the conversation</small></span>{to === '' ? <Check size={13} /> : <ArrowRight size={13} />}</button>
        {SPECIALISTS.map((s) => {
          const r = state(s.key)
          return <button type="button" key={s.key} className={to === s.key ? 'is-active' : ''} onClick={() => setTo(s.key)} title={`Ask the ${s.name.toLowerCase()}: ${s.focus}`}><span className="message-avatar signal">{SPECIALIST_ICON[s.key]}</span><span><strong>{s.key === 'domain' && domainName ? domainName : s.name}</strong><small>{r?.state === 'active' ? r.detail || 'working now' : r?.state === 'complete' ? 'shared findings' : s.focus}</small></span>{to === s.key ? <Check size={13} /> : <ArrowRight size={13} />}</button>
        })}
      </div>
    </div>
  )
}

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

/** Open checkpoints: what only the people on the product can decide, with Approve, Reject and a comment. */
export function Checkpoints({ live, me, act }: { live: Live; me: Me; act: Act }) {
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
    <div className="studio-checkpoints">
      {open.map((d) => {
        const options = Array.isArray(d.options) ? (d.options as { label?: string }[]).map((o) => o.label).filter(Boolean) : []
        return (
          <article key={d.id} className="message-card signal studio-checkpoint">
            <div className="message-meta"><span className="message-avatar signal"><ShieldCheck size={14} /></span><strong>Checkpoint · needs a person</strong><span>{d.agent && d.agent !== 'Socra' ? `raised by ${d.agent}` : 'raised by Socra'}</span></div>
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

const PERSONA_ICON: Record<Persona, React.ReactNode> = { first: <Compass size={16} />, owner: <UserRound size={16} />, ba: <Scale size={16} />, tech: <Wrench size={16} /> }

/** "Who are you?" the first time someone opens a use case on this browser. They can change it any time. */
export function PersonaPicker({ onPick, forceOpen = false, onClose }: { onPick: (p: (typeof PERSONAS)[number]) => void; forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (forceOpen) { setOpen(true); return }
    try { if (!window.localStorage.getItem('studio-persona-chosen')) setOpen(true) } catch { /* private window: don't nag */ }
  }, [forceOpen])
  if (!open || typeof document === 'undefined') return null
  const close = () => { setOpen(false); onClose?.() }
  // In a portal, so the sidebar's own layout can't trap it.
  return createPortal(
    <div className="app-shell-portal studio-card-overlay studio-guard-overlay" onClick={close}>
      <div className="studio-guard studio-persona" role="dialog" aria-label="Who are you?" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Who are you?</p>
        <h2>Pick how you work. The Studio fits itself to you.</h2>
        <p className="studio-muted" style={{ margin: 0 }}>The path stays in order for everyone, from the story to shipping. Who you are decides where you start, which tools sit beside the path, and how Socra talks to you. Nothing is hidden: other tools are under More. Change it any time from the menu.</p>
        <div className="studio-persona-grid">{PERSONAS.map((p) => (
          <button key={p.key} type="button" className="studio-persona-card" onClick={() => { onPick(p); close() }}>
            <span className="studio-persona-icon">{PERSONA_ICON[p.key]}</span>
            <strong>{p.label}</strong><small>{p.blurb}</small>
          </button>
        ))}</div>
        <div className="studio-guard-actions"><button className="button button-quiet" type="button" onClick={close}>Decide later</button></div>
      </div>
    </div>,
    document.body,
  )
}

/** The menu's "You're working as …" line, which reopens the picker. */
export function PersonaSwitch({ me, onPick }: { me: Me; onPick: (p: (typeof PERSONAS)[number]) => void }) {
  const [open, setOpen] = useState(false)
  const p = personaFor(me.role)
  return (
    <>
      <button type="button" className="studio-persona-switch" onClick={() => setOpen(true)} title="Change who you are: the menu, your starting page and how Socra talks change with it">
        <span className="studio-persona-icon">{PERSONA_ICON[p.key]}</span>
        <span><small>Working as</small><strong>{p.label}</strong></span>
        <span className="studio-persona-change">Change</span>
      </button>
      {open && <PersonaPicker forceOpen onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  )
}
