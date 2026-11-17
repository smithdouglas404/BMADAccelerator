'use client'

// The Board (Doug, Nov 16): the team's Kanban made fully usable. Cards still move themselves (Socra, the
// builds and people's answers move them), but a person can also drag a card or use its arrows, open a
// card to see and edit everything on it, add a card, and attach files. Every change is logged and Socra
// hears it. On shadcn/ui + Animate UI; the card opens in a Sheet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, FileText, History, Network, Paperclip, Play, Plus, Target, Upload } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, StatusBadge } from './kit'
import { api, ago, type Live } from './live'
import type { Me, StudioView } from './flow'

type Status = 'queued' | 'ready' | 'building' | 'review' | 'done'
const COLUMNS: { id: Status; label: string; description: string }[] = [
  { id: 'queued', label: 'Backlog', description: 'Worth holding' },
  { id: 'ready', label: 'Ready to shape', description: 'Promise is clear' },
  { id: 'building', label: 'Being made real', description: 'Agent + human in motion' },
  { id: 'review', label: 'Human review', description: 'Decide what ships' },
  { id: 'done', label: 'Done', description: 'Shipped, still traceable' },
]
const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label])) as Record<Status, string>
const ORDER = COLUMNS.map((c) => c.id)
const KINDS = ['story', 'epic', 'task', 'workflow', 'capability']

type CardDetail = {
  move: { id: string; title: string; capability: string; decision: string; prompt: string; status: Status; owner: string; signal: string; hidden: string; components: string[]; routes: string[]; trackerUrl: string; movedBy: string; moveReason: string; updatedAt: string }
  history: { id: string; kind: string; summary: string; by: string; createdAt: string }[]
  files: { id: string; fileName: string; mimeType: string; sizeBytes: number; summary: string; createdAt: string }[]
}

type Props = { live: Live; me: Me; buildNow: () => void; changeView: (v: StudioView) => void; setToast: (v: string) => void; children?: React.ReactNode }

const ownerMark = (o: string) => (o === 'Claude Code' ? 'C' : o === 'UX agent' ? 'U' : o === 'Product owner' ? 'PO' : o.slice(0, 1).toUpperCase() || 'A')
/** Socra writes some lines with record ids (move:…, backlog:…); show the card's name instead. */
const plain = (text: string, live: Live) =>
  text.replace(/\b(move|backlog|msg|decision):([a-z0-9]{8,})/gi, (all, kind: string, ref: string) => {
    const hit = kind === 'move' ? live.moves.find((m) => m.id === ref)?.title : kind === 'backlog' ? live.backlog.find((b) => b.id === ref)?.title : undefined
    return hit ? `“${hit}”` : kind === 'move' || kind === 'backlog' ? 'another card' : all
  })
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

