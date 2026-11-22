'use client'

// The Board (Doug, Nov 16): the team's Kanban made fully usable. Cards still move themselves (Socra, the
// builds and people's answers move them), but a person can also drag a card or use its arrows, open a
// card to see and edit everything on it, add a card, and attach files. Every change is logged and Socra
// hears it. Built on the design team's kanban classes; new pieces are styled in studio-extras.css.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, FileText, History, MessageCircleQuestion, Network, Paperclip, Play, Plus, Target, Upload, X } from 'lucide-react'
import { dayLabel, deferredUntil, hasDetail, needsTriage } from '@/lib/studio/journey'
import { ASSISTANT_NAME } from '@/lib/brand'
import { api, ago, type Live } from './live'
import type { Me, StudioView } from './flow'
import { DocumentPanel } from './sources'
import { SaveButton, useSaveState } from './savestate'
import { ItemQuestions, ItemTraceability, useItemTrace } from './itemtrace'

type Status = 'queued' | 'ready' | 'building' | 'review' | 'done'
const COLUMNS: { id: Status; label: string; description: string }[] = [
  // Ready to shape comes first (Doug, Nov 21): what arrives (from Muse, Socra, a mark-up) waits there to be
  // shaped, then goes to Backlog to hold or straight on to Being made real.
  { id: 'ready', label: 'Ready to shape', description: 'New: shape it, then hold or make it real' },
  { id: 'queued', label: 'Backlog', description: 'Worth holding' },
  { id: 'building', label: 'Being made real', description: 'Agent + human in motion' },
  { id: 'review', label: 'Human review', description: 'Decide what ships' },
  { id: 'done', label: 'Done', description: 'Shipped, still traceable' },
]
const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label])) as Record<Status, string>
const ORDER = COLUMNS.map((c) => c.id)
const KINDS = ['story', 'epic', 'task', 'workflow', 'capability']

type CardDetail = {
  move: { id: string; title: string; capability: string; decision: string; prompt: string; status: Status; owner: string; signal: string; hidden: string; components: string[]; routes: string[]; trackerUrl: string; movedBy: string; moveReason: string; updatedAt: string }
  history: { id: string; kind: string; summary: string; by: string; createdAt: string }[]
  files: { id: string; fileName: string; mimeType: string; sizeBytes: number; summary: string; createdAt: string }[]
}

type Props = { live: Live; me: Me; buildNow: (opts?: { force?: boolean }) => void; changeView: (v: StudioView) => void; setToast: (v: string) => void; children?: React.ReactNode }

const ownerMark = (o: string) => (o === 'Claude Code' ? 'C' : o === 'UX agent' ? 'U' : o === 'Product owner' ? 'PO' : o.slice(0, 1).toUpperCase() || 'A')
/** Socra writes some lines with record ids (move:…, backlog:…); show the card's name instead. */
const plain = (text: string, live: Live) =>
  text.replace(/\b(move|backlog|msg|decision):([a-z0-9]{8,})/gi, (all, kind: string, ref: string) => {
    const hit = kind === 'move' ? live.moves.find((m) => m.id === ref)?.title : kind === 'backlog' ? live.backlog.find((b) => b.id === ref)?.title : undefined
    return hit ? `“${hit}”` : kind === 'move' || kind === 'backlog' ? 'another card' : all
  })
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

