'use client'
// Connecting from outside: the OAuth consent page an assistant opens, and Settings > Connect (addresses,
// connect code, tokens for OpenAPI connectors and scripts, and the log of every call).
import { useEffect, useState } from 'react'
import { Bell, Check, Copy, KeyRound, Link2, ScrollText, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from './live'
import { PRODUCT_NAME as PRODUCT } from '@/lib/brand'

const ROLES = ['Product owner', 'Business analyst', 'Product engineer', 'Viewer']

type Params = { client_id: string; redirect_uri: string; state: string; code_challenge: string }

export function ConsentPage({ problem, clientName, params, wantsWrite, customers }: { problem: string; clientName: string; params: Params; wantsWrite: boolean; customers: string[] }) {
  const [person, setPerson] = useState('')
  const [role, setRole] = useState(ROLES[0])
  const [customer, setCustomer] = useState('')
  const [scope, setScope] = useState<'read' | 'write'>(wantsWrite ? 'write' : 'read')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (deny = false) => {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ redirect: string }>('/api/oauth/approve', { json: { ...params, person, role, customer, scope: role === 'Viewer' ? 'read' : scope, connect_code: code, deny } })
      window.location.href = r.redirect
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <div className="studio-page">
      <div className="page-wrap" style={{ maxWidth: 560 }}>
        <div className="page-intro"><div><p className="eyebrow">{PRODUCT}</p><h1>Connect<br /><em>{clientName || 'an assistant'}</em></h1><p>It will work on your use cases in your name. Approving, building and withdrawing always ask you first.</p></div></div>
        {problem ? <section className="studio-card"><p>{problem}</p></section> : (
          <section className="studio-card">
            <div className="studio-kv">
              <label>Your name<input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Doug" autoComplete="name" /></label>
              <label>Your role<select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label>Which customer it may see<select value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Every customer</option>{customers.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label>What it may do<select value={role === 'Viewer' ? 'read' : scope} disabled={role === 'Viewer'} onChange={(e) => setScope(e.target.value as 'read' | 'write')}><option value="read">Look only</option><option value="write">Look and make changes (asks before approving or building)</option></select></label>
              <label>Connect code (Settings &gt; Connect in the Studio)<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 letters" autoComplete="one-time-code" /></label>
              {error && <p className="studio-muted" role="alert">{error}</p>}
              <div className="studio-review-actions"><button type="button" className="button button-primary" disabled={busy || !person.trim() || !code.trim()} onClick={() => void send()}><ShieldCheck size={14} /> Allow</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => void send(true)}>Don’t allow</button></div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

type Info = {
  mcpUrl: string
  openApiUrl: string
  isPublic: boolean
  tools: { name: string; title: string; write: boolean }[]
  tokens: { id: string; name: string; prefix: string; scope: string; customer: string; person: string; role: string; viaOAuth: boolean; lastUsedAt: string | null; createdAt: string }[]
  calls: { id: string; person: string; tool: string; via: string; outcome: string; note: string; createdAt: string }[]
  notify: { id: string; kind: 'email' | 'slack' | 'webhook'; hint: string; customer: string; enabled: boolean; lastError: string; lastSent: string | null }[]
  emailReady: boolean
}

const KIND_LABEL = { email: 'Email', slack: 'Slack', webhook: 'Webhook' } as const

/** Email goes out through the owner's own Gmail: their address and a Google app password, typed here once. */
function GmailSender({ info, reload, setToast }: { info: Info; reload: () => void; setToast: (s: string) => void }) {
  const first = info.notify.find((t) => t.kind === 'email' && /@gmail\.com$/i.test(t.hint))?.hint ?? ''
  const [address, setAddress] = useState(first)
  const [password, setPassword] = useState('')
  const save = async () => {
    try {
      const url = `smtps://${encodeURIComponent(address.trim())}:${encodeURIComponent(password.replace(/\s+/g, ''))}@smtp.gmail.com:465`
      await api('/api/settings/models', { method: 'PUT', json: { action: 'key', env: 'SMTP_URL', value: url } })
      setPassword('')
      for (const t of info.notify.filter((x) => x.kind === 'email')) await api('/api/settings/connect', { json: { action: 'notify_test', id: t.id } })
      setToast('Saved. A test email is on its way: check your inbox.')
      reload()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="studio-card" style={{ margin: '12px 0' }}>
      <p className="eyebrow" style={{ marginTop: 0 }}>One step: let the Studio send email from your Gmail</p>
      <p className="studio-muted">Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Google app passwords</a>, make one named “Studio”, and type its 16 letters below. It is stored encrypted, used only to send these emails, and never shown again.</p>
      <div className="studio-kv">
        <label>Your Gmail address<input type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@gmail.com" /></label>
        <label>App password<input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="16 letters" /></label>
        <button type="button" className="button button-primary button-small" disabled={!address.includes('@') || password.replace(/\s+/g, '').length < 16} onClick={() => void save()}><Send size={14} /> Save and send a test</button>
      </div>
    </div>
  )
}

function Notify({ info, reload, setToast }: { info: Info; reload: () => void; setToast: (s: string) => void }) {
  const [form, setForm] = useState({ kind: 'email' as 'email' | 'slack' | 'webhook', address: '', customer: '' })
  const post = async (json: Record<string, unknown>, done?: string) => {
    try { await api('/api/settings/connect', { json }); if (done) setToast(done); reload() } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <section className="studio-card">
      <div className="stack-header"><div><p className="eyebrow">Notify me · {info.notify.length}</p><h3>Send what’s waiting on you</h3></div><Bell size={16} /></div>
      <p className="studio-muted">When a question, a checkpoint or something to try is waiting on you, the Studio sends it with its numbered options and a link, within a couple of minutes. Several at once arrive as one message, and nothing is sent twice.</p>
      {!info.emailReady && info.notify.some((t) => t.kind === 'email') && <GmailSender info={info} reload={reload} setToast={setToast} />}
      <div className="studio-list">{info.notify.map((t) => (
        <div key={t.id} className="studio-list-row">
          <div className="studio-row-main"><strong>{KIND_LABEL[t.kind]} · {t.hint}</strong><small>{t.customer || 'every customer'} · last sent {when(t.lastSent)}{t.lastError ? ` · didn’t send: ${t.lastError}` : ''}</small></div>
          <label className="studio-toggle"><input type="checkbox" checked={t.enabled} onChange={(e) => void post({ action: 'notify_toggle', id: t.id, enabled: e.target.checked })} /> on</label>
          <div className="studio-review-actions"><button type="button" className="button button-quiet button-small" onClick={() => void post({ action: 'notify_test', id: t.id }, 'Test sent. Check that it arrived.')}><Send size={13} /> Send a test</button><button type="button" className="icon-button subtle" aria-label="Stop sending here" onClick={() => void post({ action: 'notify_remove', id: t.id })}><Trash2 size={13} /></button></div>
        </div>
      ))}</div>
      <div className="studio-kv" style={{ marginTop: 12 }}>
        <label>Send to<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}><option value="email">Email</option><option value="slack">Slack (incoming webhook)</option><option value="webhook">Any webhook (JSON)</option></select></label>
        <label>{form.kind === 'email' ? 'Email address' : 'Webhook address (stored encrypted, never shown again)'}<input type={form.kind === 'email' ? 'email' : 'password'} autoComplete="off" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={form.kind === 'email' ? 'you@company.com' : 'https://hooks.slack.com/services/…'} /></label>
        <label>Customer<input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Every customer" /></label>

        <button type="button" className="button button-primary button-small" disabled={!form.address.trim()} onClick={() => void post({ action: 'notify_add', ...form }, 'Added. Use “Send a test” to check it.').then(() => setForm({ ...form, address: '' }))}><Bell size={14} /> Send here</button>
      </div>
    </section>
  )
}

const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never')

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="studio-list-row">
      <div className="studio-row-main"><strong>{label}</strong><small style={{ wordBreak: 'break-all' }}>{value}</small></div>
      <button type="button" className="icon-button subtle" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500) })}>{done ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
  )
}

