'use client'
// Settings: models and keys, MCP connectors (for every product or chosen ones), Agent Skills, and memory.
// Keys and connector secrets go in once, are stored encrypted, and are never shown again (last four only).
import { useEffect, useState } from 'react'
import { Check, Plug, Plus, Trash2, Upload, Wrench } from 'lucide-react'
import { api } from './live'
import { StudioTop } from './pages'

type KeyStatus = { env: string; name: string; source: 'saved' | 'env' | 'missing'; last4: string }
type Status = { providers: (KeyStatus & { id: string; models: string[] })[]; other: KeyStatus[]; claudePlan: boolean; roles: { env: string; label: string; note: string; providers: string[]; current: string; saved: boolean }[] }
type Connector = { id: string; name: string; label: string; transport: string; url: string; command: string; args: string[]; secretNames: string[]; hasSecrets: boolean; enabled: boolean; allProducts: boolean; useCases: string[] }
type Skill = { id: string; name: string; description: string; valid: boolean; report: string; enabled: boolean }
type Product = { id: string; name: string }

const BUNDLED = [
  ['working-backwards-studio', 'The Studio’s method: working backwards from the customer, the living PRD and TRD, the floor rule and the Claude Code package contract.'],
  ['studio-reimagine', 'The Studio’s core theme, loaded on every turn: reimagine, rethink, reinvent and accelerate. Keep the proven floor, protect what makes the product different, and real ideation techniques for ideas that don’t exist yet.'],
  ['studio-muse', 'How the Muse holds the conversation: implicit approvals, one question at a time, spec sections with their trace.'],
  ['studio-agentkit', 'Inngest AgentKit, the standard harness for agents inside every generated app.'],
]

export function SettingsPage() {
  const [tab, setTab] = useState<'models' | 'connectors' | 'skills' | 'memory'>('models')
  const [toast, setToast] = useState('')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'connectors' || t === 'skills' || t === 'memory') setTab(t)
  }, [])
  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(''), 5000); return () => window.clearTimeout(t) } }, [toast])
  return (
    <div className="studio-page">
      <StudioTop active="settings" />
      <div className="page-wrap">
        <div className="page-intro"><div><p className="eyebrow">Settings</p><h1>The plumbing,<br /><em>out of the way.</em></h1><p>Models and keys, the connectors and skills the Muse and Claude Code can use, and the memory that carries lessons between products.</p></div></div>
        <div className="studio-tabs">{([['models', 'Models and keys'], ['connectors', 'Connectors (MCP)'], ['skills', 'Skills'], ['memory', 'Memory']] as const).map(([k, l]) => <button key={k} type="button" className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'models' && <Models setToast={setToast} />}
        {tab === 'connectors' && <Connectors setToast={setToast} />}
        {tab === 'skills' && <Skills setToast={setToast} />}
        {tab === 'memory' && <Memory />}
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
        <div className="stack-header"><div><p className="eyebrow">Claude plan</p><h3>{s.claudePlan ? 'Signed in: the Muse and Claude Code run on your plan' : 'Not signed in yet'}</h3></div>{s.claudePlan ? <Check size={16} /> : <Plug size={16} />}</div>
        <p className="studio-muted">{s.claudePlan ? 'Nothing to do here.' : 'Claude is signed in once, during setup on this computer. Until then everything you say is kept and the Muse catches up when it starts.'}</p>
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
      setToast('Connector added. The Muse and Claude Code can use it from the next run.')
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
        <div className="stack-header"><div><p className="eyebrow">Connectors · {rows.length}</p><h3>MCP servers the agents can use</h3></div><Plug size={16} /></div>
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

function Skills({ setToast }: { setToast: (s: string) => void }) {
  const [rows, setRows] = useState<Skill[]>([])
  const load = () => void api<Skill[]>('/api/skills', { cache: 'no-store' }).then(setRows).catch(() => setRows([]))
  useEffect(load, [])
  const upload = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/skills', { method: 'POST', body: form })
    const j = (await res.json().catch(() => ({}))) as { error?: string; valid?: boolean; name?: string }
    setToast(res.ok ? (j.valid ? `${j.name} checked and ready to switch on` : `${j.name} uploaded but did not pass the check; see its report`) : j.error || 'Upload failed')
    load()
  }
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Built in</p><h3>Default skills</h3></div><Check size={16} /></div>
        <div className="studio-list">{BUNDLED.map(([n, d]) => <div key={n} className="studio-list-row"><div className="studio-row-main"><strong>{n}</strong><small>{d}</small></div><span className="connection-badge">Always on</span></div>)}</div>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Your skills · {rows.length}</p><h3>Agent Skills (SKILL.md, .skill or .zip)</h3></div><Upload size={16} /></div>
        <label className="button button-quiet file-button" style={{ marginTop: 12 }}><Upload size={14} /> Upload a skill<input type="file" accept=".skill,.zip,.md" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} /></label>
        <div className="studio-list">{rows.map((s) => (
          <div key={s.id} className="studio-list-row">
            <div className="studio-row-main"><strong>{s.name}</strong><small>{s.description || 'No description'} · {s.valid ? 'passed the check' : 'did not pass the check'}</small></div>
            <label className="studio-toggle"><input type="checkbox" disabled={!s.valid} checked={s.enabled} onChange={(e) => void api(`/api/skills/${s.id}`, { method: 'PATCH', json: { enabled: e.target.checked } }).then(load).catch((er: Error) => setToast(er.message))} /> on</label>
            <div className="studio-review-actions">{s.report && <details><summary className="studio-muted" style={{ marginTop: 0 }}>Check report</summary><pre className="studio-diff">{s.report}</pre></details>}<button type="button" className="icon-button subtle" aria-label="Delete skill" onClick={() => void api(`/api/skills/${s.id}`, { method: 'DELETE' }).then(load)}><Trash2 size={13} /></button></div>
          </div>
        ))}</div>
      </section>
    </div>
  )
}

function Memory() {
  const [m, setM] = useState<{ mem0: { configured: boolean; up: boolean }; letta: { up: boolean; note?: string }; roles: { key: string; name: string; lessons: string }[] } | null>(null)
  useEffect(() => { void api<typeof m>('/api/memory', { cache: 'no-store' }).then(setM).catch(() => setM(null)) }, [])
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Memory</p><h3>Self-hosted Mem0 and Letta</h3></div><Wrench size={16} /></div>
        {!m ? <p className="studio-muted">Reading memory status…</p> : <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>Mem0 (long-term)</strong><small>{m.mem0.up ? 'running' : m.mem0.configured ? 'configured, not answering' : 'not configured'}</small></div><span className={m.mem0.up ? 'studio-ok' : 'studio-warn'}>{m.mem0.up ? 'up' : 'down'}</span></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Letta (agents’ working memory)</strong><small>{m.letta.up ? 'running' : m.letta.note || 'not answering'}</small></div><span className={m.letta.up ? 'studio-ok' : 'studio-warn'}>{m.letta.up ? 'up' : 'down'}</span></div>
          {m.roles?.filter((r) => r.lessons).map((r) => <div key={r.key} className="studio-list-row"><div className="studio-row-main"><strong>{r.name}</strong><small>{r.lessons.slice(0, 280)}</small></div></div>)}
        </div>}
      </section>
    </div>
  )
}