export function BoardView({ live, me, buildNow, changeView, setToast, children, openNode }: Props & { openNode?: string }) {
  const by = me.name || me.role || 'A person'
  // Moves show at once on this screen, before the next refresh confirms them.
  const [local, setLocal] = useState<Record<string, Status>>({})
  const [dragging, setDragging] = useState('')
  const [over, setOver] = useState<Status | ''>('')
  const [open, setOpen] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // What a move asks for next (Ready asks for detail, Being made real checks Generate has something to build).
  const [guide, setGuide] = useState<{ id: string; status: Status } | null>(null)
  const [triaging, setTriaging] = useState('')
  useEffect(() => { setLocal({}) }, [live.updatedAt])
  // New backlog items: what someone said to Socra, a mark-up, or Socra's own suggestion, until a person deals with it.
  // Deferred items keep their place, greyed, until their day; then they need a person again.
  const fresh = live.backlog.filter((b) => needsTriage(b) || ((b.triage === 'working' || b.triage === 'deferred') && b.state !== 'built' && b.kind !== 'distraction'))
  const waiting = fresh.filter((b) => needsTriage(b)).length
  // A new item is decided in its detail view (click it): Accept (asks "work on this now?"), Defer or Reject. Never on the card.
  const [pick, setPick] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [deferring, setDeferring] = useState(false)
  const [startOn, setStartOn] = useState('')
  const [until, setUntil] = useState(() => inDays(14))
  // "Yes, work on it now" opens the new card at once; so does a link from another screen (?view=pilot&node=move:<id>).
  useEffect(() => { const n = openNode ?? ''; if (n.startsWith('move:')) { setOpen(n.slice(5)); setStartOn(n.slice(5)) } }, [openNode])
  const triage = async (itemId: string, to: 'working' | 'accepted' | 'rejected' | 'deferred', now = false, day = '') => {
    const item = live.backlog.find((b) => b.id === itemId)
    setTriaging(itemId)
    try {
      const res = await api<{ moveId?: string }>(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { triage: to, by, ...(now ? { ready: true } : {}), ...(day ? { until: day } : {}) } })
      setPick(''); setConfirm(false); setDeferring(false)
      if (now && res?.moveId) { setOpen(res.moveId); setStartOn(res.moveId); setToast(`“${item?.title ?? 'It'}” is in Ready to shape. Fill in what you know; ${ASSISTANT_NAME}'s questions are at the top.`); return }
      if (to === 'working') { setToast(`${ASSISTANT_NAME} is opening up “${item?.title ?? 'it'}”. Answer its questions here.`); changeView('conversation') }
      else setToast(to === 'accepted' ? (now ? `“${item?.title ?? 'It'}” is in Ready to shape, and ${ASSISTANT_NAME} is shaping it.` : `Accepted. “${item?.title ?? 'It'}” is on the Board in Backlog, and ${ASSISTANT_NAME} will shape it.`) : to === 'deferred' ? `Deferred until ${day ? dayLabel(`${day}T00:00:00`) : 'later'}. “${item?.title ?? 'It'}” keeps its place and turns red again that day.` : `Rejected. It stays in the history and out of the product.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setTriaging('') }
  }

  const cards = live.moves.map((m) => ({ ...m, status: (local[m.id] ?? (ORDER.includes(m.status as Status) ? m.status : 'queued')) as Status }))

  const move = async (id: string, status: Status, why = '') => {
    const card = cards.find((c) => c.id === id)
    if (!card || card.status === status) return
    setLocal((l) => ({ ...l, [id]: status }))
    try {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { status, by, why } })
      const forward = ORDER.indexOf(status) > ORDER.indexOf(card.status)
      if (forward && (status === 'ready' || status === 'building' || status === 'review')) { setGuide({ id, status }); setOpen(id) }
      setToast(status === 'done' ? `“${card.title}” is done. It stays traceable to its decision.` : `“${card.title}” moved to ${LABEL[status]}${ORDER.indexOf(status) < ORDER.indexOf(card.status) ? `. ${ASSISTANT_NAME} will ask what isn’t right yet, on the card and in the conversation.` : `. ${ASSISTANT_NAME} and the specialist are looking at it: their questions show on the card.`}`)
    } catch (e) {
      setLocal((l) => { const n = { ...l }; delete n[id]; return n })
      setToast(e instanceof Error ? e.message : String(e))
    }
  }
  const step = (id: string, dir: 1 | -1) => {
    const c = cards.find((x) => x.id === id)
    if (!c) return
    const next = ORDER[ORDER.indexOf(c.status) + dir]
    if (next) void move(id, next)
  }
  const add = async () => {
    const title = newTitle.trim()
    if (!title) return
    try {
      const m = await api<{ id: string }>(`/api/use-cases/${live.id}/moves`, { json: { title, by } })
      setNewTitle(''); setAdding(false); setOpen(m.id)
      setToast(`Card added to the Backlog. ${ASSISTANT_NAME} will shape it.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }

  return <div className="page-wrap pilot-page">
    <div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />The build stays connected to the why</p><h1>Make the next move<br /><em>traceable.</em></h1><p>Cards move themselves as {ASSISTANT_NAME}, the builds and your answers settle them. You can also drag a card, use its arrows, or open it to read and edit everything on it and attach files. Every change is logged and {ASSISTANT_NAME} hears it.</p></div>
      <div className="intro-actions"><button className="button button-primary" type="button" onClick={() => buildNow()} disabled={live.generateBusy}><Play size={15} /> {live.generateBusy ? 'Building…' : 'Stage pilot build'}</button><button className="button button-quiet" type="button" onClick={() => setAdding(true)}><Plus size={15} /> Add a card</button><span><Network size={14} /> {cards.length} cards · {cards.filter((c) => c.status === 'done').length} done</span></div></div>

    <div className="kanban-board studio-board">{COLUMNS.map((col) => {
      // Newest first (Doug, Nov 21): cards arrive in the order they were made, so the latest goes on top.
      const items = cards.filter((c) => c.status === col.id).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      // Ready to shape holds new items and cards together, in one newest-first list.
      const rows: ({ at: string; triage: (typeof fresh)[number] } | { at: string; card: (typeof items)[number] })[] = [
        ...(col.id === 'ready' ? fresh.map((b) => ({ at: b.createdAt, triage: b })) : []),
        ...items.map((c) => ({ at: c.createdAt ?? '', card: c })),
      ].sort((a, b) => b.at.localeCompare(a.at))
      return <section key={col.id} className={`kanban-column ${col.id} ${over === col.id ? 'is-drop' : ''}`}
        onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(col.id) } }}
        onDragLeave={() => setOver((o) => (o === col.id ? '' : o))}
        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragging; setOver(''); setDragging(''); if (id) void move(id, col.id, 'dragged on the Board') }}>
        <div className="kanban-column-header"><div><strong>{col.label}</strong><small>{col.description}</small></div><span title={col.id === 'ready' && fresh.length ? `${items.length} ${items.length === 1 ? 'card' : 'cards'} and ${fresh.length} new ${fresh.length === 1 ? 'item' : 'items'}` : undefined}>{rows.length}</span></div>
        <div className="kanban-cards">
          {col.id === 'ready' && waiting > 0 && <p className="studio-triage-head"><span className="studio-red-dot" /> {waiting} new · needs you</p>}
          {col.id === 'ready' && adding && <div className="build-card studio-board-new"><input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(false) }} placeholder="What should the product do?" /><div><button className="button button-primary button-small" type="button" onClick={() => void add()} disabled={!newTitle.trim()}><Check size={12} /> Add</button><button className="button button-quiet button-small" type="button" onClick={() => setAdding(false)}>Cancel</button></div></div>}
          {rows.map((row) => {
            if ('triage' in row) { const b = row.triage

            const from = b.state === 'suggested' || b.state === 'probing' ? `${ASSISTANT_NAME} suggests` : b.annotationId || /mark/i.test(b.source) ? 'From a mark-up' : /Socra|Muse/i.test(b.source) ? `From ${ASSISTANT_NAME}` : 'You said'
            const later = deferredUntil(b); const back = b.triage === 'deferred' && !later
            return <article key={b.id} className={`build-card studio-board-card ${later ? 'studio-deferred-card' : needsTriage(b) ? 'studio-triage-card' : ''}`} aria-label={`Open ${b.title} to decide`} tabIndex={0} role="button"
              onClick={() => { setConfirm(false); setDeferring(false); setPick(b.id) }} onKeyDown={(e) => { if (e.key === 'Enter') { setConfirm(false); setDeferring(false); setPick(b.id) } }}>
              <div className="build-card-top"><span className="studio-triage-tag">{later ? <>Deferred · {later.getFullYear() > 9000 ? 'no date' : `back ${dayLabel(later)}`}</> : back ? <><span className="studio-red-dot" /> Back from deferral</> : b.triage === 'working' ? <><MessageCircleQuestion size={11} /> Working on it</> : <><span className="studio-red-dot" /> New · {from}</>}</span><small className="studio-board-kind">{ago(b.createdAt)}</small></div>
              <h3>{b.title}</h3>
              {b.note && <p className="studio-moved-by">{b.note.slice(0, 160)}</p>}
              {!later && <p className="studio-triage-open">Open it to accept, defer or reject <ArrowRight size={12} /></p>}
            </article>
            }
            const item = row.card
            return <article key={item.id} className={`build-card studio-board-card ${dragging === item.id ? 'is-dragging' : ''}`} draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; setDragging(item.id) }}
            onDragEnd={() => { setDragging(''); setOver('') }}
            onClick={() => setOpen(item.id)} onDoubleClick={() => setOpen(item.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(item.id) }} tabIndex={0} role="button" aria-label={`Open ${item.title}`}>
            <div className="build-card-top"><span className={`status-pill ${item.status === 'done' ? 'review' : item.status}`}>{item.signal || LABEL[item.status].toUpperCase()}</span><small className="studio-board-kind">{[item.hidden && item.hidden !== 'story' ? item.hidden : '', item.createdAt ? ago(item.createdAt) : ''].filter(Boolean).join(' · ')}</small></div>
            <h3>{item.title}</h3>
            {(item.capability || item.decision) && <div className="build-trace">{item.capability && <span><Target size={13} /> {item.capability}</span>}{item.decision && <span><Check size={13} /> “{item.decision}”</span>}</div>}
            {item.moveReason && <p className="studio-moved-by"><History size={11} /> {item.movedBy || 'Moved'}: {item.moveReason}</p>}
            <div className="build-card-footer"><span className="owner-avatar">{ownerMark(item.owner)}</span><small>{item.owner}</small>
              <span className="studio-board-arrows">
                <button className="card-next" type="button" disabled={item.status === ORDER[0]} aria-label="Move back" title={item.status === ORDER[0] ? '' : `Back to ${LABEL[ORDER[ORDER.indexOf(item.status) - 1]]}`} onClick={(e) => { e.stopPropagation(); step(item.id, -1) }}><ArrowLeft size={14} /></button>
                <button className="card-next" type="button" disabled={item.status === 'done'} aria-label="Move forward" title={item.status === 'done' ? '' : `On to ${LABEL[ORDER[ORDER.indexOf(item.status) + 1]]}`} onClick={(e) => { e.stopPropagation(); step(item.id, 1) }}><ArrowRight size={14} /></button>
              </span></div>
          </article>
          })}
          {items.length === 0 && !(col.id === 'ready' && (adding || fresh.length > 0)) && <div className="empty-column">{dragging ? 'Drop it here.' : <>Nothing here yet.<br />That’s okay — the shape is still moving.</>}</div>}
        </div>
      </section>
    })}</div>

    {children}
    <div className="pilot-footer"><div><span className="live-pulse" /> {live.agentBusy ? `${ASSISTANT_NAME}: ${live.agentStatus || 'working'}` : waiting ? `${waiting} new ${waiting === 1 ? 'item waits' : 'items wait'} on you` : `${cards.filter((c) => c.status !== 'done').length} cards in motion, ${cards.filter((c) => c.status === 'done').length} done`}</div><button className="text-button" type="button" onClick={() => changeView('storymap')}>See how the stories connect <ArrowRight size={14} /></button></div>
    {(() => { const b = fresh.find((x) => x.id === pick); if (!b) return null; const close = () => { setPick(''); setConfirm(false); setDeferring(false) }; const busy = triaging === b.id; const later = deferredUntil(b)
      return <div className="studio-card-overlay" onClick={(e) => { if (e.detail < 2) close() }}><aside className="studio-card-panel" onClick={(e) => e.stopPropagation()} aria-label="Backlog item details">
        <div className="studio-card-head"><p className="eyebrow">{later ? `Deferred · ${later.getFullYear() > 9000 ? 'no date set' : `back on ${dayLabel(later)}`}` : 'New on the Board · needs you'}</p><button className="icon-button subtle" type="button" onClick={close} aria-label="Close"><X size={16} /></button></div>
        <h3>{!later && <span className="studio-red-dot" />} {b.title}</h3>
        <p>{b.note || 'No more detail yet.'}</p>
        <div className="backlog-tags"><span>{b.source}</span><span>{ago(b.createdAt)}</span>{b.triage === 'working' && <span>{ASSISTANT_NAME} is asking about it</span>}</div>
        {b.annotationId && <a className="studio-markup-thumb" href={`/api/feedback/${b.annotationId}/image`} target="_blank" rel="noreferrer"><img src={`/api/feedback/${b.annotationId}/image`} alt="The marked-up screen" loading="lazy" /></a>}
        {!confirm && !deferring && <div className="studio-detail-actions"><button type="button" className="button button-primary" disabled={busy} onClick={() => setConfirm(true)}><Check size={14} /> Accept</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => { setUntil(inDays(14)); setDeferring(true) }}>{later ? 'Change the date' : 'Defer'}</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => void triage(b.id, 'rejected')}><X size={14} /> Reject</button></div>}
        {deferring && <DeferAsk until={until} setUntil={setUntil} busy={busy} onDefer={() => void triage(b.id, 'deferred', false, until)} onCancel={() => setDeferring(false)} />}
        {confirm && <div className="studio-work-ask" role="group" aria-label="Work on this now?"><strong>Work on this now?</strong><small>Yes puts it in Ready to shape and {ASSISTANT_NAME} starts shaping it. No adds it to the Backlog column.</small><span><button type="button" className="button button-primary button-small" disabled={busy} onClick={() => void triage(b.id, 'accepted', true)}>Yes, work on it now</button><button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => void triage(b.id, 'accepted')}>Not yet, add to Backlog</button></span></div>}
        {b.triage !== 'working' && <button className="text-button" type="button" disabled={busy} onClick={() => void triage(b.id, 'working')}><MessageCircleQuestion size={13} /> Not sure yet? Talk it through with {ASSISTANT_NAME}</button>}
        <ItemRecord live={live} me={me} node={`backlog:${b.id}`} setToast={setToast} />
      </aside></div> })()}
    {open && <CardPanel key={open} live={live} me={me} id={open} by={by} guide={guide?.id === open ? guide.status : undefined} start={startOn === open} onClose={() => { setOpen(''); setGuide(null); setStartOn('') }} onMove={(s) => void move(open, s, 'moved from the card')} setToast={setToast} buildNow={buildNow} changeView={changeView} />}
  </div>
}

