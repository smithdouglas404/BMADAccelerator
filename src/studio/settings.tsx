'use client'
// Settings: models and keys, MCP connectors (for every product or chosen ones), Agent Skills, and memory.
// Keys and connector secrets go in once, are stored encrypted, and are never shown again (last four only).
import { useEffect, useState } from 'react'
import { Check, Plug, Plus, Trash2, Upload, Wrench } from 'lucide-react'
import { api } from './live'
import { StudioTop } from './pages'
import { ConnectTab } from './connect'
import { JevValue } from './jev'
import { AgentMemory } from './memory'
import { Rich } from './rich'
import { fmtWhen } from '@/lib/studio/richText'
import { ECC_COPY } from '../lib/eccCopy'

type KeyStatus = { env: string; name: string; source: 'saved' | 'env' | 'missing'; last4: string }
type Status = { providers: (KeyStatus & { id: string; models: string[] })[]; other: KeyStatus[]; claudePlan: boolean; roles: { env: string; label: string; note: string; providers: string[]; current: string; saved: boolean }[] }
type Connector = { id: string; name: string; label: string; transport: string; url: string; command: string; args: string[]; secretNames: string[]; hasSecrets: boolean; enabled: boolean; allProducts: boolean; useCases: string[] }
type Product = { id: string; name: string }

type LibSkill = { id: string; name: string; description: string; source: 'studio' | 'ecc' | 'yours'; origin: string; alwaysOn: boolean; core: boolean; allProducts: boolean; useCases: string[]; valid: boolean; report: string; usedBy: string[] }
type Metric = { used: number; viewed: number; lastUsed: string | null; lastViewed: string | null; agents: string[]; useCases: number }
const NO_METRIC: Metric = { used: 0, viewed: 0, lastUsed: null, lastViewed: null, agents: [], useCases: 0 }
const SORTS = [['name', 'Name'], ['used', 'Most used'], ['viewed', 'Most viewed'], ['recent', 'Last used'], ['never', 'Never used first']] as const
const SOURCES = [['all', 'All'], ['studio', 'Ours'], ['ecc', 'ECC'], ['yours', 'Yours']] as const
const PAGE = 40

