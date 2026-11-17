'use client'
// Settings: models and keys, MCP connectors (for every product or chosen ones), Agent Skills, and memory.
// Keys and connector secrets go in once, are stored encrypted, and are never shown again (last four only).
import { useEffect, useState } from 'react'
import { Check, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, Field, PageHeader, Row, Section, SectionBody, StatusBadge } from './kit'
import { api } from './live'
import { Shell } from './pages'
import { ConnectTab, NotifyTab } from './connect'
import { JevValue } from './jev'

type KeyStatus = { env: string; name: string; source: 'saved' | 'env' | 'missing'; last4: string }
type Status = { providers: (KeyStatus & { id: string; models: string[] })[]; other: KeyStatus[]; claudePlan: boolean; roles: { env: string; label: string; note: string; providers: string[]; current: string; saved: boolean }[] }
type Connector = { id: string; name: string; label: string; transport: string; url: string; command: string; args: string[]; secretNames: string[]; hasSecrets: boolean; enabled: boolean; allProducts: boolean; useCases: string[] }
type Product = { id: string; name: string }

type LibSkill = { id: string; name: string; description: string; source: 'studio' | 'ecc' | 'yours'; origin: string; alwaysOn: boolean; core: boolean; allProducts: boolean; useCases: string[]; valid: boolean; report: string }
const SOURCES = [['all', 'All'], ['studio', 'Studio'], ['ecc', 'ECC'], ['yours', 'Yours']] as const
const PAGE = 40