/** An item's questions and Traceability, from the record (shared with the Product page's backlog detail). */
export function ItemRecord({ live, me, node, setToast }: { live: Live; me: Me; node: string; setToast: (v: string) => void }) {
  const { trace, error, reload } = useItemTrace(live, node)
  return <>
    <ItemQuestions live={live} me={me} node={node} trace={trace} reload={reload} setToast={setToast} />
    <ItemTraceability trace={trace} error={error} plain={(t) => plain(t, live)} />
  </>
}

function CardPanel({ live, me, id, by, guide, start = false, onClose, onMove, setToast, buildNow, changeView }: { live: Live; me: Me; id: string; by: string; guide?: Status; start?: boolean; onClose: () => void; onMove: (s: Status) => void; setToast: (v: string) => void; buildNow: (opts?: { force?: boolean }) => void; changeView: (v: StudioView) => void }) {
  const details = useRef<HTMLTextAreaElement>(null)
  const [docOpen, setDocOpen] = useState('')
  const [d, setD] = useState<CardDetail | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Partial<CardDetail['move']>>({})
  const { state: saveState, run: runSave, reset: resetSave } = useSaveState()
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // A double-click opens the card on its first click; its second click must not land on the backdrop and close it.
  const openedAt = useRef(Date.now())
  const load = useCallback(async () => {
    try { setD(await api<CardDetail>(`/api/use-cases/${live.id}/moves/${id}`, { cache: 'no-store' })) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [live.id, id])
  useEffect(() => { void load() }, [load, live.updatedAt])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const m = d?.move
  const val = <K extends keyof CardDetail['move']>(k: K) => (draft[k] ?? m?.[k] ?? '') as CardDetail['move'][K]
  // Criteria written as one run ("1. Given… 2. Given…") show one per line; the text itself is unchanged until someone edits it.
  const promptShown = draft.prompt ?? oneCriterionPerLine(m?.prompt ?? '')
  const dirty = m ? (Object.keys(draft) as (keyof CardDetail['move'])[]).some((k) => draft[k] !== m[k]) : false
  const save = async () => {
    if (!m || !dirty) return
    if (!String(val('title')).trim()) { setToast('A card needs a title.'); return }
    const ok = await runSave(async () => {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { ...draft, by } })
      setDraft({}); await load()
    })
    if (ok) setToast(`Saved. ${ASSISTANT_NAME} will carry the change into the spec.`)
  }
  const attach = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('by', by)
    setUploading(true)
    try {
      const res = await fetch(`/api/use-cases/${live.id}/moves/${id}/files`, { method: 'POST', body: form })
      const body = (await res.json().catch(() => ({}))) as { error?: string; skipped?: string[] }
      if (!res.ok) throw new Error(body.error || 'The upload did not go through')
      await load()
      setToast(`${files.length === 1 ? files[0].name : `${files.length} files`} attached. ${ASSISTANT_NAME} is reading ${files.length === 1 ? 'it' : 'them'}.${body.skipped?.length ? ` Too big to attach: ${body.skipped.join(', ')}.` : ''}`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }

  return <div className="studio-card-overlay" onClick={() => { if (Date.now() - openedAt.current > 450) onClose() }}>
    <aside className="studio-card-panel" onClick={(e) => e.stopPropagation()} aria-label="Card details"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void attach(e.dataTransfer.files) }}>
      {docOpen && <DocumentPanel live={live} docId={docOpen} onClose={() => setDocOpen('')} />}
      <div className="studio-card-head"><p className="eyebrow">{m ? `${LABEL[m.status] ?? m.status}${m.hidden ? ` · ${m.hidden}` : ''}` : 'Card'}</p><button className="icon-button subtle" type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      {!m ? <p className="studio-muted">{error || 'Opening the card…'}</p> : <>
        <textarea className="studio-card-title" rows={2} value={val('title')} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
        {start && <div className="studio-start-here"><p><strong>You chose to work on this now.</strong> Answer {ASSISTANT_NAME}&apos;s questions below as they arrive, or write what you know straight into <button type="button" className="text-button" onClick={() => { details.current?.focus(); details.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }}>Details and acceptance criteria</button>.</p><ItemRecord live={live} me={me} node={`move:${id}`} setToast={setToast} /></div>}
        {guide && <MoveGuide status={guide} detailed={hasDetail(String(val('prompt')))} busy={live.generateBusy} hasApp={live.preview.hasApp}
          onDetail={() => { details.current?.focus(); details.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }}
          onSocra={() => { onClose(); changeView('conversation') }}
          onGenerate={() => { onClose(); buildNow({ force: true }) }}
          onTry={() => { onClose(); changeView('review') }} />}
        <div className="studio-card-status">{COLUMNS.map((c) => <button key={c.id} type="button" className={m.status === c.id ? 'is-active' : ''} onClick={() => { if (m.status !== c.id) { onMove(c.id); setD({ ...d!, move: { ...m, status: c.id } }) } }}>{c.label}</button>)}</div>
        <div className="studio-card-grid">
          <label><span>Area</span><input value={val('capability')} onChange={(e) => setDraft({ ...draft, capability: e.target.value })} placeholder="Which capability" /></label>
          <label><span>Owner</span><input value={val('owner')} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></label>
          <label><span>Kind</span><select value={val('hidden') || 'story'} onChange={(e) => setDraft({ ...draft, hidden: e.target.value })}>{[...new Set([...KINDS, m.hidden || 'story'])].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label><span>Tag</span><input value={val('signal')} onChange={(e) => setDraft({ ...draft, signal: e.target.value })} placeholder="e.g. THIN SLICE" /></label>
        </div>
        <label className="studio-card-field"><span>Decision it traces to</span><textarea rows={2} value={val('decision')} onChange={(e) => setDraft({ ...draft, decision: e.target.value })} placeholder="The decision or promise this card delivers" /></label>
        <label className="studio-card-field"><span>Details and acceptance criteria</span><textarea ref={details} rows={8} value={promptShown} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="What it does, for whom, and how we'll know it works" /></label>
        <div className="studio-card-actions"><SaveButton state={saveState} disabled={!dirty} onClick={() => void save()} />{dirty && <button className="button button-quiet button-small" type="button" onClick={() => { setDraft({}); resetSave() }}>Undo edits</button>}</div>

        <section className="studio-card-section"><div className="studio-card-section-head"><span className="eyebrow"><Paperclip size={11} /> Files · {d!.files.length}</span><button className="text-button" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload size={12} /> {uploading ? 'Attaching…' : 'Attach files'}</button><input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files)} /></div>
          {d!.files.length === 0 ? <p className="studio-card-empty">Drop screens, specs, data or recordings here. {ASSISTANT_NAME} reads them as evidence for this card.</p> :
            <ul className="studio-card-files">{d!.files.map((f) => <li key={f.id}><FileText size={13} /><button type="button" className="studio-link-button" onClick={() => setDocOpen(f.id)}>{f.fileName}</button><small>{size(f.sizeBytes)} · {ago(f.createdAt)}</small><a className="studio-card-dl" href={`/api/use-cases/${live.id}/moves/${id}/files/${f.id}`} download={f.fileName} aria-label={`Download ${f.fileName}`}><Download size={12} /></a>{f.summary && <p>{f.summary}</p>}</li>)}</ul>}
        </section>

        {(m.components.length > 0 || m.routes.length > 0 || m.trackerUrl) && <section className="studio-card-section"><span className="eyebrow">Build</span>
          {m.components.length > 0 && <p className="studio-card-tags">{m.components.map((c) => <em key={c}>{c}</em>)}</p>}
          {m.routes.length > 0 && <p className="studio-card-tags">{m.routes.map((r) => <em key={r}>{r}</em>)}</p>}
          {m.trackerUrl && <a className="text-button" href={m.trackerUrl} target="_blank" rel="noreferrer">Open in the tracker <ArrowRight size={12} /></a>}
        </section>}

        {!start && <ItemRecord live={live} me={me} node={`move:${id}`} setToast={setToast} />}
      </>}
    </aside>
  </div>
}

