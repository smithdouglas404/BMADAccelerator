'use client'
// Pieces the engine needs that the design team's screens don't have yet. They reuse the team's classes
// (from styles.css, which stays byte-identical to their drop) and sit below their content; the few new
// classes are in studio-extras.css.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, CircleHelp, ExternalLink, GitBranch, History, Mic, Network, Play, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { SPEC_BASIS, SPEC_STATUSES } from '@/lib/studio/spec'
import { api, ago, previewUrl, type Live } from './live'

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
          <a href="/" role="menuitem" className="studio-switcher-all">All products <ArrowRight size={12} /></a>
        </div>
      )}
    </div>
  )
}

/** Plain markdown (headings, lists, quotes, paragraphs) rendered without HTML injection. */
export function StudioMarkdown({ text }: { text: string }) {
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
    if (h) { flush(); blocks.push(<h3 key={`h${blocks.length}`} className={`studio-md-h${h[1].length}`}>{inline(h[2])}</h3>); continue }
    const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)
    if (li) { if (para.length) { const p = para; para = []; blocks.push(<p key={`p${blocks.length}`}>{inline(p.join(' '))}</p>) } list.push(li[1]); continue }
    const q = line.match(/^>\s?(.*)$/)
    if (q) { flush(); blocks.push(<div key={`q${blocks.length}`} className="quote-callout"><span>“</span><p>{inline(q[1].replace(/[“”"]/g, ''))}</p></div>); continue }
    if (!line.trim()) { flush(); continue }
    if (list.length) flush()
    para.push(line.trim())
  }
  flush()
  return <div className="studio-md">{blocks}</div>
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
  )
}

type SectionLite = { key: string; ref: string; title: string; status: string; basis: string; review: string; reviewNote: string }

/** Requirements review: Keep, Revise, Challenge or Remove, the section's state, and one-at-a-time review. */
/** The review state under the team's Accept / Revise row: how we know it, its state, the last review. */
export function SpecReviewTools({ section, onStatus, reviewMode, setReviewMode, onNext }: { section: SectionLite; onStatus: (status: string) => void; reviewMode: boolean; setReviewMode: (v: boolean) => void; onNext: () => void }) {
  return (
    <div className="studio-review-meta studio-review-inline">
      <span className={`studio-basis ${section.basis}`}>{SPEC_BASIS.find((b) => b.key === section.basis)?.label ?? section.basis}</span>
      <label>State<select value={section.status} onChange={(e) => onStatus(e.target.value)}>{SPEC_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
      {section.review && <span className={`studio-review-chip ${section.review}`}>{section.review}{section.reviewNote ? ` · “${section.reviewNote}”` : ''}</span>}
      <span className="studio-spacer" />
      <button type="button" className="text-button" onClick={() => { setReviewMode(!reviewMode); if (!reviewMode) onNext() }}>{reviewMode ? 'Leave review mode' : 'Review one at a time'} <ArrowRight size={13} /></button>
      {reviewMode && <button type="button" className="text-button" onClick={onNext}>Next section <ArrowRight size={13} /></button>}
    </div>
  )
}

type Impact = { prd: { key: string; ref: string; title: string }[]; trd: { key: string; ref: string; title: string }[]; backlog: { id: string; title: string }[]; workflows: { id: string; title: string }[]; moves: { id: string; title: string; status: string }[]; artifacts: string[]; linear: { title: string; url: string }[] }

/** What a change to this section or decision touches downstream. */
export function ImpactPanel({ live, sectionKey, decisionId }: { live: Live; sectionKey?: string; decisionId?: string }) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const stamp = live.spec.find((s) => s.key === sectionKey)?.updatedAt ?? live.updatedAt
  useEffect(() => {
    const q = sectionKey ? `section=${encodeURIComponent(sectionKey)}` : `decision=${encodeURIComponent(decisionId ?? '')}`
    void api<Impact>(`/api/use-cases/${live.id}/impact?${q}`, { cache: 'no-store' }).then(setImpact).catch(() => setImpact(null))
  }, [live.id, sectionKey, decisionId, stamp])
  if (!impact) return null
  const rows: [string, string[]][] = [
    ['PRD sections', impact.prd.map((s) => `${s.ref} ${s.title}`)],
    ['TRD sections', impact.trd.map((s) => `${s.ref} ${s.title}`)],
    ['Backlog', impact.backlog.map((b) => b.title)],
    ['Agent workflows', impact.workflows.map((b) => b.title)],
    ['Build moves', impact.moves.map((m) => `${m.title} (${m.status})`)],
    ['Generated artifacts', impact.artifacts],
    ['Linear', impact.linear.map((l) => l.title)],
  ]
  const total = rows.reduce((n, [, v]) => n + v.length, 0)
  return (
    <section className="studio-card">
      <div className="stack-header"><div><p className="eyebrow">Change impact</p><h3>{total ? `A change here touches ${total} ${total === 1 ? 'thing' : 'things'}` : 'Nothing else depends on this yet'}</h3></div><Network size={16} /></div>
      {total > 0 && <div className="studio-impact">{rows.filter(([, v]) => v.length).map(([label, v]) => <div key={label}><span className="eyebrow">{label} · {v.length}</span>{v.slice(0, 6).map((x) => <small key={x}>{x}</small>)}{v.length > 6 && <small>and {v.length - 6} more</small>}</div>)}</div>}
    </section>
  )
}

/** Spec versions: one per package, with the diff, and a restore that comes back as a new version. */
export function VersionHistory({ live, act }: { live: Live; act: Act }) {
  const [open, setOpen] = useState<number | null>(null)
  const revs = [...live.specRevisions].sort((a, b) => b.version - a.version)
  return (
    <section className="studio-card">
      <div className="stack-header"><div><p className="eyebrow">Spec versions · {revs.length}</p><h3>Every package keeps the spec it was built from</h3></div><History size={16} /></div>
      {revs.length === 0 && <p className="studio-muted">The first version is saved when the first Claude Code package is assembled.</p>}
      <div className="studio-list">
        {revs.map((r, i) => (
          <div key={r.id} className="studio-list-row">
            <button type="button" className="studio-row-main" onClick={() => setOpen(open === r.version ? null : r.version)}><strong>Version {r.version}</strong><small>{r.reason} · {ago(r.createdAt)}</small><ChevronDown size={13} /></button>
            {i > 0 && <button type="button" className="button button-quiet button-small" onClick={() => void act(() => api(`/api/use-cases/${live.id}/spec/restore`, { json: { version: r.version } }), `Spec restored to version ${r.version} — saved as a new version`)}>Restore</button>}
            {open === r.version && <pre className="studio-diff">{r.diff || 'No changes from the version before.'}</pre>}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Explainable readiness: the factors behind the one number. */
export function ReadinessFactors({ live }: { live: Live }) {
  return (
    <section className="studio-card studio-factors">
      <div className="stack-header"><div><p className="eyebrow">Explainable readiness · {live.readiness.overall}%</p><h3>What the number is made of</h3></div><Sparkles size={16} /></div>
      <div className="studio-list">
        {live.readiness.factors.map((f) => (
          <div key={f.key} className="studio-factor">
            <div><strong>{f.label}</strong><span>{f.value}%</span></div>
            <div className="ceiling-track"><span style={{ width: `${f.value}%`, background: 'var(--acid)' }} /></div>
            <small>{f.detail}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Every decision: approve, reopen, answer, include in the next build, and see what it touches. */
export function DecisionRegister({ live, act }: { live: Live; act: Act }) {
  const [answer, setAnswer] = useState<Record<string, string>>({})
  const [impactOf, setImpactOf] = useState('')
  const patch = (id: string, body: Record<string, unknown>, ok: string) => void act(() => api(`/api/use-cases/${live.id}/decisions/${id}`, { method: 'PATCH', json: body }), ok)
  const list = [...live.decisions].sort((a, b) => (a.status === 'approved' ? 1 : 0) - (b.status === 'approved' ? 1 : 0))
  return (
    <div className="studio-list studio-register">
      {list.length === 0 && <p className="studio-muted">No decisions yet.</p>}
      {list.map((d) => (
        <div key={d.id} className="studio-list-row">
          <div className="studio-row-main"><strong>{d.text}</strong><small>{d.status} · {d.capability || 'whole product'} · {ago(d.createdAt)}{d.words ? ` · you said “${d.words.slice(0, 80)}”` : ''}</small></div>
          {d.status !== 'approved' && <textarea className="studio-input" rows={1} value={answer[d.id] ?? d.answer} onChange={(e) => setAnswer({ ...answer, [d.id]: e.target.value })} placeholder="Your answer…" />}
          <div className="studio-review-actions">
            {d.status !== 'approved' ? <button type="button" className="button button-primary button-small" onClick={() => patch(d.id, { status: 'approved', ...(answer[d.id] ? { answer: answer[d.id] } : {}) }, 'Decision approved and carried forward')}><Check size={13} /> Approve</button> : <button type="button" className="button button-quiet button-small" onClick={() => patch(d.id, { status: 'open' }, 'Decision reopened — the Muse will ask about it')}>Reopen</button>}
            <label className="studio-toggle"><input type="checkbox" checked={d.includeInBuild} onChange={(e) => patch(d.id, { includeInBuild: e.target.checked }, e.target.checked ? 'Included in the next build' : 'Left out of the next build')} /> include in next build</label>
            <button type="button" className="text-button" onClick={() => setImpactOf(impactOf === d.id ? '' : d.id)}>What it touches <ArrowRight size={12} /></button>
          </div>
          {impactOf === d.id && <ImpactPanel live={live} decisionId={d.id} />}
        </div>
      ))}
    </div>
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
    void act(() => api(`/api/use-cases/${live.id}/observations`, { json: { kind, text: t } }), 'Pilot feedback added — the Muse is carrying it into the spec')
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

/** The builds Claude Code has made of this product, and the buttons that start the next one. */
export function BuildHistory({ live, buildNow }: { live: Live; act: Act; buildNow: (opts?: { redesign?: boolean; fresh?: boolean }) => void }) {
  const [confirmFresh, setConfirmFresh] = useState(false)
  const open = previewUrl(live.preview.port, '/')
  return (
    <section className="studio-card studio-builds">
      <div className="stack-header"><div><p className="eyebrow">Claude Code builds · {live.generateCount}</p><h3>{live.generateBusy ? live.generateStatus || 'Building the next version…' : live.generateCount ? `Version ${live.generateCount} built ${ago(live.lastGeneratedAt)}` : 'No version built yet'}</h3></div><RefreshCw size={16} /></div>
      <div className="studio-review-actions">
        <button type="button" className="button button-primary button-small" disabled={live.generateBusy} onClick={() => buildNow()}><Play size={13} /> {live.generateCount ? `Build version ${live.generateCount + 1}` : 'Build it now'}</button>
        {live.generateCount > 0 && <button type="button" className="button button-quiet button-small" disabled={live.generateBusy} onClick={() => buildNow({ redesign: true })}><Sparkles size={13} /> Fresh design direction</button>}
        {live.generateCount > 0 && !confirmFresh && <button type="button" className="text-button" disabled={live.generateBusy} onClick={() => setConfirmFresh(true)}>Start fresh from the spec <ArrowRight size={12} /></button>}
        {confirmFresh && <span className="studio-confirm"><CircleHelp size={13} /> The current app and design are archived and never read again; your requirements stay. <button type="button" className="button button-quiet button-small" onClick={() => { setConfirmFresh(false); buildNow({ fresh: true }) }}>Start fresh</button><button type="button" className="icon-button subtle" aria-label="Cancel" onClick={() => setConfirmFresh(false)}><X size={13} /></button></span>}
        {open && <a className="text-button" href={open} target="_blank" rel="noreferrer">Open the live product <ExternalLink size={12} /></a>}
        {live.repoUrl && <a className="text-button" href={live.repoUrl} target="_blank" rel="noreferrer"><GitBranch size={12} /> Repository</a>}
      </div>
      {live.agentError && <p className="studio-muted">{live.agentError}</p>}
    </section>
  )
}