export function SettingsPage() {
  const [tab, setTab] = useState<'models' | 'connectors' | 'connect' | 'skills' | 'memory' | 'jev'>('models')
  const [toast, setToast] = useState('')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'connectors' || t === 'connect' || t === 'skills' || t === 'memory' || t === 'jev') setTab(t)
  }, [])
  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(''), 5000); return () => window.clearTimeout(t) } }, [toast])
  return (
    <div className="studio-page">
      <StudioTop active="settings" />
      <div className="page-wrap">
        <div className="page-intro"><div><p className="eyebrow">Settings</p><h1>The plumbing,<br /><em>out of the way.</em></h1><p>Three places to know: AI models and keys (what runs Socra), Tools the Studio uses (outside systems Socra can call), and Connect your assistant (how Muse or Claude reaches the Studio).</p></div></div>
        <div className="studio-tabs">{([['models', 'AI models and keys'], ['connectors', 'Tools the Studio uses'], ['connect', 'Connect your assistant (Muse, Claude)'], ['skills', 'Skills'], ['memory', 'Agent memory'], ['jev', 'Jev']] as const).map(([k, l]) => <button key={k} type="button" className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'models' && <Models setToast={setToast} />}
        {tab === 'connectors' && <Connectors setToast={setToast} />}
        {tab === 'connect' && <ConnectTab setToast={setToast} />}
        {tab === 'skills' && <Skills setToast={setToast} />}
        {tab === 'memory' && <AgentMemory />}
        {tab === 'jev' && <JevValue />}
      </div>
      {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </div>
  )
}

function KeyRow({ k, onSaved, setToast }: { k: KeyStatus; onSaved: (s: Status) => void; setToast: (s: string) => void }) {
  const [value, setValue] = useState('')
  const save = async () => {
    try {
      onSaved(await api<Status>('/api/settings/models', { method: 'PUT', json: { action: 'key', env: k.env, value } }))
      setValue('')
      setToast(`${k.name} saved. It is stored encrypted and never shown again.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const remove = async () => onSaved(await api<Status>('/api/settings/models', { method: 'PUT', json: { action: 'removeKey', env: k.env } }))
  return (
    <div className="studio-list-row">
      <div className="studio-row-main"><strong>{k.name}</strong><small>{k.source === 'missing' ? 'not set' : `set (${k.source === 'saved' ? 'here' : '.env'}) · ends ${k.last4}`}</small></div>
      {k.source === 'saved' ? <button type="button" className="button button-quiet button-small" onClick={() => void remove()}>Remove</button> : <span />}
      <div className="studio-review-actions"><input className="studio-input" style={{ marginTop: 0, flex: 1 }} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.source === 'missing' ? 'Paste the key here (never in chat)' : 'Replace the key'} /><button type="button" className="button button-primary button-small" disabled={!value.trim()} onClick={() => void save()}>Save</button></div>
    </div>
  )
}

function Models({ setToast }: { setToast: (s: string) => void }) {
  const [s, setS] = useState<Status | null>(null)
  useEffect(() => { void api<Status>('/api/settings/models', { cache: 'no-store' }).then(setS).catch((e: Error) => setToast(e.message)) }, [setToast])
  if (!s) return <p className="studio-muted">Loading…</p>
  const models = (providers: string[]) => s.providers.filter((p) => providers.includes(p.id)).flatMap((p) => p.models)
  const setModel = async (role: string, model: string) => {
    try { setS(await api<Status>('/api/settings/models', { method: 'PUT', json: { action: 'model', role, model: model || null } })); setToast('Model saved; it applies to the next run.') } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Claude plan</p><h3>{s.claudePlan ? 'Signed in: Socra and Claude Code run on your plan' : 'Not signed in yet'}</h3></div>{s.claudePlan ? <Check size={16} /> : <Plug size={16} />}</div>
        <p className="studio-muted">{s.claudePlan ? 'Nothing to do here.' : 'Claude is signed in once, during setup on this computer. Until then everything you say is kept and Socra catches up when it starts.'}</p>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Models</p><h3>Which model does each job</h3></div><Wrench size={16} /></div>
        <div className="studio-kv">{s.roles.map((r) => <label key={r.env}>{r.label}<select value={r.current} onChange={(e) => void setModel(r.env, e.target.value)}>{!models(r.providers).includes(r.current) && <option value={r.current}>{r.current || 'default'}</option>}{models(r.providers).map((m) => <option key={m} value={m}>{m}</option>)}</select><small className="studio-muted" style={{ marginTop: 0 }}>{r.note}</small></label>)}</div>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Keys</p><h3>Stored encrypted, never shown again</h3></div><Plug size={16} /></div>
        <div className="studio-list">{[...s.providers, ...s.other].map((k) => <KeyRow key={k.env} k={k} onSaved={setS} setToast={setToast} />)}</div>
      </section>
    </div>
  )
}

const EMPTY = { name: '', label: '', transport: 'http', url: '', command: '', args: '', secretKey: '', secretValue: '', allProducts: true, useCases: [] as string[] }

function Connectors({ setToast }: { setToast: (s: string) => void }) {
  const [rows, setRows] = useState<Connector[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState(EMPTY)
  const [tests, setTests] = useState<Record<string, string>>({})
  const load = () => void api<Connector[]>('/api/connectors', { cache: 'no-store' }).then(setRows).catch(() => setRows([]))
  useEffect(() => { load(); void api<Product[]>('/api/use-cases', { cache: 'no-store' }).then(setProducts).catch(() => setProducts([])) }, [])
  const add = async () => {
    try {
      await api('/api/connectors', { json: { name: form.name, label: form.label, transport: form.transport, url: form.url, command: form.command, args: form.args.split(/\s+/).filter(Boolean), secrets: form.secretKey ? { [form.secretKey]: form.secretValue } : {}, allProducts: form.allProducts, useCases: form.useCases } })
      setForm(EMPTY)
      setToast('Connector added. Socra and Claude Code can use it from the next run.')
      load()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const patch = async (id: string, body: Record<string, unknown>) => { await api(`/api/connectors/${id}`, { method: 'PATCH', json: body }).catch((e: Error) => setToast(e.message)); load() }
  const test = async (id: string) => {
    setTests({ ...tests, [id]: 'Testing…' })
    const r = await api<{ ok: boolean; tools: string[]; error?: string }>(`/api/connectors/${id}`, { method: 'POST' }).catch((e: Error) => ({ ok: false, tools: [], error: e.message }))
    setTests((t) => ({ ...t, [id]: r.ok ? `Works: ${r.tools.length} tools (${r.tools.slice(0, 6).join(', ')}${r.tools.length > 6 ? '…' : ''})` : `Didn’t connect: ${r.error ?? 'no answer'}` }))
  }
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Connectors · {rows.length}</p><h3>Outside tools Socra can call</h3></div><Plug size={16} /></div>
        <p className="studio-muted"><strong>This is for the Studio calling other systems</strong> (Notion, a database, your own API). It is not where Meta Muse or Claude connects to the Studio: for that, open the “Connect your assistant” tab.</p>
        {rows.length === 0 && <p className="studio-muted">None yet. Add any MCP server (Notion, a database, your own API) for every product or chosen ones.</p>}
        <div className="studio-list">{rows.map((c) => (
          <div key={c.id} className="studio-list-row">
            <div className="studio-row-main"><strong>{c.label || c.name}</strong><small>{c.name} · {c.transport} · {c.transport === 'stdio' ? c.command : c.url} · {c.allProducts ? 'every product' : `${c.useCases.length} products`}{c.secretNames.length ? ` · secrets: ${c.secretNames.join(', ')}` : ''}</small></div>
            <label className="studio-toggle"><input type="checkbox" checked={c.enabled} onChange={(e) => void patch(c.id, { enabled: e.target.checked })} /> on</label>
            <div className="studio-review-actions"><button type="button" className="button button-quiet button-small" onClick={() => void test(c.id)}>Test</button><button type="button" className="icon-button subtle" aria-label="Remove connector" onClick={() => void api(`/api/connectors/${c.id}`, { method: 'DELETE' }).then(load)}><Trash2 size={13} /></button>{tests[c.id] && <small className="studio-muted" style={{ marginTop: 0 }}>{tests[c.id]}</small>}</div>
          </div>
        ))}</div>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Add a connector</p><h3>Any MCP server</h3></div><Plus size={16} /></div>
        <div className="studio-kv">
          <label>Short name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="notion" /></label>
          <label>Label<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Team Notion" /></label>
          <label>How it connects<select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })}><option value="http">Streamable HTTP</option><option value="sse">SSE</option><option value="stdio">Command (stdio)</option></select></label>
          {form.transport === 'stdio' ? <><label>Command<input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npx" /></label><label>Arguments<input value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder="-y @scope/server" /></label></> : <label>Address<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://mcp.example.com/mcp" /></label>}
          <label>Secret name (a header or environment variable, optional)<input value={form.secretKey} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} placeholder={form.transport === 'stdio' ? 'API_KEY' : 'Authorization'} /></label>
          {form.secretKey && <label>Secret value (stored encrypted, never shown again)<input type="password" autoComplete="off" value={form.secretValue} onChange={(e) => setForm({ ...form, secretValue: e.target.value })} /></label>}
          <label className="studio-toggle"><input type="checkbox" checked={form.allProducts} onChange={(e) => setForm({ ...form, allProducts: e.target.checked })} /> for every product</label>
          {!form.allProducts && <div className="studio-files">{products.map((p) => <label key={p.id} className="studio-toggle"><input type="checkbox" checked={form.useCases.includes(p.id)} onChange={(e) => setForm({ ...form, useCases: e.target.checked ? [...form.useCases, p.id] : form.useCases.filter((x) => x !== p.id) })} /> {p.name}</label>)}</div>}
          <button type="button" className="button button-primary" disabled={!form.name.trim()} onClick={() => void add()}><Plus size={14} /> Add connector</button>
        </div>
      </section>
    </div>
  )
}

// One skill library: the open-source ECC library, the Studio's own skills (in ECC's format) and uploads.
function Skills({ setToast }: { setToast: (s: string) => void }) {
  const [rows, setRows] = useState<LibSkill[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [source, setSource] = useState<(typeof SOURCES)[number][0]>('all')
  useEffect(() => { if (new URLSearchParams(window.location.search).get('source') === 'studio') setSource('studio') }, [])
  const [q, setQ] = useState('')
  const [onOnly, setOnOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [metrics, setMetrics] = useState<Record<string, Metric>>({})
  const [since, setSince] = useState<string | null>(null)
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('name')
  const [read, setRead] = useState<string | null>(null)
  const loadMetrics = () => void api<{ since: string | null; metrics: Record<string, Metric> }>('/api/skills/metrics', { cache: 'no-store' }).then((r) => { setMetrics(r.metrics); setSince(r.since) }).catch(() => undefined)
  useEffect(() => { loadMetrics() }, [])
  const m = (s: LibSkill) => metrics[s.name] ?? NO_METRIC
  const openRead = (s: LibSkill) => { const next = read === s.id ? null : s.id; setRead(next); if (next) void api('/api/skills/metrics', { json: { skill: s.name } }).then(loadMetrics).catch(() => undefined) }
  const load = () => void api<LibSkill[]>('/api/skills/library', { cache: 'no-store' }).then(setRows).catch(() => setRows([]))
  useEffect(() => { load(); void api<Product[]>('/api/use-cases', { cache: 'no-store' }).then(setProducts).catch(() => setProducts([])) }, [])
  const upload = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/skills', { method: 'POST', body: form })
    const j = (await res.json().catch(() => ({}))) as { error?: string; valid?: boolean; name?: string }
    setToast(res.ok ? (j.valid ? `${j.name} checked and added to the library; switch it on when you want it` : `${j.name} uploaded but did not pass the check; see its report`) : j.error || 'Upload failed')
    load()
  }
  const scope = (s: LibSkill, allProducts: boolean, useCases: string[]) =>
    void api('/api/skills/library', { method: 'PATCH', json: { skill: s.name, allProducts, useCases } })
      .then(() => { setToast(allProducts ? `${s.name} is on for every product` : useCases.length ? `${s.name} is on for ${useCases.length} product${useCases.length === 1 ? '' : 's'}` : `${s.name} is off`); load() })
      .catch((e: Error) => setToast(e.message))
  const isOn = (s: LibSkill) => s.alwaysOn || s.allProducts || s.useCases.length > 0
  const count = (k: string) => rows.filter((r) => k === 'all' || r.source === k).length
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const order = (r: LibSkill) => (r.source === 'studio' ? 0 : r.source === 'yours' ? 1 : isOn(r) ? 2 : 3)
  const list = rows.filter((r) => (source === 'all' || r.source === source) && (!onOnly || isOn(r)) && words.every((w) => `${r.name} ${r.description}`.toLowerCase().includes(w))).sort((a, b) => sort === 'used' ? m(b).used - m(a).used || order(a) - order(b) : sort === 'viewed' ? m(b).viewed - m(a).viewed || order(a) - order(b) : sort === 'recent' ? (m(b).lastUsed ?? '').localeCompare(m(a).lastUsed ?? '') || order(a) - order(b) : sort === 'never' ? Number(m(a).used > 0) - Number(m(b).used > 0) || order(a) - order(b) : order(a) - order(b))
  const where = (s: LibSkill) => s.core ? 'Core · loaded on every Socra turn' : s.alwaysOn ? 'Always on' : s.allProducts ? 'On · every product' : s.useCases.length ? `On · ${s.useCases.length} product${s.useCases.length === 1 ? '' : 's'}` : 'Off'
  return (
    <div className="studio-library">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Skill library · {rows.length}</p><h3>ECC, the Studio’s skills and yours, in one place</h3></div><Wrench size={16} /></div>
        <p className="studio-muted">ECC (Everything Claude Code) is the open-source skills library, MIT licensed. The Studio imports it from <a href={ECC_COPY.url} target="_blank" rel="noreferrer">our own copy</a>, kept apart from the public project, at a pinned version. <a href={ECC_COPY.studioGroupUrl} target="_blank" rel="noreferrer">Our skills</a> sit in their own group there, in the same format. Switched on, a skill goes into each product’s workspace, where Socra, its specialists and Claude Code use it.</p>
        {source === 'studio' && <p className="studio-muted"><strong>Our skills live in our private copy of ECC:</strong> <a href={ECC_COPY.studioGroupUrl} target="_blank" rel="noreferrer">{ECC_COPY.owner}/{ECC_COPY.repo} · studio-skills</a></p>}
        <div className="studio-metric-totals">
          {(['studio', 'ecc'] as const).map((k) => { const group = rows.filter((r) => r.source === k); return <div key={k}><strong>{group.reduce((n, r) => n + m(r).used, 0)} uses · {group.reduce((n, r) => n + m(r).viewed, 0)} views</strong><small>{k === 'studio' ? 'Ours' : 'ECC'}: {group.filter((r) => m(r).used > 0).length} of {group.length} skills used</small></div> })}
          <div><strong>{rows.filter((r) => m(r).used === 0).length} never used</strong><small>{since ? `Counting since ${fmtWhen(since)}` : 'Counting starts when this version is installed, so everything shows as never used until then'}</small></div>
        </div>
        <div className="studio-library-tools">
          <div className="studio-tabs" style={{ marginTop: 0 }}>{SOURCES.map(([k, l]) => <button key={k} type="button" className={source === k ? 'is-active' : ''} onClick={() => { setSource(k); setShown(PAGE) }}>{l} · {count(k)}</button>)}</div>
          <input className="studio-library-search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} placeholder="Search skills, e.g. security, postgres, accessibility" aria-label="Search the skill library" />
          <label className="studio-toggle">Sort <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="studio-toggle"><input type="checkbox" checked={onOnly} onChange={(e) => setOnOnly(e.target.checked)} /> only what’s on</label>
          <label className="button button-quiet file-button"><Upload size={14} /> Add a skill<input type="file" accept=".skill,.zip,.md" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} /></label>
        </div>
        <div className="studio-list">{list.slice(0, shown).map((s) => (
          <div key={s.id} className="studio-list-row studio-library-row">
            <div className="studio-row-main"><strong>{s.name} <span className={`studio-source is-${s.source}`}>{s.source === 'ecc' ? 'ECC' : s.source === 'studio' ? 'Ours' : 'Yours'}</span></strong><Rich text={s.description || 'No description'} lines={3} className="studio-muted" />{s.source === 'yours' && !s.valid && <small>did not pass the check</small>}{s.usedBy.length > 0 && <small className="studio-muted">Told to read it: {s.usedBy.join(', ')}</small>}<small className={m(s).used === 0 ? 'studio-warn' : 'studio-ok'}>{m(s).used === 0 ? 'Never used' : `Used ${m(s).used} ${m(s).used === 1 ? 'time' : 'times'}, last ${fmtWhen(m(s).lastUsed)}`} · viewed {m(s).viewed} {m(s).viewed === 1 ? 'time' : 'times'}{m(s).agents.length > 0 ? ` · by ${m(s).agents.join('; ')}` : ''}</small></div>
            <span className={isOn(s) ? 'studio-ok studio-where' : 'studio-muted studio-where'}>{where(s)}</span>
            <div className="studio-review-actions">
              <button type="button" className="button button-quiet" onClick={() => openRead(s)}>{read === s.id ? 'Close' : 'Read'}</button>
              {s.source === 'ecc' && !s.alwaysOn && <button type="button" className="button button-quiet" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Done' : 'Switch on…'}</button>}
              {s.source === 'yours' && <label className="studio-toggle"><input type="checkbox" disabled={!s.valid} checked={s.allProducts} onChange={(e) => void api(`/api/skills/${s.id.slice(6)}`, { method: 'PATCH', json: { enabled: e.target.checked } }).then(load).catch((er: Error) => setToast(er.message))} /> on</label>}
              {s.source === 'yours' && s.report && <details><summary className="studio-muted" style={{ marginTop: 0 }}>Check report</summary><pre className="studio-diff">{s.report}</pre></details>}
              {s.source === 'yours' && <button type="button" className="icon-button subtle" aria-label="Delete skill" onClick={() => void api(`/api/skills/${s.id.slice(6)}`, { method: 'DELETE' }).then(load)}><Trash2 size={13} /></button>}
            </div>
            {read === s.id && <div className="studio-library-scope"><Rich text={s.description || 'No description'} /><dl className="rich-pairs"><div><dt>Used</dt><dd>{m(s).used === 0 ? 'Never' : `${m(s).used} times${m(s).useCases ? ` across ${m(s).useCases} use case${m(s).useCases === 1 ? '' : 's'}` : ''}, last ${fmtWhen(m(s).lastUsed)}`}</dd></div><div><dt>Viewed</dt><dd>{m(s).viewed === 0 ? 'Never' : `${m(s).viewed} times, last ${fmtWhen(m(s).lastViewed)}`}</dd></div><div><dt>Used by</dt><dd>{m(s).agents.length ? m(s).agents.join(', ') : 'No agent yet'}</dd></div><div><dt>Counting</dt><dd>{since ? `since ${fmtWhen(since)}` : 'starts at install'}</dd></div></dl></div>}
            {open === s.id && <div className="studio-library-scope">
              <label className="studio-toggle"><input type="radio" name={`scope-${s.id}`} checked={!s.allProducts && !s.useCases.length} onChange={() => scope(s, false, [])} /> Off</label>
              <label className="studio-toggle"><input type="radio" name={`scope-${s.id}`} checked={s.allProducts} onChange={() => scope(s, true, [])} /> Every product</label>
              {products.length > 0 && <span className="studio-muted">or chosen products:</span>}
              {products.map((p) => <label key={p.id} className="studio-toggle"><input type="checkbox" checked={!s.allProducts && s.useCases.includes(p.id)} onChange={(e) => scope(s, false, e.target.checked ? [...s.useCases.filter((x) => x !== p.id), p.id] : s.useCases.filter((x) => x !== p.id))} /> {p.name}</label>)}
            </div>}
          </div>
        ))}</div>
        {list.length === 0 && <p className="studio-muted">No skill matches that.</p>}
        {list.length > shown && <button type="button" className="button button-quiet" style={{ marginTop: 12 }} onClick={() => setShown(shown + PAGE * 2)}>Show more ({list.length - shown} left)</button>}
      </section>
    </div>
  )
}
