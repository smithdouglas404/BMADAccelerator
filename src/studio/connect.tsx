'use client'
// Connecting from outside: the OAuth consent page an assistant opens, and Settings > Connect (addresses,
// connect code, tokens for OpenAPI connectors and scripts, and the log of every call).
import { useEffect, useState } from 'react'
import { Bell, Check, Copy, KeyRound, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CopyField, Empty, Field, Row, Section, SectionBody, StatusBadge, Step, when } from './kit'
import { api } from './live'
import { PRODUCT_NAME as PRODUCT } from '@/lib/brand'

const ROLES = ['Product owner', 'Business analyst', 'Product engineer', 'Viewer', 'Admin']
type Level = 'read' | 'write' | 'admin'
const LEVELS: { key: Level; label: string }[] = [{ key: 'read', label: 'Look only' }, { key: 'write', label: 'Look and make changes (asks before approving or building)' }, { key: 'admin', label: 'Admin, full access (also archive and delete use cases; asks first)' }]
// Admin needs the Admin role; a Viewer only looks. The server applies the same rule (ROLE_RULES).
const fit = (role: string, scope: Level): Level => (role === 'Viewer' ? 'read' : scope === 'admin' && role !== 'Admin' ? 'write' : scope)

type Params = { client_id: string; redirect_uri: string; state: string; code_challenge: string }

export function ConsentPage({ problem, clientName, params, wantsWrite, customers }: { problem: string; clientName: string; params: Params; wantsWrite: boolean; customers: string[] }) {
  const [person, setPerson] = useState('')
  const [role, setRole] = useState(ROLES[0])
  const [customer, setCustomer] = useState('')
  const [scope, setScope] = useState<Level>(wantsWrite ? 'write' : 'read')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (deny = false) => {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ redirect: string }>('/api/oauth/approve', { json: { ...params, person, role, customer, scope: fit(role, scope), connect_code: code, deny } })
      window.location.href = r.redirect
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <div data-ui className="min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-xl gap-6 px-4 py-12">
        <div className="grid gap-2"><p className="text-sm font-medium text-primary">{PRODUCT}</p><h1 className="text-2xl font-semibold">Connect {clientName || 'an assistant'}</h1><p className="text-base text-muted-foreground">It will work on your use cases in your name. Approving, building and withdrawing always ask you first.</p></div>
        {problem ? <Section title="This link can’t be used"><SectionBody><p className="text-base">{problem}</p></SectionBody></Section> : (
          <Section title="Who it works for, and what it may do">
            <SectionBody>
              <Field id="oauth-person" label="Your name"><Input id="oauth-person" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Your name" autoComplete="name" /></Field>
              <Field id="oauth-role" label="Your role"><Select value={role} onValueChange={setRole}><SelectTrigger id="oauth-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field>
              <Field id="oauth-customer" label="Which customer it may see"><Select value={customer || '__all'} onValueChange={(v) => setCustomer(v === '__all' ? '' : v)}><SelectTrigger id="oauth-customer" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">Every customer</SelectItem>{customers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
              <Field id="oauth-scope" label="What it may do"><Select value={fit(role, scope)} disabled={role === 'Viewer'} onValueChange={(v) => { const l = v as Level; setScope(l); if (l === 'admin') setRole('Admin') }}><SelectTrigger id="oauth-scope" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field id="oauth-code" label="Connect code" hint="From Settings > Connect in the Studio."><Input id="oauth-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 letters" autoComplete="one-time-code" /></Field>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !person.trim() || !code.trim()} onClick={() => void send()} className="gap-1.5"><ShieldCheck className="size-4" /> Allow</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void send(true)}>Don’t allow</Button></div>
            </SectionBody>
          </Section>
        )}
      </div>
    </div>
  )
}

type Info = {
  mcpUrl: string
  openApiUrl: string
  isPublic: boolean
  tools: { name: string; title: string; write: boolean; need?: Level }[]
  tokens: { id: string; name: string; prefix: string; scope: string; customer: string; person: string; role: string; level?: Level; levelLabel?: string; viaOAuth: boolean; lastUsedAt: string | null; createdAt: string }[]
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
    <Section title="One step left: let the Studio send email from your Gmail" description={<>Open <a className="text-primary underline underline-offset-4" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Google app passwords</a>, make one named “Studio”, and type its 16 letters below. It is stored encrypted, used only to send these emails, and never shown again.</>} action={<StatusBadge tone="warn">Email not set up</StatusBadge>}>
      <SectionBody className="md:grid-cols-2">
        <Field id="gmail-address" label="Your Gmail address"><Input id="gmail-address" className="h-10" type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@gmail.com" /></Field>
        <Field id="gmail-password" label="App password"><Input id="gmail-password" className="h-10" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="16 letters" /></Field>
        <div className="md:col-span-2"><Button disabled={!address.includes('@') || password.replace(/\s+/g, '').length < 16} onClick={() => void save()}><Send className="size-4" /> Save and send a test</Button></div>
      </SectionBody>
    </Section>
  )
}

