'use client'
// Settings > Jev: what TypeSafe's Jev does for the Studio, measured against the old method.
// Every number comes from logged calls (JevCall) and from what people did afterwards.
import { Rich } from './rich'
import { useEffect, useState } from 'react'
import { Gauge } from 'lucide-react'
import { api } from './live'

type F = { calls: number; errors: number; usedJev: number; compared: number; agreed: number; medianMs: number; p95Ms: number; tokens: number }
type Stats = {
  configured: boolean; on: boolean
  features: { approval: F; markup: F; links: F; gate: F }
  gate: { messages: number; turnsDone: number; jevLight: number; jevFull: number; unsettled: number; wouldSave: number; wouldHaveBroken: number; missedSaving: number; recent: { at: string; input: Record<string, unknown>; jev: string; socra: string; did: string }[] }
  cost: Record<string, number>
  approvals: { rescued: number; blocked: number; byJev: number; undone: number }
  links: { jev: { accepted: number; dismissed: number }; socra: { accepted: number; dismissed: number } }
  recentErrors: { feature: string; at: string; error: string }[]
  disagreements: { feature: string; at: string; input: Record<string, unknown>; jev: string; old: string; used: string; outcome: string }[]
}

const NAMES = { approval: 'Hearing a yes', markup: 'Sorting mark-ups', links: 'Story map links', gate: 'Message gate (watching only)' } as const
const OLD = { approval: 'the word rules', markup: 'Socra’s reading', links: 'Socra', gate: 'what Socra’s turn did' } as const
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`)
const rate = (x: { accepted: number; dismissed: number }) => `${pct(x.accepted, x.accepted + x.dismissed)} accepted (${x.accepted} of ${x.accepted + x.dismissed})`

export function JevValue() {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { void api<Stats>('/api/jev', { cache: 'no-store' }).then(setS).catch((e: Error) => setErr(e.message)) }, [])
  if (err) return <p className="studio-muted">{err}</p>
  if (!s) return <p className="studio-muted">Reading Jev’s record…</p>
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">TypeSafe Jev</p><h3>Small judgments, answered in milliseconds</h3></div><Gauge size={16} /></div>
        <p className="studio-muted">{s.on ? 'On.' : s.configured ? 'Off (BACC_JEV=off).' : 'Off: add the TypeSafe key under Models and keys.'} Jev answers typed questions with probabilities; code decides. When Jev is unsure or fails, the old method decides, and every call is logged beside what the old method said.</p>
        <div className="studio-list">
          {(Object.keys(NAMES) as (keyof typeof NAMES)[]).map((k) => {
            const f = s.features[k]
            return <div key={k} className="studio-list-row"><div className="studio-row-main"><strong>{NAMES[k]}</strong><small>{f.calls} calls · Jev decided {f.usedJev} · {f.compared ? `agrees with ${OLD[k]} ${pct(f.agreed, f.compared)} (${f.agreed} of ${f.compared})` : `nothing to compare with ${OLD[k]} yet`} · median {f.medianMs} ms, 95% under {f.p95Ms} ms · {f.tokens.toLocaleString()} tokens, {usd(s.cost[k] ?? 0)}{f.errors ? ` · ${f.errors} failed (old method used)` : ''}</small></div><span className={f.calls ? 'studio-ok' : 'studio-muted'}>{f.calls ? 'in use' : 'not used yet'}</span></div>
          })}
        </div>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">The value</p><h3>What people did afterwards</h3></div></div>
        <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>Yeses the word rules missed</strong><small>Jev heard a yes the rules didn’t: {s.approvals.rescued}. Jev stopped a false yes (“yeah no…”): {s.approvals.blocked}.</small></div></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Wrong approvals</strong><small>Approvals Jev made that a person undid: {s.approvals.undone} of {s.approvals.byJev} ({pct(s.approvals.undone, s.approvals.byJev)}).</small></div></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Story map links</strong><small>Jev’s: {rate(s.links.jev)}. Socra’s: {rate(s.links.socra)}.</small></div></div>
        </div>
      </section>
      {s.gate.messages > 0 && <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Message gate · watching only, nothing is skipped</p><h3>Would Jev have saved a Socra turn?</h3></div></div>
        <p className="studio-muted">For each message, Jev says whether it needs a full Socra turn; afterwards the Studio records what the turn really was (light = only talking, no specialist, no changes). Questions and limits are in the typesafe-ai skill’s gate.json.</p>
        <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>{s.gate.messages} messages judged</strong><small>Jev: light {s.gate.jevLight}, full {s.gate.jevFull}, unsure {s.gate.unsettled} · turns finished {s.gate.turnsDone}</small></div></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Turns Jev would have saved: {s.gate.wouldSave}</strong><small>Jev said light and the turn really was light ({pct(s.gate.wouldSave, s.gate.wouldSave + s.gate.wouldHaveBroken)} of its light calls).</small></div></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Turns it would have wrongly cut: {s.gate.wouldHaveBroken}</strong><small>Jev said light, but the turn did real work. This must stay near zero before anything is skipped.</small></div></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Savings Jev missed: {s.gate.missedSaving}</strong><small>Jev said full, but the turn was only a reply.</small></div></div>
        </div>
        {s.gate.recent.length > 0 && <div className="studio-list">{s.gate.recent.map((d, i) => <div key={i} className="studio-list-row"><div className="studio-row-main"><strong>Jev {d.jev}, turn {d.socra} ({d.did})</strong><Rich text={String(d.input?.owner_message ?? '')} lines={3} /></div></div>)}</div>}
      </section>}
      {s.disagreements.length > 0 && <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Where they differ</p><h3>Jev against the old method</h3></div></div>
        <div className="studio-list">{s.disagreements.map((d, i) => <div key={i} className="studio-list-row"><div className="studio-row-main"><strong>{NAMES[d.feature as keyof typeof NAMES] ?? d.feature}: Jev {d.jev}, old {d.old}{d.used === 'jev' ? ' (Jev’s answer used)' : ''}{d.outcome ? ` · ${d.outcome}` : ''}</strong><Rich text={Object.entries(d.input ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join('\n')} lines={4} /></div></div>)}</div>
      </section>}
      {s.recentErrors.length > 0 && <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Failures</p><h3>Calls that failed (old method used)</h3></div></div>
        <div className="studio-list">{s.recentErrors.map((e, i) => <div key={i} className="studio-list-row"><div className="studio-row-main"><strong>{NAMES[e.feature as keyof typeof NAMES] ?? e.feature}</strong><small>{e.error}</small></div></div>)}</div>
      </section>}
    </div>
  )
}
