'use client'
// Pieces the engine needs that the design team's screens don't have yet. They reuse the team's classes
// (from styles.css, which stays byte-identical to their drop) and sit below their content; the few new
// classes are in studio-extras.css.
import { useState, type ReactNode } from 'react'
import { Mic, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Live } from './live'
import { Section, SectionBody } from './kit'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
/** Plain markdown (headings, lists, quotes, paragraphs) rendered without HTML injection. */
/** Socra's markdown. `bare` leaves out the older styles.css look so the new screens style it themselves. */
export function StudioMarkdown({ text, bare = false }: { text: string; bare?: boolean }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let list: string[] = []
  let para: string[] = []
  let table: string[][] = []
  const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const flush = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`} className="leading-relaxed">{inline(para.join(' '))}</p>)
    if (list.length) blocks.push(<ul key={`u${blocks.length}`} className="ml-5 grid list-disc gap-1 leading-relaxed">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    if (table.length) {
      const [head, ...rows] = table
      blocks.push(<div key={`t${blocks.length}`} className="overflow-x-auto rounded-md border border-border"><table className="w-full border-collapse text-sm"><thead className="bg-muted/60"><tr>{head.map((c, i) => <th key={i} className="border-b border-border px-3 py-2 text-left font-medium">{inline(c)}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{inline(c)}</td>)}</tr>)}</tbody></table></div>)
    }
    para = []
    list = []
    table = []
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    // A Markdown table: a row of |-separated cells; the |---|---| line under the header is dropped.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (para.length || list.length) { const t = table; table = []; flush(); table = t }
      if (!/^[\s|:-]+$/.test(line)) table.push(cells(line))
      continue
    }
    if (table.length) flush()
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { flush(); blocks.push(<h3 key={`h${blocks.length}`} className={h[1].length <= 1 ? 'mt-2 text-lg font-semibold tracking-tight' : h[1].length === 2 ? 'mt-2 text-base font-semibold' : 'mt-1 text-sm font-semibold'} data-level={h[1].length}>{inline(h[2])}</h3>); continue }
    const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)
    if (li) { if (para.length) { const p = para; para = []; blocks.push(<p key={`p${blocks.length}`} className="leading-relaxed">{inline(p.join(' '))}</p>) } list.push(li[1]); continue }
    const q = line.match(/^>\s?(.*)$/)
    if (q) { flush(); blocks.push(<div key={`q${blocks.length}`} className="border-l-2 border-primary pl-4 font-serif text-base italic">“{inline(q[1].replace(/[“”"]/g, ''))}”</div>); continue }
    if (!line.trim()) { flush(); continue }
    if (list.length) flush()
    para.push(line.trim())
  }
  flush()
  return <div className={bare ? 'grid gap-3' : 'grid gap-3 text-sm'}>{blocks}</div>
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\b_[^_]+_\b|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">{part.slice(1, -1)}</code> : /^(_[^_]+_|\*[^*]+\*)$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : <span key={i}>{part}</span>,
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




