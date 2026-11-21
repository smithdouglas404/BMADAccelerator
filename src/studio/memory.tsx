'use client'
// Settings > Agent memory (Doug, Nov 21): click an agent to see what Letta and Mem0 really hold for it,
// and a plain-language narrative the document model writes from exactly those records, each sentence
// linked to the record it rests on. Read-only. Nothing here is written in advance.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Database, RefreshCw, Search, Sparkles, UserRound } from 'lucide-react'
import { api } from './live'
import { useMe } from './flow'

type Health = { mem0: { configured: boolean; up: boolean }; letta: { up: boolean; note?: string } }
type Usage = { reads: number; recordsRead: number; writes: number; reflections: number; asked: number; lastRead: string | null; lastWrite: string | null; lastUsed: string | null; since: string | null; runs?: number; withPersona?: number }
type Verdict = { level: 'used' | 'write-only' | 'read-only' | 'unused'; text: string }
type StudioAgent = { ref: string; name: string; title: string; lettaAgent: string | null; mem0Agent: string; verdict: Verdict['level'] }
type AppAgent = { ref: string; name: string; purpose: string; status: string; persona: boolean; facts: boolean; useCase: string; customer: string }
type List = { status: Health; customers: string[]; useCases: { id: string; name: string; customer: string }[]; studio: StudioAgent[]; apps: AppAgent[] }
type Block = { id?: string; label: string; value: string; description?: string | null; limit?: number | null; updated_at?: string | null; read_only?: boolean | null }
type Passage = { id: string; text: string; created_at?: string | null }
type Mind = { person: string; lettaId: string; lettaName: string; blocks: Block[]; passages: Passage[] }
type Fact = { id: string; memory: string; created_at?: string | null; updated_at?: string | null; metadata?: Record<string, unknown> | null }
type Rec = { cite: string; kind: string; id: string; title: string; when: string; cited?: boolean }
type Narr = { id: string; headline: string; sentences: { text: string; cites: string[] }[]; gaps: string[]; records: Rec[]; model: string; auth: string; dropped: number; by: string; ms: number; createdAt: string }
type Detail = {
  searched?: string
  ref: string; agentName: string; agentTitle: string; scopeNote: string
  usage: Usage | null; usageNote: string; verdict: Verdict | null; recent: { at: string; kind: string; store: string; count: number; source: string; detail: string }[]; sleeptime: 'on' | 'unsupported' | 'unknown' | null
  config: { purpose: string; status: string; personaOn: boolean; factsOn: boolean; personaText: string } | null
  minds: Mind[]; facts: Fact[]; records: Rec[]; notes: string[]; narrative: Narr | null; narrativeStale: boolean
}

const when = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const anchor = (id: string) => `mem-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`
const meta = (f: Fact, k: string) => { const v = (f.metadata ?? {})[k]; return typeof v === 'string' || typeof v === 'number' ? String(v) : '' }
const LEVEL: Record<string, string> = { used: 'used', 'write-only': 'write-only', 'read-only': 'read-only', unused: 'not used yet' }
const EVENT: Record<string, string> = { recall: 'read', write: 'saved a fact', lesson: 'saved a lesson', reflect: 'Letta persona learned', ask: 'was asked' }
const STATUS: Record<string, string> = { proposed: 'waiting for a yes', approved: 'on', off: 'off' }

