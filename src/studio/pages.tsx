'use client'
// The pages around the Studio: every product, a new product in a few lines (spoken or typed, plus any
// documents), and the phone capture page. On shadcn/ui + Animate UI.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, FileText, Mic, Plus, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field, PageHeader, Section, SectionBody, StatusBadge } from './kit'
import { api, ago } from './live'
import { useVoice } from './vibe'
import { useMe } from './flow'
import { StudioFrame, StudioSidebar, StudioTopBar } from './shell'

type ProductRow = { id: string; name: string; statement: string; category: string; stageLabel: string; customer: string; businessArea: string; lastView: string; readiness: number; versions: number; thoughts: number; decisions: number; busy: boolean; updatedAt: string }

const PLACE_TITLES = { home: 'All use cases', new: 'New use case', capture: 'Capture a thought', settings: 'Settings' } as const

/** Home, New, Capture and Settings: the same sidebar as inside a use case, the place's title in the top bar. */
export function Shell({ active, children }: { active: 'home' | 'new' | 'settings' | 'capture'; children: ReactNode }) {
  return (
    <StudioFrame sidebar={<StudioSidebar place={active} />}>
      <StudioTopBar crumbs={<strong className="font-semibold text-foreground">{PLACE_TITLES[active]}</strong>} />
      <div className="studio-page">{children}</div>
    </StudioFrame>
  )
}

export const BUSINESS_AREAS = ['Finance', 'IT', 'HR', 'Operations', 'Sales', 'Marketing', 'Customer service', 'Legal / Compliance', 'Supply chain'] as const

export function HomePage() {
  const [rows, setRows] = useState<ProductRow[] | null>(null)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState('')
  const customers = [...new Set((rows ?? []).map((r) => r.customer || 'No customer yet'))].sort()
  const shown = (rows ?? []).filter((r) => !customer || (r.customer || 'No customer yet') === customer)
  useEffect(() => {
    void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then(setRows).catch((e: Error) => setError(e.message))
  }, [])
  return (
    <Shell active="home">
      <div data-ui className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-8 md:px-8">
        <PageHeader
          title="All use cases" eyebrow="Every product you are shaping" headline={<>Make the product <em>legible</em><br />before you make it real.</>}
          description="Say what you want in a few lines. Socra works out what kind of product it is, lays down everything the leading products of that kind have, and asks only what it can’t know."
          actions={<Button asChild><a href="/new"><Plus className="size-4" /> New use case</a></Button>}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {customers.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Customer">
            <Button type="button" size="sm" variant={!customer ? 'secondary' : 'ghost'} aria-pressed={!customer} onClick={() => setCustomer('')}>Every customer</Button>
            {customers.map((c) => <Button key={c} type="button" size="sm" variant={customer === c ? 'secondary' : 'ghost'} aria-pressed={customer === c} onClick={() => setCustomer(c)}>{c}</Button>)}
          </div>
        )}
        {rows === null && !error && <p className="text-sm text-muted-foreground">Loading your use cases…</p>}
        {rows?.length === 0 && (
          <div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-border px-6 py-10">
            <p className="text-lg font-semibold">No use cases yet</p>
            <p className="text-base text-muted-foreground">Start one in a few lines, typed or spoken. A deck or a business case helps if you have one.</p>
            <Button asChild><a href="/new"><Plus className="size-4" /> New use case</a></Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <a key={r.id} href={`/use-cases/${r.id}${r.lastView ? `?view=${r.lastView}` : ''}`} className="group grid min-w-0 content-start gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-muted-foreground">{[r.customer, r.businessArea].filter(Boolean).join(' · ') || r.category || r.stageLabel}</p>
                {r.busy ? <StatusBadge tone="suggest">working…</StatusBadge> : <StatusBadge tone="off">{r.stageLabel || 'shaping'}</StatusBadge>}
              </div>
              <h2 className="text-lg font-semibold">{r.name}</h2>
              <p className="line-clamp-3 text-sm text-muted-foreground">{r.statement}</p>
              <div className="flex items-center gap-3"><Progress value={r.readiness} className="h-1.5" /><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.readiness}% ready</span></div>
              <p className="text-xs text-muted-foreground">{r.versions} {r.versions === 1 ? 'version' : 'versions'} · {r.thoughts} thoughts · {r.decisions} decisions · updated {ago(r.updatedAt)}</p>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">Pick up where you left off <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
            </a>
          ))}
        </div>
      </div>
    </Shell>
  )
}