export function BoardView({ live, me, buildNow, changeView, setToast, children }: Props) {
  const by = me.name || me.role || 'A person'
  // Moves show at once on this screen, before the next refresh confirms them.
  const [local, setLocal] = useState<Record<string, Status>>({})
  const [dragging, setDragging] = useState('')
  const [over, setOver] = useState<Status | ''>('')
  const [open, setOpen] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  useEffect(() => { setLocal({}) }, [live.updatedAt])

  const cards = live.moves.map((m) => ({ ...m, status: (local[m.id] ?? (ORDER.includes(m.status as Status) ? m.status : 'queued')) as Status }))

  const move = async (id: string, status: Status, why = '') => {
    const card = cards.find((c) => c.id === id)
    if (!card || card.status === status) return
    setLocal((l) => ({ ...l, [id]: status }))
    try {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { status, by, why } })
      setToast(status === 'done' ? `“${card.title}” is done. It stays traceable to its decision.` : `“${card.title}” moved to ${LABEL[status]}${ORDER.indexOf(status) < ORDER.indexOf(card.status) ? `. ${ASSISTANT_NAME} will ask what isn’t right yet.` : ''}`)
    } catch (e) {
      setLocal((l) => { const n = { ...l }; delete n[id]; return n })
      setToast(e instanceof Error ? e.message : String(e))
    }
  }
  const step = (id: string, dir: 1 | -1) => {
    const c = cards.find((x) => x.id === id)
    if (!c) return
    const next = ORDER[ORDER.indexOf(c.status) + dir]
    if (next) void move(id, next)
  }
  const add = async () => {
    const title = newTitle.trim()
    if (!title) return
    try {
      const m = await api<{ id: string }>(`/api/use-cases/${live.id}/moves`, { json: { title, by } })
      setNewTitle(''); setAdding(false); setOpen(m.id)
      setToast(`Card added to the Backlog. ${ASSISTANT_NAME} will shape it.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }

  const done = cards.filter((c) => c.status === 'done').length
  return (
    <div data-ui className="mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Board" eyebrow="The build stays connected to the why" headline={<>Make the next move<br /><em>traceable.</em></>}
        description={<>Cards move themselves as {ASSISTANT_NAME}, the builds and your answers settle them. You can also drag a card, use its arrows, or open it to edit it and attach files. Every change is logged and {ASSISTANT_NAME} hears it.</>}
        actions={<>
          <Button variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" /> Add a card</Button>
          <Button onClick={() => buildNow()} disabled={live.generateBusy}><Play className="size-4" /> {live.generateBusy ? 'Building…' : 'Stage pilot build'}</Button>
        </>}
      />
      <p className="-mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Network className="size-4" /> {cards.length} cards · {done} done · {ASSISTANT_NAME} is watching for a blocker, not micromanaging the work.</p>

      <div className="-mx-4 grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8" role="list" aria-label="Board columns">
        {COLUMNS.map((col) => {
          const items = cards.filter((c) => c.status === col.id)
          return (
            <section key={col.id} role="listitem" aria-label={col.label}
              className={cn('flex min-h-80 flex-col rounded-xl border bg-card/60 transition-colors', over === col.id ? 'border-primary bg-primary/5' : 'border-border')}
              onDragOver={(e) => { if (dragging || e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); setOver(col.id) } }}
              onDragLeave={() => setOver((o) => (o === col.id ? '' : o))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragging; setOver(''); setDragging(''); if (id) void move(id, col.id, 'dragged on the Board') }}>
              <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div className="grid gap-0.5"><h2 className="text-base font-semibold">{col.label}</h2><p className="text-xs text-muted-foreground">{col.description}</p></div>
                <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
              </header>
              <div className="grid grid-cols-1 content-start gap-2.5 p-2.5">
                {col.id === 'queued' && adding && (
                  <div className="grid gap-2 rounded-lg border border-primary/40 bg-background p-3">
                    <Input autoFocus aria-label="New card title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(false) }} placeholder="What should the product do?" />
                    <div className="flex gap-2"><Button size="sm" onClick={() => void add()} disabled={!newTitle.trim()}><Check className="size-4" /> Add</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
                  </div>
                )}
                {items.map((item) => {
                  const back = LABEL[ORDER[ORDER.indexOf(item.status) - 1]]
                  const next = LABEL[ORDER[ORDER.indexOf(item.status) + 1]]
                  return (
                    <article key={item.id} draggable tabIndex={0} role="button" aria-label={`Open ${item.title}`}
                      className={cn('grid min-w-0 cursor-grab grid-cols-1 gap-2 rounded-lg border border-border bg-background p-3 text-left transition-colors outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing', dragging === item.id && 'opacity-50')}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; setDragging(item.id) }}
                      onDragEnd={() => { setDragging(''); setOver('') }}
                      onClick={() => setOpen(item.id)} onDoubleClick={() => setOpen(item.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(item.id) } }}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={TONE[item.status]}>{item.signal || LABEL[item.status]}</StatusBadge>
                        {item.hidden && item.hidden !== 'story' && <span className="text-xs text-muted-foreground">{item.hidden}</span>}
                      </div>
                      <h3 className="text-base leading-snug font-semibold">{item.title}</h3>
                      {(item.capability || item.decision) && (
                        <div className="grid gap-1 text-sm text-muted-foreground">
                          {item.capability && <span className="flex gap-1.5"><Target className="mt-0.5 size-4 shrink-0" /> {item.capability}</span>}
                          {item.decision && <span className="flex gap-1.5"><Check className="mt-0.5 size-4 shrink-0" /> “{item.decision}”</span>}
                        </div>
                      )}
                      {item.moveReason && <p className="flex gap-1.5 text-xs text-muted-foreground"><History className="mt-0.5 size-3.5 shrink-0" /> {item.movedBy || 'Moved'}: {item.moveReason}</p>}
                      <div className="flex items-center gap-2 border-t border-border pt-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{ownerMark(item.owner)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.owner}>{item.owner}</span>
                        <Button type="button" size="icon" variant="ghost" className="size-8" disabled={item.status === 'queued'} aria-label="Move back" title={back ? `Back to ${back}` : ''} onClick={(e) => { e.stopPropagation(); step(item.id, -1) }}><ArrowLeft className="size-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="size-8" disabled={item.status === 'done'} aria-label="Move forward" title={next ? `On to ${next}` : ''} onClick={(e) => { e.stopPropagation(); step(item.id, 1) }}><ArrowRight className="size-4" /></Button>
                      </div>
                    </article>
                  )
                })}
                {items.length === 0 && !(col.id === 'queued' && adding) && <p className={cn('rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground', dragging ? 'border-primary/50' : 'border-border')}>{dragging ? 'Drop it here.' : 'Nothing here yet.'}</p>}
              </div>
            </section>
          )
        })}
      </div>

      {children}
      <div><Button variant="link" className="h-auto p-0" onClick={() => changeView('storymap')}>See how the stories connect <ArrowRight className="size-4" /></Button></div>
      <Sheet open={!!open} onOpenChange={(v) => { if (!v) setOpen('') }}>
        {open && <CardPanel key={open} live={live} id={open} by={by} onMove={(s) => void move(open, s, 'moved from the card')} setToast={setToast} />}
      </Sheet>
    </div>
  )
}

const TONE: Record<Status, 'ok' | 'warn' | 'off' | 'info' | 'suggest'> = { queued: 'off', ready: 'info', building: 'suggest', review: 'warn', done: 'ok' }

function CardPanel({ live, id, by, onMove, setToast }: { live: Live; id: string; by: string; onMove: (s: Status) => void; setToast: (v: string) => void }) {
  const [d, setD] = useState<CardDetail | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Partial<CardDetail['move']>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // A double-click opens the card on its first click; its second click must not land on the backdrop and close it.
  const openedAt = useRef(Date.now())
  const load = useCallback(async () => {
    try { setD(await api<CardDetail>(`/api/use-cases/${live.id}/moves/${id}`, { cache: 'no-store' })) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [live.id, id])
  useEffect(() => { void load() }, [load, live.updatedAt])

  const m = d?.move
  const val = <K extends keyof CardDetail['move']>(k: K) => (draft[k] ?? m?.[k] ?? '') as CardDetail['move'][K]
  const dirty = m ? (Object.keys(draft) as (keyof CardDetail['move'])[]).some((k) => draft[k] !== m[k]) : false
  const save = async () => {
    if (!m || !dirty) return
    if (!String(val('title')).trim()) { setToast('A card needs a title.'); return }
    setSaving(true)
    try {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { ...draft, by } })
      setDraft({}); await load()
      setToast(`Saved. ${ASSISTANT_NAME} will carry the change into the spec.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }
  const attach = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('by', by)
    setUploading(true)
    try {
      const res = await fetch(`/api/use-cases/${live.id}/moves/${id}/files`, { method: 'POST', body: form })
      const body = (await res.json().catch(() => ({}))) as { error?: string; skipped?: string[] }
      if (!res.ok) throw new Error(body.error || 'The upload did not go through')
      await load()
      setToast(`${files.length === 1 ? files[0].name : `${files.length} files`} attached. ${ASSISTANT_NAME} is reading ${files.length === 1 ? 'it' : 'them'}.${body.skipped?.length ? ` Too big to attach: ${body.skipped.join(', ')}.` : ''}`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }

  const label = (t: string) => <span className="text-xs font-medium text-muted-foreground">{t}</span>
  return (
    <SheetContent data-ui side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
      onInteractOutside={(e) => { if (Date.now() - openedAt.current < 450) e.preventDefault() }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void attach(e.dataTransfer.files) }}>
      <SheetHeader className="border-b border-border px-5 py-4 pr-12">
        <SheetTitle className="text-xs font-medium text-muted-foreground">{m ? `${LABEL[m.status] ?? m.status}${m.hidden ? ` · ${m.hidden}` : ''}` : 'Card'}</SheetTitle>
        <SheetDescription className="sr-only">Read and edit everything on this card, attach files and see what happened to it.</SheetDescription>
      </SheetHeader>
      {!m ? <p className="px-5 py-4 text-sm text-muted-foreground">{error || 'Opening the card…'}</p> : <div className="grid grid-cols-1 gap-5 px-5 py-4">
        <Textarea rows={2} value={val('title')} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" className="min-h-0 resize-none border-0 bg-transparent px-0 !text-xl font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent" />
        <div className="grid gap-1.5">
          {label('Where it is')}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Move the card">{COLUMNS.map((c) => <Button key={c.id} type="button" size="sm" variant={m.status === c.id ? 'default' : 'outline'} aria-pressed={m.status === c.id} onClick={() => { if (m.status !== c.id) { onMove(c.id); setD({ ...d!, move: { ...m, status: c.id } }) } }}>{c.label}</Button>)}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">{label('Area')}<Input value={val('capability')} onChange={(e) => setDraft({ ...draft, capability: e.target.value })} placeholder="Which capability" /></label>
          <label className="grid gap-1.5">{label('Owner')}<Input value={val('owner')} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></label>
          <div className="grid gap-1.5">{label('Kind')}
            <Select value={val('hidden') || 'story'} onValueChange={(v) => setDraft({ ...draft, hidden: v })}>
              <SelectTrigger aria-label="Kind" className="w-full capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([...KINDS, m.hidden || 'story'])].map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="grid gap-1.5">{label('Tag')}<Input value={val('signal')} onChange={(e) => setDraft({ ...draft, signal: e.target.value })} placeholder="e.g. THIN SLICE" /></label>
        </div>
        <label className="grid gap-1.5">{label('Decision it traces to')}<Textarea rows={2} value={val('decision')} onChange={(e) => setDraft({ ...draft, decision: e.target.value })} placeholder="The decision or promise this card delivers" /></label>
        <label className="grid gap-1.5">{label('Details and acceptance criteria')}<Textarea rows={8} value={val('prompt')} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="What it does, for whom, and how we'll know it works" className="min-h-40 text-base md:text-base" /></label>
        <div className="flex gap-2"><Button type="button" disabled={!dirty || saving} onClick={() => void save()}><Check className="size-4" /> {saving ? 'Saving…' : 'Save changes'}</Button>{dirty && <Button type="button" variant="ghost" onClick={() => setDraft({})}>Undo edits</Button>}</div>

        <section className="grid gap-2 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Paperclip className="size-4" /> Files · {d!.files.length}</h3>
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload className="size-4" /> {uploading ? 'Attaching…' : 'Attach files'}</Button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files)} />
          </div>
          {d!.files.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">Drop screens, specs, data or recordings here. {ASSISTANT_NAME} reads them as evidence for this card.</p> :
            <ul className="grid gap-1.5">{d!.files.map((f) => (
              <li key={f.id} className="grid gap-1 rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" /><a className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" href={`/api/use-cases/${live.id}/moves/${id}/files/${f.id}`} target="_blank" rel="noreferrer">{f.fileName}</a><span className="shrink-0 text-xs text-muted-foreground">{size(f.sizeBytes)} · {ago(f.createdAt)}</span>
                  <Button asChild size="icon" variant="ghost" className="size-8"><a href={`/api/use-cases/${live.id}/moves/${id}/files/${f.id}`} download={f.fileName} aria-label={`Download ${f.fileName}`}><Download className="size-4" /></a></Button></div>
                {f.summary && <p className="text-sm text-muted-foreground">{f.summary}</p>}
              </li>))}</ul>}
        </section>

        {(m.components.length > 0 || m.routes.length > 0 || m.trackerUrl) && <section className="grid gap-2 border-t border-border pt-4"><h3 className="text-sm font-semibold">Build</h3>
          {m.components.length > 0 && <div className="flex flex-wrap gap-1.5">{m.components.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}</div>}
          {m.routes.length > 0 && <div className="flex flex-wrap gap-1.5">{m.routes.map((r) => <Badge key={r} variant="outline" className="font-mono">{r}</Badge>)}</div>}
          {m.trackerUrl && <Button asChild variant="link" className="h-auto justify-self-start p-0"><a href={m.trackerUrl} target="_blank" rel="noreferrer">Open in the tracker <ArrowRight className="size-4" /></a></Button>}
        </section>}

        <section className="grid gap-2 border-t border-border pt-4"><h3 className="flex items-center gap-1.5 text-sm font-semibold"><History className="size-4" /> What happened · {d!.history.length}</h3>
          {d!.history.length === 0 ? <p className="text-sm text-muted-foreground">Nothing logged yet.</p> :
            <ol className="grid gap-2">{d!.history.map((h) => <li key={h.id} className="flex gap-3 text-sm"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /><span className="min-w-0 flex-1">{plain(h.summary, live)}</span><span className="shrink-0 text-xs text-muted-foreground">{ago(h.createdAt)}</span></li>)}</ol>}
        </section>
      </div>}
    </SheetContent>
  )
}