const TABS = [
  { group: 'What runs Socra', items: [['models', 'AI models and keys', 'Which model does each job'], ['skills', 'Skills', 'What Socra and Claude Code know'], ['memory', 'Memory', 'Mem0 and Letta']] },
  { group: 'Connections', items: [['connectors', 'Tools Socra can use', 'Notion, databases, your APIs'], ['connect', 'Your assistants', 'Claude, ChatGPT, Meta Muse'], ['notify', 'Notifications', 'Email, Slack, webhooks']] },
  { group: 'Measured', items: [['jev', 'Jev', 'Small judgments, checked']] },
] as const
type Tab = (typeof TABS)[number]['items'][number][0]
const TAB_IDS = TABS.flatMap((g) => g.items.map((i) => i[0])) as Tab[]

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('models')
  const [toast, setToast] = useState('')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (t && TAB_IDS.includes(t)) setTab(t)
  }, [])
  const choose = (t: string) => {
    setTab(t as Tab)
    try { window.history.replaceState(null, '', t === 'models' ? '/settings' : `/settings?tab=${t}`) } catch { /* ignore */ }
  }
  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(''), 5000); return () => window.clearTimeout(t) } }, [toast])
  return (
    <Shell active="settings">
      <div data-ui className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:px-8">
        <PageHeader title="Settings" eyebrow="Settings" headline={<>The plumbing,<br /><em>out of the way.</em></>} description="Everything here applies to the whole Studio, not one use case." />
        <Tabs value={tab} onValueChange={choose} orientation="vertical" className="grid items-start gap-8 md:grid-cols-[15rem_1fr]">
          <TabsList aria-label="Settings sections" className="h-fit w-full flex-col items-stretch gap-1 bg-transparent p-0 max-md:hidden md:sticky md:top-20">
            {TABS.map((g) => (
              <div key={g.group} className="grid gap-0.5 pb-3">
                <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{g.group}</p>
                {g.items.map(([k, label, hint]) => (
                  <TabsTrigger key={k} value={k} className="h-auto w-full flex-col items-start gap-0 rounded-lg px-3 py-2 text-left text-sm text-foreground data-[state=active]:bg-accent data-[state=active]:font-semibold">
                    <span>{label}</span><span className="text-xs font-normal text-muted-foreground">{hint}</span>
                  </TabsTrigger>
                ))}
              </div>
            ))}
          </TabsList>
          <div className="grid min-w-0 gap-6">
            <div className="md:hidden">
              <Select value={tab} onValueChange={choose}>
                <SelectTrigger aria-label="Settings section" className="h-11 w-full text-base"><SelectValue /></SelectTrigger>
                <SelectContent>{TABS.map((g) => g.items.map(([k, label]) => <SelectItem key={k} value={k}>{g.group}: {label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {tab === 'models' && <Models setToast={setToast} />}
            {tab === 'connectors' && <Connectors setToast={setToast} />}
            {tab === 'connect' && <ConnectTab setToast={setToast} />}
            {tab === 'notify' && <NotifyTab setToast={setToast} />}
            {tab === 'skills' && <Skills setToast={setToast} />}
            {tab === 'memory' && <Memory />}
            {tab === 'jev' && <JevValue />}
          </div>
        </Tabs>
      </div>
      {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </Shell>
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
  const id = `key-${k.env}`
  return (
    <Row
      title={k.name}
      badge={k.source === 'missing' ? <StatusBadge tone="off">Not set</StatusBadge> : <StatusBadge tone="ok">{k.source === 'saved' ? 'Saved here' : 'From .env'} · ends {k.last4}</StatusBadge>}
    >
      <Input id={id} aria-label={`${k.name} key`} className="h-9 w-64 max-w-full text-sm" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.source === 'missing' ? 'Paste the key here' : 'Replace the key'} />
      <Button size="sm" disabled={!value.trim()} onClick={() => void save()}>Save</Button>
      {k.source === 'saved' && <Button size="sm" variant="ghost" onClick={() => void remove()}>Remove</Button>}
    </Row>
  )
}

const DEFAULT = '__default'

function Models({ setToast }: { setToast: (s: string) => void }) {
  const [s, setS] = useState<Status | null>(null)
  useEffect(() => { void api<Status>('/api/settings/models', { cache: 'no-store' }).then(setS).catch((e: Error) => setToast(e.message)) }, [setToast])
  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>
  const models = (providers: string[]) => s.providers.filter((p) => providers.includes(p.id)).flatMap((p) => p.models)
  const setModel = async (role: string, model: string) => {
    try { setS(await api<Status>('/api/settings/models', { method: 'PUT', json: { action: 'model', role, model: model === DEFAULT ? null : model } })); setToast('Model saved; it applies to the next run.') } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <>
      <Section
        title="Claude plan"
        description={s.claudePlan ? 'Socra and Claude Code run on your Claude plan. Nothing to do here.' : 'Claude is signed in once, during setup on this computer. Until then everything you say is kept, and Socra catches up when it starts.'}
        action={s.claudePlan ? <StatusBadge tone="ok">Signed in</StatusBadge> : <StatusBadge tone="warn">Not signed in yet</StatusBadge>}
      />
      <Section statement={<>The right model <em>for each job.</em></>} title="Which model does each job" description="Changes apply to the next run.">
        <SectionBody className="gap-5">
          {s.roles.map((r) => {
            const list = models(r.providers)
            const value = r.current || DEFAULT
            return (
              <Field key={r.env} id={`model-${r.env}`} label={r.label} hint={r.note}>
                <Select value={value} onValueChange={(v) => void setModel(r.env, v)}>
                  <SelectTrigger id={`model-${r.env}`} className="h-10 w-full max-w-md text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!list.includes(r.current) && <SelectItem value={value}>{r.current || 'Default'}</SelectItem>}
                    {list.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )
          })}
        </SectionBody>
      </Section>
      <Section statement={<>Keys stay <em>on the server.</em></>} title="Keys" description="Stored encrypted and never shown again; only the last four characters are kept on screen. Never paste a key into a chat.">
        {[...s.providers, ...s.other].map((k) => <KeyRow key={k.env} k={k} onSaved={setS} setToast={setToast} />)}
      </Section>
    </>
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
      setToast('Tool added. Socra and Claude Code can use it from the next run.')
      load()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  const patch = async (id: string, body: Record<string, unknown>) => { await api(`/api/connectors/${id}`, { method: 'PATCH', json: body }).catch((e: Error) => setToast(e.message)); load() }
  const test = async (id: string) => {
    setTests({ ...tests, [id]: 'Testing…' })
    const r = await api<{ ok: boolean; tools: string[]; error?: string }>(`/api/connectors/${id}`, { method: 'POST' }).catch((e: Error) => ({ ok: false, tools: [], error: e.message }))
    setTests((t) => ({ ...t, [id]: r.ok ? `Works: ${r.tools.length} tools (${r.tools.slice(0, 6).join(', ')}${r.tools.length > 6 ? '…' : ''})` : `Didn’t connect: ${r.error ?? 'no answer'}` }))
  }
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  return (
    <>
      <Section
        statement={<>Give Socra <em>the right tools.</em></>} title="Tools Socra can use"
        description={<>Outside systems the Studio calls, such as Notion, a database or your own API, added as MCP servers. To let Claude, ChatGPT or Meta Muse reach the Studio instead, use <strong className="text-foreground">Your assistants</strong>.</>}
        action={<StatusBadge tone={rows.length ? 'ok' : 'off'}>{rows.length} added</StatusBadge>}
      >
        {rows.length === 0 && <Empty>None yet. Add one below, for every use case or chosen ones.</Empty>}
        {rows.map((c) => (
          <Row key={c.id} title={c.label || c.name} detail={<>{c.name} · {c.transport} · {c.transport === 'stdio' ? c.command : c.url} · {c.allProducts ? 'every use case' : `${c.useCases.length} use cases`}{c.secretNames.length ? ` · secrets: ${c.secretNames.join(', ')}` : ''}{tests[c.id] && <span className="mt-1 block text-foreground">{tests[c.id]}</span>}</>}>
            <label className="flex items-center gap-2 text-sm"><Switch checked={c.enabled} onCheckedChange={(v) => void patch(c.id, { enabled: v })} aria-label={`${c.label || c.name} on`} /> On</label>
            <Button size="sm" variant="outline" onClick={() => void test(c.id)}>Test</Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${c.label || c.name}`} onClick={() => void api(`/api/connectors/${c.id}`, { method: 'DELETE' }).then(load)}><Trash2 className="size-4" /></Button>
          </Row>
        ))}
      </Section>
      <Section title="Add a tool" description="Any MCP server. Secrets are stored encrypted and never shown again.">
        <SectionBody className="gap-5 md:grid-cols-2">
          <Field id="conn-name" label="Short name" hint="Lower case, no spaces"><Input id="conn-name" className="h-10" value={form.name} onChange={set('name')} placeholder="notion" /></Field>
          <Field id="conn-label" label="Label"><Input id="conn-label" className="h-10" value={form.label} onChange={set('label')} placeholder="Team Notion" /></Field>
          <Field id="conn-transport" label="How it connects">
            <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
              <SelectTrigger id="conn-transport" className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="http">Streamable HTTP</SelectItem><SelectItem value="sse">SSE</SelectItem><SelectItem value="stdio">Command (stdio)</SelectItem></SelectContent>
            </Select>
          </Field>
          {form.transport === 'stdio'
            ? <><Field id="conn-command" label="Command"><Input id="conn-command" className="h-10" value={form.command} onChange={set('command')} placeholder="npx" /></Field><Field id="conn-args" label="Arguments"><Input id="conn-args" className="h-10" value={form.args} onChange={set('args')} placeholder="-y @scope/server" /></Field></>
            : <Field id="conn-url" label="Address"><Input id="conn-url" className="h-10" value={form.url} onChange={set('url')} placeholder="https://mcp.example.com/mcp" /></Field>}
          <Field id="conn-secret-key" label="Secret name (optional)" hint="A header or environment variable"><Input id="conn-secret-key" className="h-10" value={form.secretKey} onChange={set('secretKey')} placeholder={form.transport === 'stdio' ? 'API_KEY' : 'Authorization'} /></Field>
          {form.secretKey && <Field id="conn-secret-value" label="Secret value"><Input id="conn-secret-value" className="h-10" type="password" autoComplete="off" value={form.secretValue} onChange={set('secretValue')} /></Field>}
          <div className="grid gap-3 md:col-span-2">
            <label className="flex items-center gap-3 text-sm"><Switch checked={form.allProducts} onCheckedChange={(v) => setForm({ ...form, allProducts: v })} /> For every use case</label>
            {!form.allProducts && <div className="flex flex-wrap gap-x-5 gap-y-2">{products.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.useCases.includes(p.id)} onCheckedChange={(v) => setForm({ ...form, useCases: v ? [...form.useCases, p.id] : form.useCases.filter((x) => x !== p.id) })} /> {p.name}</label>)}</div>}
          </div>
          <div className="md:col-span-2"><Button disabled={!form.name.trim()} onClick={() => void add()}><Plus className="size-4" /> Add tool</Button></div>
        </SectionBody>
      </Section>
    </>
  )
}

// One skill library: the open-source ECC library, the Studio's own skills (in ECC's format) and uploads.
function Skills({ setToast }: { setToast: (s: string) => void }) {
  const [rows, setRows] = useState<LibSkill[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [source, setSource] = useState<(typeof SOURCES)[number][0]>('all')
  const [q, setQ] = useState('')
  const [onOnly, setOnOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
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
      .then(() => { setToast(allProducts ? `${s.name} is on for every use case` : useCases.length ? `${s.name} is on for ${useCases.length} use case${useCases.length === 1 ? '' : 's'}` : `${s.name} is off`); load() })
      .catch((e: Error) => setToast(e.message))
  const isOn = (s: LibSkill) => s.alwaysOn || s.allProducts || s.useCases.length > 0
  const count = (k: string) => rows.filter((r) => k === 'all' || r.source === k).length
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const order = (r: LibSkill) => (r.source === 'studio' ? 0 : r.source === 'yours' ? 1 : isOn(r) ? 2 : 3)
  const list = rows.filter((r) => (source === 'all' || r.source === source) && (!onOnly || isOn(r)) && words.every((w) => `${r.name} ${r.description}`.toLowerCase().includes(w))).sort((a, b) => order(a) - order(b))
  const where = (s: LibSkill) => s.core ? 'Core · every Socra turn' : s.alwaysOn ? 'Always on' : s.allProducts ? 'On · every use case' : s.useCases.length ? `On · ${s.useCases.length} use case${s.useCases.length === 1 ? '' : 's'}` : 'Off'
  const sourceLabel = (s: LibSkill) => (s.source === 'ecc' ? 'ECC' : s.source === 'studio' ? 'Studio' : 'Yours')
  return (
    <Section
      statement={<>Skills, <em>not prompts.</em></>} title="Skill library"
      description="ECC (Everything Claude Code, open source, MIT) plus the Studio’s own skills and yours, in one place. A skill that is on goes into each use case’s workspace, where Socra, its specialists and Claude Code use it."
      action={<Button variant="outline" size="sm" asChild><label className="cursor-pointer"><Upload className="size-4" /> Add a skill<input type="file" className="sr-only" accept=".skill,.zip,.md" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} /></label></Button>}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <Tabs value={source} onValueChange={(v) => { setSource(v as typeof source); setShown(PAGE) }}>
          <TabsList aria-label="Where skills come from" className="!h-9 !flex-row">{SOURCES.map(([k, l]) => <TabsTrigger key={k} value={k} className="!w-auto !justify-center px-3 text-sm">{l} <span className="text-xs text-muted-foreground">{count(k)}</span></TabsTrigger>)}</TabsList>
        </Tabs>
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="skill-search" type="search" className="h-9 pl-9 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} placeholder="Search, e.g. security, postgres, accessibility" aria-label="Search the skill library" /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={onOnly} onCheckedChange={setOnOnly} /> Only what’s on</label>
      </div>
      {list.slice(0, shown).map((s) => (
        <div key={s.id} className="border-b border-border last:border-b-0">
          <Row className="border-b-0" title={s.name} badge={<><StatusBadge tone={s.source === 'studio' ? 'ok' : s.source === 'yours' ? 'info' : 'off'}>{sourceLabel(s)}</StatusBadge>{s.source === 'yours' && !s.valid && <StatusBadge tone="warn">Didn’t pass the check</StatusBadge>}</>} detail={s.description || 'No description'}>
            <span className={isOn(s) ? 'text-sm font-medium text-primary' : 'text-sm text-muted-foreground'}>{where(s)}</span>
            {s.source === 'ecc' && !s.alwaysOn && <Button size="sm" variant={open === s.id ? 'default' : 'outline'} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Done' : 'Change'}</Button>}
            {s.source === 'yours' && <Switch disabled={!s.valid} checked={s.allProducts} aria-label={`${s.name} on`} onCheckedChange={(v) => void api(`/api/skills/${s.id.slice(6)}`, { method: 'PATCH', json: { enabled: v } }).then(load).catch((er: Error) => setToast(er.message))} />}
            {s.source === 'yours' && <Button size="icon" variant="ghost" className="size-8" aria-label={`Delete ${s.name}`} onClick={() => void api(`/api/skills/${s.id.slice(6)}`, { method: 'DELETE' }).then(load)}><Trash2 className="size-4" /></Button>}
          </Row>
          {s.source === 'yours' && s.report && <details className="px-5 pb-3"><summary className="cursor-pointer text-sm text-muted-foreground">Check report</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs">{s.report}</pre></details>}
          {open === s.id && (
            <div className="grid gap-3 px-5 pb-4">
              <RadioGroup value={s.allProducts ? 'all' : s.useCases.length ? 'some' : 'off'} onValueChange={(v) => { if (v === 'off') scope(s, false, []); if (v === 'all') scope(s, true, []) }} className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="off" /> Off</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" /> Every use case</label>
                {s.useCases.length > 0 && !s.allProducts && <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="some" /> Chosen use cases</label>}
              </RadioGroup>
              {products.length > 0 && <div className="flex flex-wrap gap-x-5 gap-y-2"><span className="text-sm text-muted-foreground">Or only:</span>{products.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><Checkbox checked={!s.allProducts && s.useCases.includes(p.id)} onCheckedChange={(v) => scope(s, false, v ? [...s.useCases.filter((x) => x !== p.id), p.id] : s.useCases.filter((x) => x !== p.id))} /> {p.name}</label>)}</div>}
            </div>
          )}
        </div>
      ))}
      {list.length === 0 && <Empty>No skill matches that.</Empty>}
      {list.length > shown && <div className="px-5 py-3"><Button variant="outline" size="sm" onClick={() => setShown(shown + PAGE * 2)}>Show more ({list.length - shown} left)</Button></div>}
    </Section>
  )
}

function Memory() {
  const [m, setM] = useState<{ mem0: { configured: boolean; up: boolean }; letta: { up: boolean; note?: string }; roles: { key: string; name: string; lessons: string }[] } | null>(null)
  useEffect(() => { void api<typeof m>('/api/memory', { cache: 'no-store' }).then(setM).catch(() => setM(null)) }, [])
  return (
    <>
      <Section statement={<>Agents that <em>remember.</em></>} title="Memory" description="Self-hosted Mem0 keeps long-term facts; Letta keeps each agent’s working mind. Both run on this computer.">
        {!m ? <Empty>Reading memory status…</Empty> : <>
          <Row title="Mem0" detail={m.mem0.up ? 'Long-term facts, per customer and use case. Running.' : m.mem0.configured ? 'Configured, not answering.' : 'Not configured.'}><StatusBadge tone={m.mem0.up ? 'ok' : 'warn'}>{m.mem0.up ? 'Up' : 'Down'}</StatusBadge></Row>
          <Row title="Letta" detail={m.letta.up ? 'Agents’ working memory and personas. Running.' : m.letta.note || 'Not answering.'}><StatusBadge tone={m.letta.up ? 'ok' : 'warn'}>{m.letta.up ? 'Up' : 'Down'}</StatusBadge></Row>
        </>}
      </Section>
      {m && m.roles?.some((r) => r.lessons) && (
        <Section title="What each agent has learned" description="Lessons carried between use cases.">
          {m.roles.filter((r) => r.lessons).map((r) => <Row key={r.key} title={r.name} detail={r.lessons.slice(0, 280)} />)}
        </Section>
      )}
    </>
  )
}