function Notify({ info, reload, setToast }: { info: Info; reload: () => void; setToast: (s: string) => void }) {
  const [form, setForm] = useState({ kind: 'email' as 'email' | 'slack' | 'webhook', address: '', customer: '' })
  const post = async (json: Record<string, unknown>, done?: string) => {
    try { await api('/api/settings/connect', { json }); if (done) setToast(done); reload() } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <>
      {!info.emailReady && info.notify.some((t) => t.kind === 'email') && <GmailSender info={info} reload={reload} setToast={setToast} />}
      <Section title="Send me what’s waiting" description="When a question, a checkpoint or something to try is waiting on you, the Studio sends it with its numbered options and a link within a couple of minutes. Several at once arrive as one message, and nothing is sent twice." action={<StatusBadge tone={info.notify.length ? 'ok' : 'off'}>{info.notify.length} {info.notify.length === 1 ? 'place' : 'places'}</StatusBadge>}>
        {info.notify.length === 0 && <Empty>Nowhere yet. Add an email address, Slack or a webhook below.</Empty>}
        {info.notify.map((t) => (
          <Row key={t.id} title={`${KIND_LABEL[t.kind]} · ${t.hint}`} detail={<>{t.customer || 'Every customer'} · last sent {when(t.lastSent)}{t.lastError ? <span className="block text-warning">Didn’t send: {t.lastError}</span> : null}</>}>
            <label className="flex items-center gap-2 text-sm"><Switch checked={t.enabled} onCheckedChange={(v) => void post({ action: 'notify_toggle', id: t.id, enabled: v })} aria-label={`Send to ${t.hint}`} /> On</label>
            <Button size="sm" variant="outline" onClick={() => void post({ action: 'notify_test', id: t.id }, 'Test sent. Check that it arrived.')}><Send className="size-4" /> Send a test</Button>
            <Button size="icon" variant="ghost" className="size-9" aria-label={`Stop sending to ${t.hint}`} onClick={() => void post({ action: 'notify_remove', id: t.id })}><Trash2 className="size-4" /></Button>
          </Row>
        ))}
      </Section>
      <Section title="Add a place to send">
        <SectionBody className="md:grid-cols-3">
          <Field id="notify-kind" label="Send to">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as typeof form.kind })}>
              <SelectTrigger id="notify-kind" className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="slack">Slack (incoming webhook)</SelectItem><SelectItem value="webhook">Any webhook (JSON)</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field id="notify-address" label={form.kind === 'email' ? 'Email address' : 'Webhook address'} hint={form.kind === 'email' ? undefined : 'Stored encrypted, never shown again'}><Input id="notify-address" className="h-10" type={form.kind === 'email' ? 'email' : 'password'} autoComplete="off" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={form.kind === 'email' ? 'you@company.com' : 'https://hooks.slack.com/services/…'} /></Field>
          <Field id="notify-customer" label="Customer" hint="Leave empty for every customer"><Input id="notify-customer" className="h-10" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Every customer" /></Field>
          <div className="md:col-span-3"><Button disabled={!form.address.trim()} onClick={() => void post({ action: 'notify_add', ...form }, 'Added. Use “Send a test” to check it.').then(() => setForm({ ...form, address: '' }))}><Bell className="size-4" /> Send here</Button></div>
        </SectionBody>
      </Section>
    </>
  )
}

function useConnectInfo(setToast: (s: string) => void) {
  const [info, setInfo] = useState<Info | null>(null)
  const load = () => void api<Info>('/api/settings/connect', { cache: 'no-store' }).then(setInfo).catch((e: Error) => setToast(e.message))
  useEffect(load, [setToast])
  return [info, load] as const
}

/** Settings > Notifications. */
export function NotifyTab({ setToast }: { setToast: (s: string) => void }) {
  const [info, load] = useConnectInfo(setToast)
  if (!info) return <p className="text-sm text-muted-foreground">Loading…</p>
  return <Notify info={info} reload={load} setToast={setToast} />
}

