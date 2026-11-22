'use client'
// Settings > Enterprise Harness (powered by Nasiko): the link to your self-hosted Nasiko (an open runtime for agents: one registry, access, cost and
// traces). Everything shown is read from the real Nasiko server and the Studio's own records.
import { useEffect, useState } from 'react'
import { Check, Loader2, Plug, RefreshCw, Trash2 } from 'lucide-react'
import { api, previewUrl } from './live'
import { Rich } from './rich'

/** Where to open Nasiko's own dashboard from the browser in use. On the Mac itself (localhost) it is the Nasiko port on this computer; through a public
 *  address it is the same port-per-hostname door the product previews use (https://p8480.<your domain>), taken from the address in the browser, never typed in. */
function dashboardUrl(serverUrl: string) {
  const m = /:(\d{2,5})(?:\/|$)/.exec(serverUrl || '')
  return previewUrl(m ? Number(m[1]) : 8480, '/')
}

type Info = {
  link: { url: string; username: string; passwordSet: boolean; last4: string; enabled: boolean; loggedInAt: string | null; lastOkAt: string | null; lastError: string; syncedAt: string | null }
  health: { reachable: boolean; ready?: boolean; postgres?: boolean; redis?: boolean; orchestrator?: boolean; agentsTotal?: number; agentsRunning?: number; error?: string } | null
  signedIn: boolean
  problem: string
  agents: { id: string; name: string; displayName: string; status: string; version: string }[]
  spend: { totalCost: number; operations: number; range: string; agents: { name: string; cost: number; operations: number }[] } | null
  studioAgents: { name: string; displayName: string; kind: string; product: string; description: string }[]
  mcp: { id: string; name: string; displayName: string; url: string; auth: string; status: string; error: string; connected: boolean; tools: { name: string; description: string }[] }[]
}
type Usage = { totalUsd: number; runs: number; tokens: number; since: string | null; byAgent: { agent: string; runs: number; tokens: number; usd: number }[]; byProduct: { useCaseId: string; name: string; runs: number; tokens: number; usd: number }[]; recent: { at: string; agent: string; product: string; model: string; tokens: number; usd: number; kind: string }[] }
type Sync = { ok: boolean; created: number; updated: number; removed?: number; failed: { name: string; why: string }[]; total: number; note: string }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never')

