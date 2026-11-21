'use client'
// One progress view on the conversation (Doug, Nov 21: "merge into one progress view"). It replaces "Active lens"
// and "Move the lens": the product's areas with counts from the records (must-haves agreed, inferred and
// waiting, questions open), the team's question areas answered, and the click that steers Socra's next questions.
import { ArrowRight, Gauge } from 'lucide-react'
import type { Capability } from './data'
import { areaCounts, type Live } from './live'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function ProgressView({ live, caps, selected, onFocus }: { live: Live; caps: Capability[]; selected: Capability; onFocus: (c: Capability) => void }) {
  const counts = areaCounts(live)
  const all = Object.values(counts)
  const agreed = all.reduce((n, c) => n + c.agreed, 0)
  const total = all.reduce((n, c) => n + c.total, 0)
  const open = live.decisions.filter((d) => d.status === 'open').length
  const team = live.coverage ?? []
  const answered = team.reduce((n, c) => n + c.done, 0)
  const areas = team.reduce((n, c) => n + c.total, 0)
  return (
    <div className="aside-block studio-progress">
      <div className="aside-block-header"><span className="eyebrow">Where things stand</span><Gauge size={15} /></div>
      <dl className="studio-progress-totals">
        <div title="Must-haves the people on the product agreed, out of everything in scope. The rest are inferred from what leading products have and wait for a yes."><dt>{agreed} of {total}</dt><dd>must-haves agreed</dd></div>
        <div title="Questions only a person can answer, waiting as checkpoints."><dt>{open}</dt><dd>{open === 1 ? 'question' : 'questions'} open</dd></div>
        <div title="The team's question areas (each specialist's skill) that your answers have covered, or you let them assume."><dt>{answered} of {areas}</dt><dd>team areas answered</dd></div>
      </dl>
      <p className="studio-team-help">Pick an area and Socra asks about it next.</p>
      <div className="lens-list">
        {caps.map((c) => {
          const k = counts[c.id] ?? { agreed: 0, total: 0, inferred: 0, open: 0, pct: 0 }
          const on = c.id === selected.id
          return (
            <button type="button" key={c.id} className={on ? 'is-active' : ''} onClick={() => onFocus(c)} aria-pressed={on} title={`${c.label}: ${k.agreed} of ${k.total} must-haves agreed, ${k.inferred} inferred and waiting for a yes${k.open ? `, ${plural(k.open, 'question')} open` : ''}.${on ? ' Socra is asking about this now.' : ' Click and Socra asks about this next.'}`}>
              <span className="lens-swatch" style={{ background: c.color }} />
              <span><strong>{c.label}</strong><small>{k.agreed} of {k.total} agreed{k.open ? ` · ${plural(k.open, 'question')} open` : ''}{on ? ' · asking now' : ''}</small><span className="studio-progress-track"><span style={{ width: `${k.pct}%`, background: c.color }} /></span></span>
              <ArrowRight size={13} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