export function NewProductPage() {
  const [description, setDescription] = useState('')
  const [customer, setCustomer] = useState('')
  const [useCase, setUseCase] = useState('')
  const [area, setArea] = useState('')
  const [areaOther, setAreaOther] = useState('')
  const [summary, setSummary] = useState('')
  const [known, setKnown] = useState<string[]>([])
  useEffect(() => {
    void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then((r) => setKnown([...new Set(r.map((x) => x.customer).filter(Boolean))].sort())).catch(() => undefined)
  }, [])
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [me] = useMe()
  const voice = useVoice(true, (t) => setDescription((d) => `${d}${d ? '\n' : ''}${t}`), setNote, { clean: true })
  const start = async () => {
    if (!description.trim() && !summary.trim() && !files.length) return setNote('Say or type a few lines about what you want to make, or add a document that describes it.')
    setBusy(true)
    try {
      const said = description.trim() || (files.length ? `Here is what I have so far: ${files.map((f) => f.name).join(', ')}.` : '')
      const businessArea = area === 'Other' ? areaOther.trim() || 'Other' : area
      const uc = await api<{ id: string }>('/api/use-cases', { json: { description: said, name: useCase.trim(), customer: customer.trim(), businessArea, summary: summary.trim(), author: me } })
      if (files.length) {
        const form = new FormData()
        files.forEach((f) => form.append('files', f))
        form.append('kind', 'uploaded')
        form.append('opening', '1')
        await fetch(`/api/use-cases/${uc.id}/documents`, { method: 'POST', body: form })
      }
      await api('/api/use-cases', { method: 'PUT', json: { id: uc.id } })
      window.location.href = `/use-cases/${uc.id}?view=conversation`
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Shell active="new">
      <div data-ui className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-8 md:px-8">
        <PageHeader title="New use case" eyebrow="A new product" headline={<>Say it the way<br />you’d <em>say it.</em></>} description="A few lines is enough, and a business case or a deck helps if you have one. Socra works out what kind of product it is, names it, lays out everything the leading products of that kind have, and asks you what only you can answer." />
        <Section statement={<>Start with <em>the person.</em></>} title="Who it’s for" description="Each customer’s use cases, documents, memory and agents are kept apart.">
          <SectionBody className="items-start sm:grid-cols-2">
            <Field id="new-customer" label="Customer">
              <Input id="new-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} list="studio-customers" placeholder="e.g. Acme Insurance" />
            </Field>
            <datalist id="studio-customers">{known.map((c) => <option key={c} value={c} />)}</datalist>
            <Field id="new-name" label="Use case name" hint="Optional: Socra suggests one.">
              <Input id="new-name" value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder="e.g. Claims intake" />
            </Field>
            <Field id="new-area" label="Business area">
              <Select value={area || undefined} onValueChange={setArea}>
                <SelectTrigger id="new-area" className="w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                <SelectContent>{BUSINESS_AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}<SelectItem value="Other">Other</SelectItem></SelectContent>
              </Select>
            </Field>
            {area === 'Other' && <Field id="new-area-other" label="Which area?"><Input id="new-area-other" value={areaOther} onChange={(e) => setAreaOther(e.target.value)} placeholder="Say it in your words" /></Field>}
          </SectionBody>
        </Section>
        <Section statement={<>Say what it <em>should do.</em></>} title="What you want to make" description="Type it, say it, or add what you already have. Socra reads it all.">
          <SectionBody>
            <Field id="new-summary" label="Short description">
              <Input id="new-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} placeholder="One or two lines: the problem and who has it" />
            </Field>
            <Field id="new-description" label="In your own words">
              <Textarea id="new-description" rows={7} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who it’s for, what it should let them do, anything you already know… or just the idea in one line." autoFocus className="min-h-40 text-base md:text-base" />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={voice.listening ? 'default' : 'outline'} onClick={voice.toggle} disabled={voice.working} aria-pressed={voice.listening} className={cn(voice.listening && 'animate-pulse')}><Mic className="size-4" /> {voice.listening ? 'Listening… press again to stop' : voice.working ? 'Writing it down…' : 'Say it instead'}</Button>
              <Button asChild variant="outline"><label className="cursor-pointer"><Upload className="size-4" /> Add documents<input type="file" multiple hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.json,.html" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} /></label></Button>
            </div>
            <p className="text-xs text-muted-foreground">Decks, business cases, spreadsheets, PDFs, notes or screenshots.</p>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">{files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-border py-1 pr-1 pl-3 text-sm"><FileText className="size-4 text-muted-foreground" /> {f.name}<Button type="button" size="icon" variant="ghost" className="size-6" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3.5" /></Button></li>
              ))}</ul>
            )}
          </SectionBody>
        </Section>
        {note && <p className="text-sm text-muted-foreground" role="status">{note}</p>}
        <div><Button size="lg" disabled={busy || voice.listening} onClick={() => void start()}>{busy ? 'Opening the room…' : 'Start with Socra'} <ArrowRight className="size-4" /></Button></div>
      </div>
    </Shell>
  )
}