/** What moving a card asks for: Ready wants detail, Being made real wants something to build, Review wants a try. */
function MoveGuide({ status, detailed, busy, hasApp, onDetail, onSocra, onGenerate, onTry }: { status: Status; detailed: boolean; busy: boolean; hasApp: boolean; onDetail: () => void; onSocra: () => void; onGenerate: () => void; onTry: () => void }) {
  // Ready to shape: no fixed questions here. Socra's own questions about this card show under "Questions about this item".
  if (status === 'ready') return <div className="studio-move-guide">
    <strong><MessageCircleQuestion size={14} /> {detailed ? 'Ready to shape.' : 'This card needs detail before it is built.'}</strong>
    <p className="studio-muted" style={{ margin: 0 }}>{ASSISTANT_NAME} has the specialist look at it and asks what is missing, below and in the conversation. You can also write the detail yourself.</p>
    <div className="studio-move-guide-actions"><button className="button button-primary button-small" type="button" onClick={onDetail}>Add detail here</button><button className="button button-quiet button-small" type="button" onClick={onSocra}>Open the conversation <ArrowRight size={12} /></button></div>
  </div>
  if (status === 'building') return detailed
    ? <div className="studio-move-guide"><strong><Play size={14} /> Ready to build.</strong><p className="studio-muted" style={{ margin: 0 }}>This card has enough detail. Generate the prototype to have Claude Code build it{hasApp ? ' into the next version' : ''}.</p><div className="studio-move-guide-actions"><button className="button button-primary button-small" type="button" disabled={busy} onClick={onGenerate}><Play size={12} /> {busy ? 'A build is running…' : 'Generate the prototype'}</button></div></div>
    : <div className="studio-move-guide is-warn"><strong>This card has almost no detail yet.</strong><p className="studio-muted" style={{ margin: 0 }}>If you generate now, Claude Code has nothing clear to build for it. Add what it does and how you’ll know it works, or let {ASSISTANT_NAME} ask you.</p><div className="studio-move-guide-actions"><button className="button button-primary button-small" type="button" onClick={onDetail}>Add detail here</button><button className="button button-quiet button-small" type="button" onClick={onSocra}>Let {ASSISTANT_NAME} ask me</button><button className="button button-quiet button-small" type="button" disabled={busy} onClick={onGenerate}>Generate anyway</button></div></div>
  if (status === 'review') return <div className="studio-move-guide"><strong>Your turn to review.</strong><p className="studio-muted" style={{ margin: 0 }}>Try it in the prototype. Say yes if it works, or mark what is wrong: each mark comes back as a new backlog item.</p><div className="studio-move-guide-actions"><button className="button button-primary button-small" type="button" onClick={onTry}>Try & mark up <ArrowRight size={12} /></button></div></div>
  return null
}

