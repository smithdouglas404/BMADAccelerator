'use client'

// The Board (Doug, Nov 16): the team's Kanban made fully usable. Cards still move themselves (Socra, the
// builds and people's answers move them), but a person can also drag a card or use its arrows, open a
// card to see and edit everything on it, add a card, and attach files. Every change is logged and Socra
// hears it. Built on the design team's kanban classes; new pieces are styled in studio-extras.css.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, FileText, History, Network, Paperclip, Play, Plus, Target, Upload, X } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { api, ago, type Live } from './live'
import type { Me, StudioView } from './flow'

type Status = 'queued' | 'ready' | 'building' | 'review' | 'done'
const COLUMNS: { id: Status; label: string; description: string }[] = [
  { id: 'queued', label: 'Backlog', description: 'Worth holding' },
  { id: 'ready', label: 'Ready to shape', description: 'Promise is clear' },
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

type Props = { live: Live; me: Me; buildNow: () => void; changeView: (v: StudioView) => void; setToast: (v: string) => void; children?: React.ReactNode }

const ownerMark = (o: string) => (o === 'Claude Code' ? 'C' : o === 'UX agent' ? 'U' : o === 'Product owner' ? 'PO' : o.slice(0, 1).toUpperCase() || 'A')
/** Socra writes some lines with record ids (move:…, backlog:…); show the card's name instead. */
const plain = (text: string, live: Live) =>
  text.replace(/\b(move|backlog|msg|decision):([a-z0-9]{8,})/gi, (all, kind: string, ref: string) => {
    const hit = kind === 'move' ? live.moves.find((m) => m.id === ref)?.title : kind === 'backlog' ? live.backlog.find((b) => b.id === ref)?.title : undefined
    return hit ? `“${hit}”` : kind === 'move' || kind === 'backlog' ? 'another card' : all
  })
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

export function BoardView({ live, me, buildNow, changeView, setToast, children }: Props) {
  const by = me.name || me.role || 'A person'
  // Moves show at once on this screen, before the next refresh confirms them.
  const [local, setLocal] = useState<Record<string, Status>>({})
  const [dragging, setDragging] = useState('')
  const [over, setOver] = useState<Status | ''>('')
  const [open, setOpen] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  useEffect(() => { setLocal({}) }, [live.updatedAt])

  const cards = live.moves.map((m) => ({ ...m, status: (local[m.id] ?? (ORDER.includes(m.status as Status) ? m.status : 'queued')) as Status }))

  const move = async (id: string, status: Status, why = '') => {
    const card = cards.find((c) => c.id === id)
    if (!card || card.status === status) return
    setLocal((l) => ({ ...l, [id]: status }))
    try {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { status, by, why } })
      setToast(status === 'done' ? `“${card.title}” is done. It stays traceable to its decision.` : `“${card.title}” moved to ${LABEL[status]}${ORDER.indexOf(status) < ORDER.indexOf(card.status) ? `. ${ASSISTANT_NAME} will ask what isn’t right yet.` : ''}`)
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
      const items = cards.filter((c) => c.status === col.id)
      return <section key={col.id} className={`kanban-column ${col.id} ${over === col.id ? 'is-drop' : ''}`}
        onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(col.id) } }}
        onDragLeave={() => setOver((o) => (o === col.id ? '' : o))}
        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragging; setOver(''); setDragging(''); if (id) void move(id, col.id, 'dragged on the Board') }}>
        <div className="kanban-column-header"><div><strong>{col.label}</strong><small>{col.description}</small></div><span>{items.length}</span></div>
        <div className="kanban-cards">
          {col.id === 'queued' && adding && <div className="build-card studio-board-new"><input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(false) }} placeholder="What should the product do?" /><div><button className="button button-primary button-small" type="button" onClick={() => void add()} disabled={!newTitle.trim()}><Check size={12} /> Add</button><button className="button button-quiet button-small" type="button" onClick={() => setAdding(false)}>Cancel</button></div></div>}
          {items.map((item) => <article key={item.id} className={`build-card studio-board-card ${dragging === item.id ? 'is-dragging' : ''}`} draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; setDragging(item.id) }}
            onDragEnd={() => { setDragging(''); setOver('') }}
            onClick={() => setOpen(item.id)} onDoubleClick={() => setOpen(item.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(item.id) }} tabIndex={0} role="button" aria-label={`Open ${item.title}`}>
            <div className="build-card-top"><span className={`status-pill ${item.status === 'done' ? 'review' : item.status}`}>{item.signal || LABEL[item.status].toUpperCase()}</span>{item.hidden && item.hidden !== 'story' && <small className="studio-board-kind">{item.hidden}</small>}</div>
            <h3>{item.title}</h3>
            {(item.capability || item.decision) && <div className="build-trace">{item.capability && <span><Target size={13} /> {item.capability}</span>}{item.decision && <span><Check size={13} /> “{item.decision}”</span>}</div>}
            {item.moveReason && <p className="studio-moved-by"><History size={11} /> {item.movedBy || 'Moved'}: {item.moveReason}</p>}
            <div className="build-card-footer"><span className="owner-avatar">{ownerMark(item.owner)}</span><small>{item.owner}</small>
              <span className="studio-board-arrows">
                <button className="card-next" type="button" disabled={item.status === 'queued'} aria-label="Move back" title={item.status === 'queued' ? '' : `Back to ${LABEL[ORDER[ORDER.indexOf(item.status) - 1]]}`} onClick={(e) => { e.stopPropagation(); step(item.id, -1) }}><ArrowLeft size={14} /></button>
                <button className="card-next" type="button" disabled={item.status === 'done'} aria-label="Move forward" title={item.status === 'done' ? '' : `On to ${LABEL[ORDER[ORDER.indexOf(item.status) + 1]]}`} onClick={(e) => { e.stopPropagation(); step(item.id, 1) }}><ArrowRight size={14} /></button>
              </span></div>
          </article>)}
          {items.length === 0 && !(col.id === 'queued' && adding) && <div className="empty-column">{dragging ? 'Drop it here.' : <>Nothing here yet.<br />That’s okay — the shape is still moving.</>}</div>}
        </div>
      </section>
    })}</div>

    {children}
    <div className="pilot-footer"><div><span className="live-pulse" /> {ASSISTANT_NAME} is watching for a blocker, not micromanaging the work.</div><button className="text-button" type="button" onClick={() => changeView('storymap')}>See how the stories connect <ArrowRight size={14} /></button></div>
    {open && <CardPanel key={open} live={live} id={open} by={by} onClose={() => setOpen('')} onMove={(s) => void move(open, s, 'moved from the card')} setToast={setToast} />}
  </div>
}

