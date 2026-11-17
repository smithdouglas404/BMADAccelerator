'use client'
// Pieces the engine needs that the design team's screens don't have yet. They reuse the team's classes
// (from styles.css, which stays byte-identical to their drop) and sit below their content; the few new
// classes are in studio-extras.css.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Mic, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Live } from './live'
import { Section, SectionBody } from './kit'

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
    void act(() => api(`/api/use-cases/${live.id}/observations`, { json: { kind, text: t } }), 'Pilot feedback added. Socra is carrying it into the spec')
  }
  return (
    <Section title="What happened when people used it?" description="Pilot feedback goes straight back into the spec." action={<Mic className="size-4 text-muted-foreground" />}>
      <SectionBody>
        <div role="group" aria-label="Kind of feedback" className="flex flex-wrap gap-1.5">{OBS.map(([k, label]) => <Button key={k} type="button" size="sm" variant={kind === k ? 'secondary' : 'ghost'} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</Button>)}</div>
        <div className="flex gap-2"><Input aria-label="Pilot feedback" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder={kind === 'felt-wrong' ? 'This felt wrong because…' : 'What you saw, measured or heard…'} /><Button type="button" onClick={send} disabled={text.trim().length < 2} className="gap-1.5"><Plus className="size-4" /> Add</Button></div>
      </SectionBody>
    </Section>
  )
}




