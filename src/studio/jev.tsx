'use client'
// Settings > Jev: what TypeSafe's Jev does for the Studio, measured against the old method.
// Every number comes from logged calls (JevCall) and from what people did afterwards.
import { useEffect, useState } from 'react'
import { api } from './live'
import { Row, Section, StatusBadge } from './kit'

type F = { calls: number; errors: number; usedJev: number; compared: number; agreed: number; medianMs: number; p95Ms: number; tokens: number }
type Stats = {
  configured: boolean; on: boolean
  features: { approval: F; markup: F; links: F }
  cost: Record<string, number>
  approvals: { rescued: number; blocked: number; byJev: number; undone: number }
  links: { jev: { accepted: number; dismissed: number }; socra: { accepted: number; dismissed: number } }
  recentErrors: { feature: string; at: string; error: string }[]
  disagreements: { feature: string; at: string; input: Record<string, unknown>; jev: string; old: string; used: string; outcome: string }[]
}

const NAMES = { approval: 'Hearing a yes', markup: 'Sorting mark-ups', links: 'Story map links' } as const
const OLD = { approval: 'the word rules', markup: 'Socra’s reading', links: 'Socra' } as const
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`)
const rate = (x: { accepted: number; dismissed: number }) => `${pct(x.accepted, x.accepted + x.dismissed)} accepted (${x.accepted} of ${x.accepted + x.dismissed})`

export function JevValue() {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { void api<Stats>('/api/jev', { cache: 'no-store' }).then(setS).catch((e: Error) => setErr(e.message)) }, [])
  if (err) return <p className="text-sm text-muted-foreground">{err}</p>
  if (!s) return <p className="text-sm text-muted-foreground">Reading Jev’s record…</p>
  return (
    <>
      <Section
        title="TypeSafe Jev"
        description="Jev answers three small typed questions with probabilities, and code decides. When Jev is unsure or fails, the old method decides. Every call is logged beside what the old method said."
        action={<StatusBadge tone={s.on ? 'ok' : 'off'}>{s.on ? 'On' : s.configured ? 'Off (BACC_JEV=off)' : 'Off: add the TypeSafe key'}</StatusBadge>}
      >
        {(Object.keys(NAMES) as (keyof typeof NAMES)[]).map((k) => {
          const f = s.features[k]
          return <Row key={k} title={NAMES[k]} badge={<StatusBadge tone={f.calls ? 'ok' : 'off'}>{f.calls ? 'In use' : 'Not used yet'}</StatusBadge>} detail={<>{f.calls} calls · Jev decided {f.usedJev} · {f.compared ? `agrees with ${OLD[k]} ${pct(f.agreed, f.compared)} (${f.agreed} of ${f.compared})` : `nothing to compare with ${OLD[k]} yet`} · median {f.medianMs} ms, 95% under {f.p95Ms} ms · {f.tokens.toLocaleString()} tokens, {usd(s.cost[k] ?? 0)}{f.errors ? ` · ${f.errors} failed (old method used)` : ''}</>} />
        })}
      </Section>
      <Section title="What people did afterwards" description="The value, measured by what happened next.">
        <Row title="Yeses the word rules missed" detail={<>Jev heard a yes the rules didn’t: {s.approvals.rescued}. Jev stopped a false yes (“yeah no…”): {s.approvals.blocked}.</>} />
        <Row title="Wrong approvals" detail={<>Approvals Jev made that a person undid: {s.approvals.undone} of {s.approvals.byJev} ({pct(s.approvals.undone, s.approvals.byJev)}).</>} />
        <Row title="Story map links" detail={<>Jev’s: {rate(s.links.jev)}. Socra’s: {rate(s.links.socra)}.</>} />
      </Section>
      {s.disagreements.length > 0 && <Section title="Where Jev and the old method differ">
        {s.disagreements.map((d, i) => <Row key={i} title={<>{NAMES[d.feature as keyof typeof NAMES] ?? d.feature}: Jev {d.jev}, old {d.old}{d.used === 'jev' ? ' (Jev’s answer used)' : ''}{d.outcome ? ` · ${d.outcome}` : ''}</>} detail={Object.values(d.input ?? {}).map(String).join(' → ').slice(0, 220)} />)}
      </Section>}
      {s.recentErrors.length > 0 && <Section title="Calls that failed" description="The old method was used for each of these.">
        {s.recentErrors.map((e, i) => <Row key={i} title={NAMES[e.feature as keyof typeof NAMES] ?? e.feature} detail={e.error} />)}
      </Section>}
    </>
  )
}