/** The phone page: pick a product, say or type a thought, and it lands in the ambient backlog. */
export function CapturePage() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [product, setProduct] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(0)
  const voice = useVoice(true, (t) => setText((d) => `${d}${d ? ' ' : ''}${t}`), setNote)
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('product') ?? ''
    void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then((r) => { setRows(r); setProduct(wanted && r.some((x) => x.id === wanted) ? wanted : r[0]?.id ?? '') }).catch(() => setRows([]))
  }, [])
  const send = async () => {
    const t = text.trim()
    if (!t || !product) return
    try {
      await api(`/api/use-cases/${product}/capture`, { json: { text: t, source: 'Phone / voice' } })
      setText('')
      setSaved((n) => n + 1)
      setNote('Held in the backlog, in your words. No need to make it a ticket.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Shell active="capture">
      <div data-ui className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-6 px-4 py-8 md:px-8">
        <PageHeader title="Capture a thought" eyebrow="Ambient capture" headline={<>Catch the thought<br /><em>before it’s a task.</em></>} description="Phone, voice, or a half-sentence is enough. It waits in the backlog until Socra finds its home." />
        <Section title="The thought">
          <SectionBody>
            <Field id="capture-product" label="Use case">
              <Select value={product || undefined} onValueChange={setProduct}>
                <SelectTrigger id="capture-product" className="w-full"><SelectValue placeholder="Choose a use case" /></SelectTrigger>
                <SelectContent>{rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="capture-text" label="What’s on your mind">
              <Textarea id="capture-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="I keep thinking about…" className="min-h-28 text-base md:text-base" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={voice.listening ? 'default' : 'outline'} onClick={voice.toggle} aria-pressed={voice.listening} className={cn(voice.listening && 'animate-pulse')}><Mic className="size-4" /> {voice.listening ? 'Listening… press to stop' : 'Say it'}</Button>
              <Button type="button" onClick={() => void send()} disabled={!text.trim() || !product}><Plus className="size-4" /> Hold this thought</Button>
            </div>
            {note && <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">{saved > 0 && <Check className="size-4 text-primary" />} {note}</p>}
          </SectionBody>
        </Section>
      </div>
    </Shell>
  )
}