export function NasikoTab({ setToast }: { setToast: (s: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [form, setForm] = useState({ url: '', username: '', password: '' })
  const [busy, setBusy] = useState('')
  // The result of the last Save and test, shown right under the button (a toast alone can scroll out of sight or vanish).
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [sync, setSync] = useState<Sync | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [sentInfo, setSentInfo] = useState<{ sent: number; pending: number } | null>(null)
  const loadSent = () => void api<{ sent: number; pending: number }>('/api/nasiko/usage', { cache: 'no-store' }).then(setSentInfo).catch(() => undefined)
  useEffect(() => { loadSent() }, [])
  useEffect(() => { void api<Usage>('/api/usage', { cache: 'no-store' }).then(setUsage).catch(() => undefined) }, [])
  const load = () => void api<Info>('/api/nasiko', { cache: 'no-store' }).then((i) => { setInfo(i); setForm((f) => ({ url: f.url || i.link.url, username: f.username || i.link.username, password: '' })) }).catch((e: Error) => setToast(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return <p className="studio-muted">Reading Nasiko…</p>

  const connect = async () => {
    setBusy('connect')
    setResult(null)
    try {
      const r = await api<{ signIn: string }>('/api/nasiko', { method: 'PUT', json: { url: form.url, username: form.username, password: form.password || undefined } })
      const ok = r.signIn === 'ok'
      const text = ok ? 'Connected. The Studio signed in to Nasiko and will sign in again by itself every week.' : r.signIn
      setResult({ ok, text })
      setToast(text)
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setResult({ ok: false, text: text || 'The Studio did not get an answer. Try again.' })
      setToast(text)
    }
    setBusy('')
    load()
  }
  const register = async (prune = false) => {
    setBusy('sync')
    try { const r = await api<Sync>('/api/nasiko/sync', { method: 'POST', json: prune ? { prune: true } : {} }); setSync(r); setToast(r.note) } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    setBusy('')
    load()
  }
  const sendUsage = async () => {
    setBusy('usage')
    try { const r = await api<{ sent: number; pending: number; error: string }>('/api/nasiko/usage', { method: 'POST' }); setToast(r.error ? `Not sent: ${r.error}` : `${r.sent} run${r.sent === 1 ? '' : 's'} sent to Nasiko.`) } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    setBusy('')
    loadSent()
  }
  const connectMcp = async () => {
    setBusy('mcp')
    try { const r = await api<{ ok: boolean; note: string }>('/api/nasiko/mcp', { method: 'POST' }); setToast(r.note) } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    setBusy('')
    load()
  }
  const disconnect = async () => { await api('/api/nasiko', { method: 'DELETE' }).catch(() => undefined); setForm({ url: '', username: '', password: '' }); setSync(null); load() }
  const h = info.health
  const registered = new Set(info.agents.map((a) => a.name))
  // Agents Nasiko holds that this Studio no longer lists (their product was archived or deleted).
  const known = new Set(info.studioAgents.map((a) => a.name))
  const stale = info.agents.filter((a) => !known.has(a.name))
  const missing = info.studioAgents.filter((a) => !registered.has(a.name))

  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Enterprise Harness · powered by Nasiko · your own server</p><h3>Connection</h3></div><Plug size={16} /></div>
        <Rich text={'Nasiko is an open runtime for agents. It keeps one registry of every agent, controls who and what each can reach, and shows what each costs, with a trace of every call.\nThe Studio registers its agents there. Socra, the specialists and every product agent keep running exactly as before: if Nasiko is down, nothing in the Studio changes.'} />
        <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>Server</strong><small>{!info.link.url ? 'Not set up yet' : h?.reachable ? (h.ready ? 'Running and ready' : 'Running, not ready') : h?.error || 'Not answering'}</small></div><span className={h?.reachable && h.ready ? 'studio-ok' : 'studio-warn'}>{!info.link.url ? '–' : h?.reachable ? (h.ready ? 'up' : 'starting') : 'down'}</span></div>
          {h?.reachable && <div className="studio-list-row"><div className="studio-row-main"><strong>Inside Nasiko</strong><small>database {h.postgres ? 'ok' : 'down'} · cache {h.redis ? 'ok' : 'down'} · agent runtime {h.orchestrator ? 'ok' : 'down'}{typeof h.agentsTotal === 'number' ? ` · ${h.agentsTotal} agents, ${h.agentsRunning ?? 0} running` : ''}</small></div></div>}
          {info.link.url && <div className="studio-list-row"><div className="studio-row-main"><strong>Nasiko’s own dashboard</strong><small>Opens from this computer, or through your public address when you are not on it. Nasiko asks for its own sign-in (admin; the password is in .env.nasiko).</small></div><a className="button button-quiet" href={dashboardUrl(info.link.url)} target="_blank" rel="noreferrer">Open Nasiko</a></div>}
          <div className="studio-list-row"><div className="studio-row-main"><strong>Studio’s sign-in</strong><small>{info.signedIn ? `Signed in as ${info.link.username}. Last signed in ${when(info.link.loggedInAt)}; it signs in again after 6 days.` : info.problem || info.link.lastError || (info.link.passwordSet ? 'Not signed in yet' : 'No password saved')}</small></div><span className={info.signedIn ? 'studio-ok' : 'studio-muted'}>{info.signedIn ? 'signed in' : '–'}</span></div>
        </div>
        <div className="studio-kv">
          <label>Address of your Nasiko server<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://host.docker.internal:8480" /></label>
          <label>User name<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="admin" autoComplete="off" /></label>
          <label>Password (stored encrypted, never shown again{info.link.passwordSet ? `; saved one ends ${info.link.last4}` : ''})<input type="password" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={info.link.passwordSet ? 'Leave empty to keep the saved one' : 'The password your Nasiko gave you'} /></label>
          <div className="studio-review-actions">
            <button type="button" className="button button-primary" disabled={!form.url.trim() || !form.username.trim() || (!form.password && !info.link.passwordSet) || busy !== ''} onClick={() => void connect()}>{busy === 'connect' ? <><Loader2 size={14} className="studio-spin" /> Connecting…</> : <><Check size={14} /> Save and test</>}</button>
            {info.link.url && <button type="button" className="button button-quiet" onClick={() => void disconnect()}><Trash2 size={13} /> Disconnect</button>}
          </div>
          {result && <p role="status" className={result.ok ? 'studio-ok' : 'studio-warn'}>{result.ok ? 'Connected. ' : 'Not connected: '}{result.ok ? result.text.replace(/^Connected\.\s*/, '') : result.text}</p>}
        </div>
        <Rich text={'Where is your Nasiko? On this computer, the address is http://host.docker.internal:8480. On another computer (for example the Mac that runs it), use the address that computer gives it, such as https://p8480.<your domain>. The Studio checks the address from inside its own container, so “localhost” will not work.'} />
        {!info.link.url && <Rich text={'No Nasiko is linked yet. To start one on this computer, run scripts/nasiko-up.sh from the Studio folder: it starts Nasiko in Docker on port 8480, creates its passwords and fills in this card. If Nasiko already runs on another computer, enter its address, user name and password above instead.'} />}
      </section>

      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Agents · {info.agents.length} of {info.studioAgents.length} registered</p><h3>The Studio’s agents in the harness</h3></div><RefreshCw size={16} /></div>
        <Rich text={'Each agent is registered by its address with the open A2A agent card, so any harness that speaks A2A can use it, here or elsewhere. Calls come back to the Studio, so the answers keep the Studio’s rules. Note: this version of Nasiko cannot yet forward its own proxy calls to an agent that is only registered by address (it answers 503), so they are listed and ready, but not routed through Nasiko’s access rules and traces yet.'} />
        <div className="studio-review-actions" style={{ margin: '8px 0' }}>
          <button type="button" className="button button-primary" disabled={!info.signedIn || busy !== ''} onClick={() => void register(false)}>{busy === 'sync' ? 'Registering…' : missing.length ? `Register ${missing.length} agent${missing.length === 1 ? '' : 's'}` : 'Update all'}</button>
          {!info.signedIn && <small className="studio-muted">Connect first.</small>}
          {info.signedIn && stale.length > 0 && <button type="button" className="button button-quiet" disabled={busy !== ''} title="Removes agents of archived or deleted products from Nasiko. Other agents are untouched." onClick={() => void register(true)}><Trash2 size={13} /> Remove {stale.length} from archived products</button>}
          {info.link.syncedAt && <small className="studio-muted">Last registered {when(info.link.syncedAt)}</small>}
        </div>
        {sync && <Rich text={sync.failed.length ? `${sync.note}\n${sync.failed.map((f) => `- ${f.name}: ${f.why}`).join('\n')}` : sync.note} />}
        <div className="studio-list">{info.studioAgents.map((a) => (
          <div key={a.name} className="studio-list-row">
            <div className="studio-row-main"><strong>{a.displayName}</strong><small>{a.name}{a.product ? ` · ${a.product}` : ''}</small><Rich text={a.description} lines={2} /></div>
            <span className={registered.has(a.name) ? 'studio-ok' : 'studio-muted'}>{registered.has(a.name) ? 'in Nasiko' : 'not yet'}</span>
          </div>
        ))}</div>
      </section>

      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Nasiko / MCP · {info.mcp.length} connector{info.mcp.length === 1 ? '' : 's'}</p><h3>Tools Nasiko lists</h3></div><Plug size={16} /></div>
        <Rich text={'Nasiko’s MCP gateway lists tool servers and decides which agent may call which tool. The Studio’s own connector is registered there with a look-only key that is kept inside Nasiko, never shown. The tools below are what Nasiko itself reports.'} />
        <div className="studio-review-actions" style={{ margin: '8px 0' }}>
          <button type="button" className="button button-primary" disabled={!info.signedIn || busy !== ''} onClick={() => void connectMcp()}>{busy === 'mcp' ? 'Connecting…' : info.mcp.some((c) => c.name === 'working-backwards-studio' && c.status === 'active') ? 'Reconnect the Studio’s tools' : 'Connect the Studio’s tools'}</button>
          {!info.signedIn && <small className="studio-muted">Connect first.</small>}
        </div>
        <div className="studio-list">{info.mcp.length === 0 && info.signedIn && <p className="studio-muted">No connector is registered in Nasiko yet.</p>}{info.mcp.map((c) => (
          <div key={c.id} className="studio-list-row">
            <div className="studio-row-main"><strong>{c.displayName}</strong><small>{c.url} · {c.auth} · {c.tools.length} tool{c.tools.length === 1 ? '' : 's'}</small>{c.error && <small className="studio-warn">{c.error}</small>}
              {c.tools.length > 0 && <details><summary>Tools</summary><ul>{c.tools.map((t) => <li key={t.name}><code>{t.name}</code>{t.description ? `: ${t.description}` : ''}</li>)}</ul></details>}</div>
            <span className={c.status === 'active' && c.connected ? 'studio-ok' : 'studio-warn'}>{c.status === 'active' && c.connected ? 'active' : c.status || 'not connected'}</span>
          </div>
        ))}</div>
      </section>

      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Model use · recorded by the Studio</p><h3>What the Studio’s agents used</h3></div></div>
        <Rich text={'Every Socra turn and every build is recorded when it ends, from the numbers Claude Code reports (an estimate, not a bill). Socra’s figure includes the specialists she sent out. Not recorded yet: document reading, cleaning up spoken words, Letta and Mem0 (OpenAI) memory calls. Jev keeps its own record on Settings > Jev. The Studio also sends each run to Nasiko’s usage intake, which prices it from the model name, so the runs show in Nasiko’s own usage pages too (sign-in on Nasiko needed to see them).'} />
        <div className="studio-review-actions" style={{ margin: '8px 0' }}>
          <button type="button" className="button button-quiet" disabled={!info.signedIn || busy !== ''} onClick={() => void sendUsage()}>{busy === 'usage' ? 'Sending…' : 'Send to Nasiko now'}</button>
          {sentInfo && <small className="studio-muted">{sentInfo.sent} sent to Nasiko · {sentInfo.pending} waiting{!info.signedIn ? ' (connect first)' : ''}</small>}
        </div>
        {!usage || usage.runs === 0 ? <p className="studio-muted">Nothing recorded yet. The next time Socra answers or a build runs, it shows here.</p> : <>
          <p><strong>${usage.totalUsd.toFixed(2)}</strong> over {usage.runs} run{usage.runs === 1 ? '' : 's'} · {usage.tokens.toLocaleString()} tokens{usage.since ? ` · since ${when(usage.since)}` : ''}</p>
          <div className="studio-list">{usage.byAgent.map((a) => <div key={a.agent} className="studio-list-row"><div className="studio-row-main"><strong>{a.agent}</strong><small>{a.runs} run{a.runs === 1 ? '' : 's'} · {a.tokens.toLocaleString()} tokens</small></div><span>${a.usd.toFixed(2)}</span></div>)}</div>
          <p className="eyebrow" style={{ marginTop: 12 }}>By product</p>
          <div className="studio-list">{usage.byProduct.map((p) => <div key={p.useCaseId} className="studio-list-row"><div className="studio-row-main"><strong>{p.name}</strong><small>{p.runs} run{p.runs === 1 ? '' : 's'} · {p.tokens.toLocaleString()} tokens</small></div><span>${p.usd.toFixed(2)}</span></div>)}</div>
          <details><summary>Latest runs</summary><ul>{usage.recent.map((r, i) => <li key={i}>{when(r.at)} · {r.agent}{r.product ? ` on ${r.product}` : ''} · {r.model || 'model'} · {r.tokens.toLocaleString()} tokens · ${r.usd.toFixed(3)}</li>)}</ul></details>
        </>}
      </section>

      {info.spend && (
        <section className="studio-card">
          <div className="stack-header"><div><p className="eyebrow">Cost · last 7 days</p><h3>What Nasiko counted</h3></div></div>
          <p><strong>${info.spend.totalCost.toFixed(2)}</strong> over {info.spend.operations} operations.</p>
          {info.spend.agents.length === 0 ? <p className="studio-muted">No agent has made a counted model call yet. The Studio’s agents still run through Claude directly, so they do not show here until you route them through Nasiko.</p> : <div className="studio-list">{info.spend.agents.map((a) => <div key={a.name} className="studio-list-row"><div className="studio-row-main"><strong>{a.name}</strong><small>{a.operations} operations</small></div><span>${a.cost.toFixed(2)}</span></div>)}</div>}
        </section>
      )}
    </div>
  )
}