/** YYYY-MM-DD, n days from today (local). */
export function inDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Defer to a day: the item keeps its place, greyed, and turns red again on that day (Doug, Nov 21). */
export function DeferAsk({ until, setUntil, busy, onDefer, onCancel }: { until: string; setUntil: (v: string) => void; busy: boolean; onDefer: () => void; onCancel: () => void }) {
  const quick: [string, number][] = [['1 week', 7], ['2 weeks', 14], ['1 month', 30], ['3 months', 91]]
  return <div className="studio-work-ask" role="group" aria-label="Defer until">
    <strong>Bring it back on…</strong>
    <small>It keeps its place, greyed out, and turns red again on that day so you can decide.</small>
    <span className="studio-defer-quick">{quick.map(([label, n]) => <button key={label} type="button" className={`button button-small ${until === inDays(n) ? 'button-primary' : 'button-quiet'}`} onClick={() => setUntil(inDays(n))}>{label}</button>)}</span>
    <label className="studio-defer-date">Or pick a date <input type="date" className="studio-input" value={until} min={inDays(1)} onChange={(e) => setUntil(e.target.value)} /></label>
    <span><button type="button" className="button button-primary button-small" disabled={busy || !until} onClick={onDefer}>Defer until {until ? dayLabel(`${until}T00:00:00`) : '…'}</button><button type="button" className="button button-quiet button-small" disabled={busy} onClick={onCancel}>Cancel</button></span>
  </div>
}

/** Numbered items run together on one line ("1. Given… 2. Given…") are split onto their own lines, in sequence only. */
export function oneCriterionPerLine(text: string): string {
  let out = text
  let from = 0
  for (let n = 1; n < 40; n++) {
    const re = new RegExp(`(^|\\S)[ \\t]+(${n}[.)][ \\t]+\\S)`, 'g')
    re.lastIndex = from
    const hit = re.exec(out)
    if (!hit) { if (n === 1 && /^1[.)][ \t]/.test(out)) { from = 1; continue } break }
    if (n === 1 && !new RegExp(`[ \\t]2[.)][ \\t]+\\S`).test(out.slice(hit.index))) break
    const at = hit.index + hit[1].length
    out = `${out.slice(0, at)}\n${out.slice(at).replace(/^[ \t]+/, '')}`
    from = at + 1
  }
  return out
}