const LEVEL_SHORT = (l: Level) => LEVELS.find((x) => x.key === l)!.label.split(' (')[0]

/** Settings > Your assistants: connect Meta Muse in three steps, other assistants, who has access, every call. */
export function ConnectTab({ setToast }: { setToast: (s: string) => void }) {
  const [info, load] = useConnectInfo(setToast)
  const [code, setCode] = useState<{ code: string; until: string } | null>(null)
  const [form, setForm] = useState({ name: 'Meta Muse', scope: 'admin' as Level, customer: '', person: '', role: 'Admin' })
  const [shown, setShown] = useState('')
  if (!info) return <p className="text-sm text-muted-foreground">Loading…</p>
  const makeCode = async () => setCode(await api<{ code: string; until: string }>('/api/settings/connect', { json: { action: 'code' } }))
  const makeToken = async () => {
    try {
      const r = await api<{ token: string }>('/api/settings/connect', { json: { action: 'token', ...form } })
      setShown(r.token)
      setForm({ ...form, name: 'Meta Muse' })
      load()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const setAccess = async (id: string, scope: Level, role: string) => {
    const r = scope === 'admin' ? 'Admin' : role === 'Admin' ? 'Product owner' : role
    try { await api('/api/settings/connect', { json: { action: 'access', id, scope: fit(r, scope), role: r } }); setToast('Access changed. It applies to the next call.'); load() } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const setPerson = async (id: string, person: string) => {
    try { await api('/api/settings/connect', { json: { action: 'person', id, person: person.trim() } }); setToast(person.trim() ? `Its changes are now recorded as ${person.trim()}.` : 'Name cleared.'); load() } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const revoke = async (id: string) => { await api('/api/settings/connect', { json: { action: 'revoke', id } }); load() }
  const MUSE_TEXT = "Every 15 minutes, call the Socra Studio connector's whats_waiting tool. For every question waiting, tell me the product name, Socra's question and its numbered options, and which one Socra suggests. When I answer, call answer with that product's use_case_id and my words (a number picks that option). If answer comes back needing confirmation, show me the preview and send the same call again with confirm: true only after I say yes. Don't approve, build or withdraw anything unless I ask for it in that message."
  return (
    <>
      <Section title="Connect Meta Muse in three steps" description="Lets Muse read the Studio and act for you. You make a token here and paste it into Muse; nothing needs to come back into the Studio.">
        {!info.isPublic && <p className="border-b border-border bg-warning/10 px-5 py-3 text-sm text-warning">This Studio is only reachable on this computer, so Muse can’t reach it yet. docs/CONNECT.md explains how to give it a public address.</p>}
        <Step n={1} title="In Muse, add a custom connector with this address (OpenAPI)">
          <CopyField label="address for Muse" value={info.openApiUrl} />
        </Step>
        <Step n={2} title="Make a token and paste it into Muse’s bearer token or API key box" done={!!shown}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="token-name" label="Name for the token"><Input id="token-name" className="h-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Meta Muse" /></Field>
            <Field id="token-person" label="Acts in the name of"><Input id="token-person" className="h-10" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} placeholder="Doug" autoComplete="name" /></Field>
            <Field id="token-scope" label="What it may do">
              <Select value={form.scope} onValueChange={(v) => { const l = v as Level; setForm({ ...form, scope: l, role: l === 'admin' ? 'Admin' : form.role === 'Admin' ? 'Product owner' : form.role }) }}>
                <SelectTrigger id="token-scope" className="h-10 w-full"><SelectValue>{LEVEL_SHORT(form.scope)}</SelectValue></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button disabled={!form.name.trim()} onClick={() => void makeToken()}><KeyRound className="size-4" /> Make a token</Button>{!form.name.trim() && <span className="text-sm text-muted-foreground">Type a name first.</span>}</div>
          {shown && <div className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"><p className="text-sm">Shown once. Copy it into Muse now, and never paste it into a chat.</p><CopyField label="token" value={shown} /><div><Button size="sm" variant="ghost" onClick={() => setShown('')}>Done, hide it</Button></div></div>}
        </Step>
        <Step n={3} title="Give Muse this instruction">
          <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">{MUSE_TEXT}</p>
          <div><CopyButton value={MUSE_TEXT} /></div>
        </Step>
      </Section>

      <Section title="Claude, ChatGPT or a script" description={`${info.tools.length} tools. Approving, building, withdrawing, reopening, sending a card back, archiving and deleting always show a preview and wait for a yes.`}>
        <SectionBody>
          <Field id="mcp-url" label="MCP connector (Claude, ChatGPT)"><CopyField label="MCP address" value={info.mcpUrl} /></Field>
          <Field id="openapi-url" label="OpenAPI (custom GPT actions, scripts)"><CopyField label="OpenAPI address" value={info.openApiUrl} /></Field>
          <details><summary className="cursor-pointer text-sm text-muted-foreground">See all {info.tools.length} tools</summary><div className="mt-3 flex flex-wrap gap-1.5">{info.tools.map((t) => <StatusBadge key={t.name} tone={t.write ? 'info' : 'off'}>{t.title}</StatusBadge>)}</div></details>
        </SectionBody>
      </Section>

      <Section title="Sign-in code" description="When an assistant opens the Studio’s sign-in page, type this code there. It works once, for ten minutes." action={<Button size="sm" variant={code ? 'outline' : 'default'} onClick={() => void makeCode()}><ShieldCheck className="size-4" /> {code ? 'Make a new code' : 'Make a code'}</Button>}>
        {code && <SectionBody><p className="font-mono text-3xl font-medium tracking-[0.3em]">{code.code}</p></SectionBody>}
      </Section>

      <Section title="Who has access" description="Change what each one may do, or remove it. Changes apply to its next call." action={<StatusBadge tone={info.tokens.length ? 'ok' : 'off'}>{info.tokens.length} connected</StatusBadge>}>
        {info.tokens.length === 0 ? <Empty>Nothing connected yet.</Empty> : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader><TableRow><TableHead className="px-5">Assistant</TableHead><TableHead>Acts as</TableHead><TableHead>May</TableHead><TableHead>Last used</TableHead><TableHead className="w-12"><span className="sr-only">Remove</span></TableHead></TableRow></TableHeader>
              <TableBody>{info.tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="px-5"><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.customer || 'Every customer'} · {t.viaOAuth ? 'signed in' : `token ${t.prefix}…`}</div></TableCell>
                  <TableCell><Input aria-label={`Name ${t.name} acts in`} defaultValue={t.person} placeholder="Acts in the name of…" className="h-9 w-40" onBlur={(e) => { if (e.target.value.trim() !== t.person) void setPerson(t.id, e.target.value) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} /><div className="mt-1 text-xs text-muted-foreground">{t.role}</div></TableCell>
                  <TableCell>
                    <Select value={t.level ?? (t.scope as Level)} onValueChange={(v) => void setAccess(t.id, v as Level, t.role)}>
                      <SelectTrigger aria-label={`What ${t.name} may do`} className="h-9 w-48"><SelectValue>{LEVEL_SHORT(t.level ?? (t.scope as Level))}</SelectValue></SelectTrigger>
                      <SelectContent>{LEVELS.map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{when(t.lastUsedAt)}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="size-9" aria-label={`Remove access for ${t.name}`} onClick={() => void revoke(t.id)}><Trash2 className="size-4" /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="What assistants did" description={`Every call, newest first (latest ${info.calls.length}).`}>
        {info.calls.length === 0 ? <Empty>No calls yet.</Empty> : (
          <div className="max-h-[28rem] overflow-auto">
            <Table className="text-sm">
              <TableHeader><TableRow><TableHead className="px-5">What</TableHead><TableHead>Who</TableHead><TableHead>Result</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
              <TableBody>{info.calls.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="px-5 font-mono text-sm">{c.tool}</TableCell>
                  <TableCell>{c.person || 'Someone'}<div className="text-xs text-muted-foreground">{c.via === 'mcp' ? 'MCP' : 'REST'}</div></TableCell>
                  <TableCell className="max-w-80 whitespace-normal"><StatusBadge tone={c.outcome === 'ok' ? 'ok' : c.outcome === 'needs-confirm' ? 'info' : 'warn'}>{c.outcome === 'ok' ? 'Done' : c.outcome === 'needs-confirm' ? 'Asked to confirm' : c.outcome}</StatusBadge>{c.note && <div className="mt-1 text-xs text-muted-foreground">{c.note}</div>}</TableCell>
                  <TableCell className="text-muted-foreground">{when(c.createdAt)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </Section>
    </>
  )
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500) }).catch(() => undefined)}>{done ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}{done ? 'Copied' : 'Copy the instruction'}</Button>
}