export function ConnectTab({ setToast }: { setToast: (s: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [code, setCode] = useState<{ code: string; until: string } | null>(null)
  const [form, setForm] = useState({ name: '', scope: 'read', customer: '', person: '', role: ROLES[0] })
  const [shown, setShown] = useState('')
  const load = () => void api<Info>('/api/settings/connect', { cache: 'no-store' }).then(setInfo).catch((e: Error) => setToast(e.message))
  useEffect(load, [setToast])
  if (!info) return <p className="studio-muted">Loading…</p>
  const makeCode = async () => setCode(await api<{ code: string; until: string }>('/api/settings/connect', { json: { action: 'code' } }))
  const makeToken = async () => {
    try {
      const r = await api<{ token: string }>('/api/settings/connect', { json: { action: 'token', ...form } })
      setShown(r.token)
      setForm({ ...form, name: '' })
      load()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const revoke = async (id: string) => { await api('/api/settings/connect', { json: { action: 'revoke', id } }); load() }
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Connect from an assistant</p><h3>Claude, ChatGPT, Meta Muse or a script</h3></div><Link2 size={16} /></div>
        <div className="studio-list">
          <CopyLine label="MCP connector (Claude, ChatGPT)" value={info.mcpUrl} />
          <CopyLine label="OpenAPI (Meta Muse, custom GPT actions, scripts)" value={info.openApiUrl} />
        </div>
        {!info.isPublic && <p className="studio-muted">This Studio is only reachable on this computer. Claude Desktop and Claude Code can connect here; claude.ai, ChatGPT and Meta Muse need a public address first (see the guide in docs/CONNECT.md).</p>}
        <p className="studio-muted">{info.tools.length} tools: {info.tools.map((t) => t.title).join(' · ')}. Approving, building, withdrawing, reopening and sending a card back always show a preview and wait for a yes.</p>
      </section>
      <Notify info={info} reload={load} setToast={setToast} />
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Connect code</p><h3>For signing in from an assistant</h3></div><ShieldCheck size={16} /></div>
        <p className="studio-muted">When an assistant opens the Studio’s sign-in page, type this code there. It works once, for ten minutes.</p>
        {code ? <p style={{ fontSize: 28, letterSpacing: '0.2em', fontWeight: 600 }}>{code.code}</p> : null}
        <button type="button" className="button button-primary button-small" onClick={() => void makeCode()}>{code ? 'Make a new code' : 'Make a connect code'}</button>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Who has access · {info.tokens.length}</p><h3>Connected assistants and tokens</h3></div><KeyRound size={16} /></div>
        {info.tokens.length === 0 && <p className="studio-muted">Nothing connected yet.</p>}
        <div className="studio-list">{info.tokens.map((t) => (
          <div key={t.id} className="studio-list-row">
            <div className="studio-row-main"><strong>{t.name}</strong><small>{t.person || 'no name'} · {t.role} · {t.scope === 'write' ? 'look and change' : 'look only'} · {t.customer || 'every customer'} · {t.viaOAuth ? 'signed in' : `token ${t.prefix}…`} · last used {when(t.lastUsedAt)}</small></div>
            <button type="button" className="icon-button subtle" aria-label={`Remove access for ${t.name}`} onClick={() => void revoke(t.id)}><Trash2 size={13} /></button>
          </div>
        ))}</div>
        <div className="studio-kv" style={{ marginTop: 12 }}>
          <label>New token for (an OpenAPI connector or a script)<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Meta Muse" /></label>
          <label>Whose name it acts in<input value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} placeholder="Doug" /></label>
          <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label>Customer<input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Every customer" /></label>
          <label>What it may do<select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="read">Look only</option><option value="write">Look and make changes</option></select></label>
          <button type="button" className="button button-primary button-small" disabled={!form.name.trim()} onClick={() => void makeToken()}><KeyRound size={14} /> Make a token</button>
          {shown && <div className="studio-card" style={{ marginTop: 8 }}><p className="studio-muted" style={{ marginTop: 0 }}>Shown once. Put it straight into the connector’s settings; never paste it into a chat.</p><CopyLine label="Token" value={shown} /><button type="button" className="button button-quiet button-small" onClick={() => setShown('')}>Done, hide it</button></div>}
        </div>
      </section>
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Every call · latest {info.calls.length}</p><h3>What assistants did</h3></div><ScrollText size={16} /></div>
        {info.calls.length === 0 && <p className="studio-muted">No calls yet.</p>}
        <div className="studio-list">{info.calls.map((c) => (
          <div key={c.id} className="studio-list-row">
            <div className="studio-row-main"><strong>{c.tool}</strong><small>{c.person || 'someone'} · {c.via === 'mcp' ? 'MCP' : 'REST'} · {c.outcome === 'ok' ? 'done' : c.outcome === 'needs-confirm' ? 'asked to confirm' : c.outcome}{c.note ? ` · ${c.note}` : ''} · {when(c.createdAt)}</small></div>
          </div>
        ))}</div>
      </section>
    </div>
  )
}