export function AgentMemory() {
  const [me] = useMe()
  const [customer, setCustomer] = useState('')
  const [useCase, setUseCase] = useState('')
  const [list, setList] = useState<List | null>(null)
  const [ref, setRef] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sq, setSq] = useState('')
  const [person, setPerson] = useState(0)
  const [writing, setWriting] = useState(false)
  const [flash, setFlash] = useState('')
  const [hist, setHist] = useState<Record<string, { at?: string; old?: string; now?: string; event?: string }[] | string>>({})
  const [closed, setClosed] = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const a = p.get('agent'); if (a) setRef(a)
    const u = p.get('useCase'); if (u) setUseCase(u)
  }, [])
  const filter = useMemo(() => new URLSearchParams({ ...(customer ? { customer } : {}), ...(useCase ? { useCase } : {}) }).toString(), [customer, useCase])
  useEffect(() => { void api<List>(`/api/memory/agents?${filter}`, { cache: 'no-store' }).then(setList).catch((e) => setClosed(e instanceof Error ? e.message : String(e))) }, [filter])
  const load = useCallback(async () => {
    if (!ref) return
    setLoading(true); setError('')
    try { setDetail(await api<Detail>(`/api/memory/agent?ref=${encodeURIComponent(ref)}&${filter}${sq ? `&q=${encodeURIComponent(sq)}` : ''}`, { cache: 'no-store' })) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setDetail(null) }
    setLoading(false)
  }, [ref, filter, sq])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setPerson(0); setQ(''); setSq('') }, [ref])

  const explain = async () => {
    setWriting(true); setError('')
    try {
      const n = await api<Narr>('/api/memory/agent/narrative', { json: { ref, customer, useCase, by: me.name || me.role } })
      setDetail((d) => (d ? { ...d, narrative: n, narrativeStale: false } : d))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setWriting(false)
  }
  const showHistory = async (id: string) => {
    if (hist[id]) { setHist((h) => { const c = { ...h }; delete c[id]; return c }); return }
    try {
      const r = await api<{ history: Record<string, unknown>[] }>(`/api/memory/fact-history?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      setHist((h) => ({ ...h, [id]: r.history.map((x) => ({ at: String(x.created_at ?? x.updated_at ?? ''), old: x.old_memory ? String(x.old_memory) : '', now: x.new_memory ? String(x.new_memory) : '', event: String(x.event ?? '') })) }))
    } catch (e) { setHist((h) => ({ ...h, [id]: e instanceof Error ? e.message : String(e) })) }
  }
  const jump = (n: Narr, cite: string) => {
    const r = n.records.find((x) => x.cite === cite)
    if (!r) return
    const el = document.getElementById(anchor(r.id))
    if (!el) { setError(`${cite} is no longer in this agent's memory (it changed after the narrative was written).`); return }
    const i = detail?.minds.findIndex((m) => m.blocks.some((b) => (b.id ?? `${m.person}:${b.label}`) === r.id) || m.passages.some((p) => p.id === r.id)) ?? -1
    if (i >= 0 && i !== person) setPerson(i)
    setFlash(r.id)
    window.setTimeout(() => document.getElementById(anchor(r.id))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
    window.setTimeout(() => setFlash(''), 2400)
  }

  const citeOf = useMemo(() => new Map((detail?.records ?? []).map((r) => [r.id, r.cite])), [detail])
  const facts = useMemo(() => {
    const t = sq ? '' : q.trim().toLowerCase()
    return (detail?.facts ?? []).filter((f) => !t || f.memory.toLowerCase().includes(t) || JSON.stringify(f.metadata ?? {}).toLowerCase().includes(t))
  }, [detail, q, sq])
  const ucs = (list?.useCases ?? []).filter((u) => !customer || u.customer.trim().toLowerCase() === customer.toLowerCase())
  const mind = detail?.minds[person]

  return (
    <div className="mem-page">
      <div className="mem-intro">
        <p className="eyebrow">Agent memory · Letta + Mem0</p>
        <h2>What each agent <em>remembers,</em><br />and how it shapes the next answer.</h2>
        <p>Pick an agent to see its Letta persona and memory blocks and its Mem0 facts exactly as stored, then press Explain for a plain-language reading written only from those records.</p>
        {list && <div className="mem-health">
          <span className={list.status.mem0.up ? 'studio-ok' : 'studio-warn'}><Database size={13} /> Mem0 {list.status.mem0.up ? 'running' : list.status.mem0.configured ? 'not answering' : 'not configured'}</span>
          <span className={list.status.letta.up ? 'studio-ok' : 'studio-warn'}><Brain size={13} /> Letta {list.status.letta.up ? 'running' : list.status.letta.note || 'not answering'}</span>
        </div>}
      </div>

      {closed ? <div className="studio-card mem-closed"><p className="eyebrow">Closed here</p><h3>Agent memory isn’t shown on this address</h3><p className="studio-muted">{closed}</p></div> : <>
      <div className="mem-filters">
        <label>Customer<select value={customer} onChange={(e) => { setCustomer(e.target.value); setUseCase('') }}><option value="">All customers</option>{(list?.customers ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Use case<select value={useCase} onChange={(e) => setUseCase(e.target.value)}><option value="">All use cases</option>{ucs.map((u) => <option key={u.id} value={u.id}>{u.name}{u.customer ? ` · ${u.customer}` : ''}</option>)}</select></label>
      </div>

      <div className="mem-grid">
        <aside className="mem-list">
          {!list ? <p className="studio-muted">Reading the agents…</p> : <>
            <p className="eyebrow">Socra’s team · across products</p>
            {list.studio.map((a) => <button key={a.ref} type="button" className={`mem-agent${ref === a.ref ? ' is-active' : ''}`} onClick={() => setRef(a.ref)}>
              <strong>{a.name}</strong><small>{a.title}{a.lettaAgent ? '' : ' · no Letta agent yet'} · <span className={`mem-level is-${a.verdict}`}>{LEVEL[a.verdict]}</span></small>
            </button>)}
            <p className="eyebrow">Product agents · {list.apps.length}</p>
            {list.apps.length === 0 && <p className="studio-muted">No product has its own agents{customer || useCase ? ' in this filter' : ''} yet.</p>}
            {list.apps.map((a) => <button key={a.ref} type="button" className={`mem-agent${ref === a.ref ? ' is-active' : ''}`} onClick={() => setRef(a.ref)}>
              <strong>{a.name}</strong><small>{a.useCase}{a.customer ? ` · ${a.customer}` : ''} · {STATUS[a.status] ?? a.status}</small>
            </button>)}
          </>}
        </aside>

        <section className="mem-detail">
          {!ref && <div className="studio-card"><p className="studio-muted">Choose an agent on the left.</p></div>}
          {ref && loading && !detail && <div className="studio-card"><p className="studio-muted">Reading Letta and Mem0…</p></div>}
          {error && <p className="studio-warn mem-error">{error}</p>}
          {detail && <>
            <div className="studio-card mem-head">
              <div><p className="eyebrow">{detail.agentTitle}</p><h3>{detail.agentName}</h3><p className="studio-muted">{detail.scopeNote}</p>
                {detail.config && <p className="studio-muted">Purpose: {detail.config.purpose} · Letta persona {detail.config.personaOn ? 'on' : 'off'} · Mem0 facts {detail.config.factsOn ? 'on' : 'off'}</p>}</div>
              <button type="button" className="button button-quiet button-small" onClick={() => void load()} disabled={loading}><RefreshCw size={13} /> Read again</button>
            </div>
            {detail.notes.length > 0 && <ul className="mem-notes">{detail.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

            {detail.verdict && detail.usage && <div className="studio-card mem-usage">
              <div className="stack-header"><div><p className="eyebrow">Is it used?</p><h3><span className={`mem-level is-${detail.verdict.level}`}>{LEVEL[detail.verdict.level]}</span> {detail.verdict.text}</h3></div></div>
              <dl className="mem-usage-grid">
                <div><dt>Read</dt><dd>{detail.usage.reads}</dd><small>{detail.usage.lastRead ? `last ${when(detail.usage.lastRead)}` : 'never'}</small></div>
                <div><dt>Written</dt><dd>{detail.usage.writes + detail.usage.reflections}</dd><small>{detail.usage.lastWrite ? `last ${when(detail.usage.lastWrite)}` : 'never'}</small></div>
                <div><dt>Asked</dt><dd>{detail.usage.asked}</dd><small>by other agents</small></div>
                {detail.usage.runs !== undefined && <div><dt>Runs</dt><dd>{detail.usage.runs}</dd><small>{detail.usage.withPersona ?? 0} with its persona loaded</small></div>}
                <div><dt>Last used</dt><dd className="mem-usage-when">{detail.usage.lastUsed ? when(detail.usage.lastUsed) : 'never'}</dd></div>
              </dl>
              {detail.usageNote && <p className="mem-trace">{detail.usageNote}</p>}
              {detail.sleeptime && <p className="mem-trace">Letta background reflection (sleep-time agent): {detail.sleeptime === 'on' ? 'on, it reviews recent conversations between turns' : detail.sleeptime === 'unsupported' ? 'this Letta server refused it, so it is off' : 'not tried yet in this server run'}.</p>}
              {detail.recent.length > 0 && <ul className="mem-recent">{detail.recent.map((r, i) => <li key={i}><small>{when(r.at)}</small> {EVENT[r.kind] ?? r.kind} · {r.store === 'letta' ? 'Letta' : 'Mem0'}{r.count > 1 ? ` · ${r.count} records` : ''}{r.source ? ` · ${r.source}` : ''}{r.detail ? ` · ${r.detail}` : ''}</li>)}</ul>}
            </div>}

            <div className="studio-card mem-narrative">
              <div className="stack-header"><div><p className="eyebrow">In plain words</p><h3>{detail.narrative ? detail.narrative.headline || 'What this memory means' : 'What this memory means'}</h3></div><Sparkles size={16} /></div>
              {!detail.narrative && <p className="studio-muted">{detail.records.length ? `Nothing written yet. Explain reads the ${detail.records.length} record${detail.records.length === 1 ? '' : 's'} below with the document model and cites each one it relies on.` : 'This agent has no memory yet, so there is nothing to explain.'}</p>}
              {detail.narrative && <>
                {detail.narrativeStale && <p className="studio-warn">Its memory changed after this was written. Explain again to bring it up to date.</p>}
                <ol className="mem-sentences">{detail.narrative.sentences.map((s, i) => <li key={i}>{s.text} {s.cites.map((c) => <button key={c} type="button" className="mem-cite" title={detail.narrative!.records.find((r) => r.cite === c)?.title} onClick={() => jump(detail.narrative!, c)}>{c}</button>)}</li>)}</ol>
                {detail.narrative.gaps.length > 0 && <><p className="eyebrow">Not in its memory</p><ul className="mem-gaps">{detail.narrative.gaps.map((g) => <li key={g}>{g}</li>)}</ul></>}
                <p className="mem-trace">Written {when(detail.narrative.createdAt)} by {detail.narrative.model} ({detail.narrative.auth === 'plan' ? 'Claude plan' : 'API key'}) in {(detail.narrative.ms / 1000).toFixed(1)} s from {detail.narrative.records.length} records{detail.narrative.by ? ` · asked by ${detail.narrative.by}` : ''}{detail.narrative.dropped ? ` · ${detail.narrative.dropped} sentence${detail.narrative.dropped === 1 ? '' : 's'} without a real source left out` : ''}</p>
              </>}
              {detail.records.length > 0 && <button type="button" className="button button-primary button-small" onClick={() => void explain()} disabled={writing}><Sparkles size={13} /> {writing ? 'Reading its memory…' : detail.narrative ? 'Explain again' : 'Explain'}</button>}
            </div>

            <div className="studio-card">
              <div className="stack-header"><div><p className="eyebrow">Letta · persona and working memory</p><h3>Who it is, and what it keeps in mind</h3></div><Brain size={16} /></div>
              {detail.minds.length === 0 && <p className="studio-muted">No Letta memory for this agent.</p>}
              {detail.minds.length > 1 && <div className="studio-tabs mem-people">{detail.minds.map((m, i) => <button key={m.lettaId} type="button" className={i === person ? 'is-active' : ''} onClick={() => setPerson(i)}><UserRound size={12} /> {m.person}</button>)}</div>}
              {mind && <>
                <p className="mem-trace">Letta agent {mind.lettaName}{mind.person ? `, its memory of ${mind.person}` : ''}</p>
                {mind.blocks.map((b) => { const id = b.id ?? `${mind.person}:${b.label}`; return <article key={id} id={anchor(id)} className={`mem-block${flash === id ? ' is-flash' : ''}`}>
                  <div className="mem-block-top"><span className="mem-cite is-static">{citeOf.get(id)}</span><strong>{b.label}</strong><small>{[b.read_only ? 'read-only' : '', b.limit ? `${(b.value ?? '').length} of ${b.limit} characters` : '', b.updated_at ? `changed ${when(b.updated_at)}` : ''].filter(Boolean).join(' · ')}</small></div>
                  {b.description && <p className="studio-muted">{b.description}</p>}
                  <pre>{b.value}</pre>
                </article> })}
                {mind.passages.length > 0 && <><p className="eyebrow">Archival notes · {mind.passages.length}</p>{mind.passages.map((p) => <article key={p.id} id={anchor(p.id)} className={`mem-block${flash === p.id ? ' is-flash' : ''}`}><div className="mem-block-top"><span className="mem-cite is-static">{citeOf.get(p.id)}</span><small>{when(p.created_at)}</small></div><pre>{p.text}</pre></article>)}</>}
              </>}
            </div>

            <div className="studio-card">
              <div className="stack-header"><div><p className="eyebrow">Mem0 · long-term facts · {detail.facts.length}</p><h3>What it can recall later</h3></div><Database size={16} /></div>
              <label className="mem-search"><Search size={13} /><input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setSq('') }} onKeyDown={(e) => { if (e.key === 'Enter') setSq(q.trim()) }} placeholder="Filter its facts; press Enter to ask Mem0 by meaning" /></label>
              {detail.searched && <p className="mem-trace">Mem0 search for “{detail.searched}”: {detail.facts.length} closest record{detail.facts.length === 1 ? '' : 's'} · <button type="button" className="text-button" onClick={() => { setQ(''); setSq('') }}>Show all</button></p>}
              {facts.length === 0 && <p className="studio-muted">{detail.facts.length ? 'No fact matches that search.' : 'No Mem0 facts for this agent.'}</p>}
              <div className="mem-facts">{facts.map((f) => <article key={f.id} id={anchor(f.id)} className={`mem-fact${flash === f.id ? ' is-flash' : ''}`}>
                <div className="mem-block-top"><span className="mem-cite is-static">{citeOf.get(f.id)}</span>{meta(f, 'kind') && <span className="studio-agent-tag">{meta(f, 'kind')}</span>}<small>{[meta(f, 'use_case_title'), meta(f, 'source') || meta(f, 'app_id'), when(f.updated_at ?? f.created_at)].filter(Boolean).join(' · ')}</small></div>
                <p>{f.memory}</p>
                <button type="button" className="text-button" onClick={() => void showHistory(f.id)}>{hist[f.id] ? 'Hide history' : 'History'}</button>
                {typeof hist[f.id] === 'string' && <p className="studio-warn">{hist[f.id] as string}</p>}
                {Array.isArray(hist[f.id]) && ((hist[f.id] as { at?: string; old?: string; now?: string; event?: string }[]).length === 0 ? <p className="studio-muted">Mem0 has no earlier version of this record.</p> : <ul className="mem-recent">{(hist[f.id] as { at?: string; old?: string; now?: string; event?: string }[]).map((h, i) => <li key={i}><small>{when(h.at)}</small> {h.event?.toLowerCase()}{h.old ? <> · was “{h.old}”</> : null}{h.now ? <> · now “{h.now}”</> : null}</li>)}</ul>)}
              </article>)}</div>
            </div>
          </>}
        </section>
      </div>
      </>}
    </div>
  )
}
