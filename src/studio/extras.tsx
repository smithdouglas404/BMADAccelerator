'use client'
// Pieces the engine needs that the design team's screens don't have yet. They reuse the team's classes
// (from styles.css, which stays byte-identical to their drop) and sit below their content; the few new
// classes are in studio-extras.css.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Mic, Play, Plus } from 'lucide-react'
import { api, type Live } from './live'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
type ProductRow = { id: string; name: string; stageLabel: string; readiness: number; busy: boolean }

/** The team's project switcher, opening a list of every product plus "New product". */
export function ProductSwitcher({ live, children }: { live: Live; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ProductRow[]>([])
  const [name, setName] = useState(live.name)
  useEffect(() => setName(live.name), [live.name])
  const rename = () => { const n = name.trim(); if (n && n !== live.name) void api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { name: n } }).catch(() => undefined) }
  useEffect(() => {
    if (!open) return
    void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then(setRows).catch(() => setRows([]))
  }, [open])
  return (
    <div className="studio-switcher">
      <button className="project-switcher" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{children}</button>
      {open && (
        <div className="studio-switcher-menu" role="menu">
          <label className="studio-rename"><span className="eyebrow">This product’s name</span><input className="studio-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') { rename(); (e.target as HTMLInputElement).blur() } }} /></label>
          {rows.map((r) => (
            <a key={r.id} href={`/use-cases/${r.id}`} className={r.id === live.id ? 'is-active' : ''} role="menuitem">
              <span className="project-glyph">{r.name.slice(0, 1).toUpperCase()}</span>
              <span className="project-switcher-copy"><strong>{r.name}</strong><small>{r.stageLabel} · {r.readiness}%</small></span>
            </a>
          ))}
          <a href="/new" role="menuitem"><span className="project-glyph"><Plus size={14} /></span><span className="project-switcher-copy"><strong>New product</strong><small>say it in a few lines</small></span></a>
          <a href="/" role="menuitem" className="studio-switcher-all">All use cases <ArrowRight size={12} /></a>
        </div>
      )}
    </div>
  )
}