function CardPanel({ live, id, by, onClose, onMove, setToast }: { live: Live; id: string; by: string; onClose: () => void; onMove: (s: Status) => void; setToast: (v: string) => void }) {
  const [d, setD] = useState<CardDetail | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Partial<CardDetail['move']>>({})
  const [saving, setSaving] = useState(false)
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
  const dirty = m ? (Object.keys(draft) as (keyof CardDetail['move'])[]).some((k) => draft[k] !== m[k]) : false
  const save = async () => {
    if (!m || !dirty) return
    if (!String(val('title')).trim()) { setToast('A card needs a title.'); return }
    setSaving(true)
    try {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { ...draft, by } })
      setDraft({}); await load()
      setToast(`Saved. ${ASSISTANT_NAME} will carry the change into the spec.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
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
      <div className="studio-card-head"><p className="eyebrow">{m ? `${LABEL[m.status] ?? m.status}${m.hidden ? ` · ${m.hidden}` : ''}` : 'Card'}</p><button className="icon-button subtle" type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      {!m ? <p className="studio-muted">{error || 'Opening the card…'}</p> : <>
        <textarea className="studio-card-title" rows={2} value={val('title')} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
        <div className="studio-card-status">{COLUMNS.map((c) => <button key={c.id} type="button" className={m.status === c.id ? 'is-active' : ''} onClick={() => { if (m.status !== c.id) { onMove(c.id); setD({ ...d!, move: { ...m, status: c.id } }) } }}>{c.label}</button>)}</div>
        <div className="studio-card-grid">
          <label><span>Area</span><input value={val('capability')} onChange={(e) => setDraft({ ...draft, capability: e.target.value })} placeholder="Which capability" /></label>
          <label><span>Owner</span><input value={val('owner')} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></label>
          <label><span>Kind</span><select value={val('hidden') || 'story'} onChange={(e) => setDraft({ ...draft, hidden: e.target.value })}>{[...new Set([...KINDS, m.hidden || 'story'])].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label><span>Tag</span><input value={val('signal')} onChange={(e) => setDraft({ ...draft, signal: e.target.value })} placeholder="e.g. THIN SLICE" /></label>
        </div>
        <label className="studio-card-field"><span>Decision it traces to</span><textarea rows={2} value={val('decision')} onChange={(e) => setDraft({ ...draft, decision: e.target.value })} placeholder="The decision or promise this card delivers" /></label>
        <label className="studio-card-field"><span>Details and acceptance criteria</span><textarea rows={8} value={val('prompt')} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="What it does, for whom, and how we'll know it works" /></label>
        <div className="studio-card-actions"><button className="button button-primary button-small" type="button" disabled={!dirty || saving} onClick={() => void save()}><Check size={13} /> {saving ? 'Saving…' : 'Save changes'}</button>{dirty && <button className="button button-quiet button-small" type="button" onClick={() => setDraft({})}>Undo edits</button>}</div>

        <section className="studio-card-section"><div className="studio-card-section-head"><span className="eyebrow"><Paperclip size={11} /> Files · {d!.files.length}</span><button className="text-button" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload size={12} /> {uploading ? 'Attaching…' : 'Attach files'}</button><input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files)} /></div>
          {d!.files.length === 0 ? <p className="studio-card-empty">Drop screens, specs, data or recordings here. {ASSISTANT_NAME} reads them as evidence for this card.</p> :
            <ul className="studio-card-files">{d!.files.map((f) => <li key={f.id}><FileText size={13} /><a href={`/api/use-cases/${live.id}/moves/${id}/files/${f.id}`} target="_blank" rel="noreferrer">{f.fileName}</a><small>{size(f.sizeBytes)} · {ago(f.createdAt)}</small><a className="studio-card-dl" href={`/api/use-cases/${live.id}/moves/${id}/files/${f.id}`} download={f.fileName} aria-label={`Download ${f.fileName}`}><Download size={12} /></a>{f.summary && <p>{f.summary}</p>}</li>)}</ul>}
        </section>

        {(m.components.length > 0 || m.routes.length > 0 || m.trackerUrl) && <section className="studio-card-section"><span className="eyebrow">Build</span>
          {m.components.length > 0 && <p className="studio-card-tags">{m.components.map((c) => <em key={c}>{c}</em>)}</p>}
          {m.routes.length > 0 && <p className="studio-card-tags">{m.routes.map((r) => <em key={r}>{r}</em>)}</p>}
          {m.trackerUrl && <a className="text-button" href={m.trackerUrl} target="_blank" rel="noreferrer">Open in the tracker <ArrowRight size={12} /></a>}
        </section>}

        <section className="studio-card-section"><span className="eyebrow"><History size={11} /> What happened · {d!.history.length}</span>
          {d!.history.length === 0 ? <p className="studio-card-empty">Nothing logged yet.</p> :
            <ol className="studio-card-history">{d!.history.map((h) => <li key={h.id}><span>{plain(h.summary, live)}</span><small>{ago(h.createdAt)}</small></li>)}</ol>}
        </section>
      </>}
    </aside>
  </div>
}