/** Plain markdown (headings, lists, quotes, paragraphs) rendered without HTML injection. */
/** Socra's markdown. `bare` leaves out the older styles.css look so the new screens style it themselves. */
export function StudioMarkdown({ text, bare = false }: { text: string; bare?: boolean }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '))}</p>)
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    para = []
    list = []
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { flush(); blocks.push(<h3 key={`h${blocks.length}`} className={bare ? undefined : `studio-md-h${h[1].length}`} data-level={h[1].length}>{inline(h[2])}</h3>); continue }
    const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)
    if (li) { if (para.length) { const p = para; para = []; blocks.push(<p key={`p${blocks.length}`}>{inline(p.join(' '))}</p>) } list.push(li[1]); continue }
    const q = line.match(/^>\s?(.*)$/)
    if (q) { flush(); blocks.push(<div key={`q${blocks.length}`} className="quote-callout"><span>“</span><p>{inline(q[1].replace(/[“”"]/g, ''))}</p></div>); continue }
    if (!line.trim()) { flush(); continue }
    if (list.length) flush()
    para.push(line.trim())
  }
  flush()
  return <div className={bare ? undefined : 'studio-md'}>{blocks}</div>
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\b_[^_]+_\b|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : /^(_[^_]+_|\*[^*]+\*)$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : <span key={i}>{part}</span>,
  )
}


const OBS = [
  ['observation', 'Observation'],
  ['metric', 'Metric'],
  ['interview', 'Interview note'],
  ['felt-wrong', 'This felt wrong because…'],
] as const

/** The pilot-feedback loop: what happened in the pilot goes back into the spec. */
export function ObservationComposer({ live, act }: { live: Live; act: Act }) {
  const [kind, setKind] = useState<(typeof OBS)[number][0]>('observation')
  const [text, setText] = useState('')
  const send = () => {
    const t = text.trim()
    if (t.length < 2) return
    setText('')
    void act(() => api(`/api/use-cases/${live.id}/observations`, { json: { kind, text: t } }), 'Pilot feedback added — Socra is carrying it into the spec')
  }
  return (
    <section className="studio-card studio-observe">
      <div className="stack-header"><div><p className="eyebrow">Pilot feedback loop</p><h3>What happened when people used it?</h3></div><Mic size={16} /></div>
      <div className="evidence-filters">{OBS.map(([k, label]) => <button key={k} type="button" className={kind === k ? 'is-active' : ''} onClick={() => setKind(k)}>{label}</button>)}</div>
      <div className="capture-input"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder={kind === 'felt-wrong' ? 'This felt wrong because…' : 'What you saw, measured or heard…'} /><button type="button" onClick={send} aria-label="Add pilot feedback"><Plus size={16} /></button></div>
    </section>
  )
}

type Preview = { backlog: { id: string; title: string; group: string; synced: boolean }[]; gitDiffs: { id: string; file: string; summary: string; from: string; to: string }[]; linearDiffs: { id: string }[]; gitRecords: number; linearRecords: number }

/** The team's projection preview, filled from what the next sync would really send. */
export function SyncPreview({ live, syncState, refresh }: { live: Live; syncState: 'idle' | 'syncing' | 'synced'; refresh: number }) {
  const [p, setP] = useState<Preview | null>(null)
  useEffect(() => {
    void api<Preview>(`/api/use-cases/${live.id}/sync`, { cache: 'no-store' }).then(setP).catch(() => setP(null))
  }, [live.id, refresh, live.updatedAt])
  const backlog = p?.backlog ?? []
  const diffs = p?.gitDiffs ?? []
  return (
    <section className="sync-preview-card"><div className="sync-preview-head"><div><p className="eyebrow">Automatic projection preview</p><h2>What would push from Studio</h2><p>{p ? `${p.gitRecords} records already in Git · ${p.linearRecords} in Linear. Re-syncing never duplicates them.` : 'Reading what the next sync would send…'}</p></div><span className={`sync-state ${syncState}`}><span />{syncState === 'synced' ? 'synced' : syncState === 'syncing' ? 'projecting…' : 'ready to project'}</span></div><div className="sync-preview-grid"><div><span className="eyebrow">Backlog records · {backlog.length}</span>{backlog.slice(0, 8).map((item) => <div className="sync-record" key={item.id}><span className="sync-record-dot backlog" /><div><strong>{item.title}</strong><small>{item.id} · {item.group || 'Unsorted signal'}</small></div>{item.synced && <Check size={13} />}</div>)}</div><div><span className="eyebrow">Specification diffs · {diffs.length}</span>{diffs.length === 0 && <div className="sync-record"><span className="sync-record-dot spec" /><div><strong>No spec changes since the last sync</strong><small>prototype/spec is up to date</small></div></div>}{diffs.slice(0, 8).map((diff) => <div className="sync-record" key={diff.id}><span className="sync-record-dot spec" /><div><strong>{diff.summary}</strong><small>{diff.file} · {diff.from} → {diff.to}</small></div></div>)}</div></div></section>
  )
}

/** Which coding agent builds the pilot: Claude Code today; the others are on the way. */
export function ProvidersCard() {
  const rows = [
    ['Claude Code', 'Builds every version from the package, on your Claude plan', 'Active'],
    ['Cursor', 'Same package, opened as a Cursor background agent', 'Coming'],
    ['Devin', 'Same package, handed to a Devin session', 'Coming'],
    ['Antigravity', 'Same package, run in Google Antigravity', 'Coming'],
  ]
  return (
    <section className="connection-card studio-providers">
      <div className="connection-card-header"><span className="connection-logo github"><Play size={18} /></span><div><p className="eyebrow">Implementation agent</p><h2>Who builds the pilot</h2></div><a className="connection-badge" href="/settings">Settings</a></div>
      <div className="studio-list">{rows.map(([name, detail, state]) => <div key={name} className="studio-list-row"><div className="studio-row-main"><strong>{name}</strong><small>{detail}</small></div><span className={`connection-badge ${state === 'Active' ? '' : 'muted'}`}>{state}</span></div>)}</div>
    </section>
  )
}

