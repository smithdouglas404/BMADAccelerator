'use client'

// The Board (Doug, Nov 16): the team's Kanban made fully usable. Cards still move themselves (Socra, the
// builds and people's answers move them), but a person can also drag a card or use its arrows, open a
// card to see and edit everything on it, add a card, and attach files. Every change is logged and Socra
// hears it. On shadcn/ui + Animate UI; the card opens in a Sheet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, FileText, History, MessageCircleQuestion, Network, Paperclip, Play, Plus, Target, Upload, X } from 'lucide-react'
import { hasDetail, needsTriage } from '@/lib/studio/journey'
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
import { DocumentPanel } from './sources'

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

type Props = { live: Live; me: Me; buildNow: (opts?: { force?: boolean }) => void; changeView: (v: StudioView) => void; setToast: (v: string) => void; children?: React.ReactNode }

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
  // What a move asks for next (Ready asks for detail, Being made real checks Generate has something to build).
  const [guide, setGuide] = useState<{ id: string; status: Status } | null>(null)
  const [triaging, setTriaging] = useState('')
  useEffect(() => { setLocal({}) }, [live.updatedAt])
  // New backlog items: what someone said to Socra, a mark-up, or Socra's own suggestion, until a person deals with it.
  const fresh = live.backlog.filter((b) => needsTriage(b) || (b.triage === 'working' && b.state !== 'built' && b.kind !== 'distraction'))
  const triage = async (itemId: string, to: 'working' | 'accepted' | 'rejected') => {
    const item = live.backlog.find((b) => b.id === itemId)
    setTriaging(itemId)
    try {
      await api(`/api/use-cases/${live.id}/backlog/${itemId}`, { method: 'PATCH', json: { triage: to, by } })
      if (to === 'working') { setToast(`${ASSISTANT_NAME} is opening up “${item?.title ?? 'it'}”. Answer its questions here.`); changeView('conversation') }
      else setToast(to === 'accepted' ? `Accepted. “${item?.title ?? 'It'}” is on the Board in Backlog, and ${ASSISTANT_NAME} will shape it. Move it to Ready to shape when you want to add detail.` : `Rejected. It stays in the history and out of the product.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setTriaging('') }
  }

  const cards = live.moves.map((m) => ({ ...m, status: (local[m.id] ?? (ORDER.includes(m.status as Status) ? m.status : 'queued')) as Status }))

  const move = async (id: string, status: Status, why = '') => {
    const card = cards.find((c) => c.id === id)
    if (!card || card.status === status) return
    setLocal((l) => ({ ...l, [id]: status }))
    try {
      await api(`/api/use-cases/${live.id}/moves/${id}`, { method: 'PATCH', json: { status, by, why } })
      const forward = ORDER.indexOf(status) > ORDER.indexOf(card.status)
      if (forward && (status === 'ready' || status === 'building' || status === 'review')) { setGuide({ id, status }); setOpen(id) }
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
                <div className="grid gap-0.5"><h2 className={cn('text-base font-semibold', col.id === 'queued' && fresh.length > 0 && 'text-needs')}>{col.label}</h2><p className="text-xs text-muted-foreground">{col.description}</p></div>
                <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
              </header>
              <div className="grid grid-cols-1 content-start gap-2.5 p-2.5">
                {col.id === 'queued' && fresh.length > 0 && <p className="flex items-center gap-2 px-1 text-xs font-semibold text-needs"><span className="size-2 rounded-full bg-needs" /> {fresh.filter((b) => !b.triage).length} new · needs you</p>}
                {col.id === 'queued' && fresh.map((b) => {
                  const from = b.state === 'suggested' || b.state === 'probing' ? `${ASSISTANT_NAME} suggests` : b.annotationId || /mark/i.test(b.source) ? 'From a mark-up' : /Socra|Muse/i.test(b.source) ? `From ${ASSISTANT_NAME}` : 'You said'
                  return (
                    <article key={b.id} aria-label={`New: ${b.title}`} className={cn('grid min-w-0 grid-cols-1 gap-2 rounded-lg border bg-background p-3 animate-in fade-in slide-in-from-top-1 duration-300', b.triage ? 'border-border' : 'border-destructive/60 shadow-[inset_3px_0_0_var(--destructive)]')}>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        {b.triage === 'working'
                          ? <Badge variant="outline" className="gap-1 text-xs"><MessageCircleQuestion className="size-3.5" /> Working on it</Badge>
                          : <Badge variant="outline" className="gap-1.5 border-destructive/40 text-xs text-destructive"><span className="size-1.5 rounded-full bg-destructive" /> New · {from}</Badge>}
                        <span className="text-xs text-muted-foreground">{ago(b.createdAt)}</span>
                      </div>
                      <h3 className="text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{b.title}</h3>
                      {b.note && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{b.note.slice(0, 160)}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {b.triage !== 'working' && <Button type="button" size="sm" variant="outline" disabled={triaging === b.id} onClick={() => void triage(b.id, 'working')} title={`${ASSISTANT_NAME} asks the questions that make it a clear requirement`}><MessageCircleQuestion className="size-4" /> Work on it</Button>}
                        <Button type="button" size="sm" disabled={triaging === b.id} onClick={() => void triage(b.id, 'accepted')} title="Put it on the Board as a card in Backlog"><Check className="size-4" /> Accept</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={triaging === b.id} onClick={() => void triage(b.id, 'rejected')} title="Set it aside; it stays in the history"><X className="size-4" /> Reject</Button>
                      </div>
                    </article>
                  )
                })}
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
                        <Button type="button" size="icon" variant="ghost" className="size-9" disabled={item.status === 'queued'} aria-label="Move back" title={back ? `Back to ${back}` : ''} onClick={(e) => { e.stopPropagation(); step(item.id, -1) }}><ArrowLeft className="size-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="size-9" disabled={item.status === 'done'} aria-label="Move forward" title={next ? `On to ${next}` : ''} onClick={(e) => { e.stopPropagation(); step(item.id, 1) }}><ArrowRight className="size-4" /></Button>
                      </div>
                    </article>
                  )
                })}
                {items.length === 0 && !(col.id === 'queued' && (adding || fresh.length > 0)) && <p className={cn('rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground', dragging ? 'border-primary/50' : 'border-border')}>{dragging ? 'Drop it here.' : <>Nothing here yet. That’s okay: the shape is still moving.</>}</p>}
              </div>
            </section>
          )
        })}
      </div>

      {children}
      <div><Button variant="link" className="h-auto p-0" onClick={() => changeView('storymap')}>See how the stories connect <ArrowRight className="size-4" /></Button></div>
      <Sheet open={!!open} onOpenChange={(v) => { if (!v) { setOpen(''); setGuide(null) } }}>
        {open && <CardPanel key={open} live={live} id={open} by={by} guide={guide?.id === open ? guide.status : undefined} onClose={() => { setOpen(''); setGuide(null) }} onMove={(s) => void move(open, s, 'moved from the card')} setToast={setToast} buildNow={buildNow} changeView={changeView} />}
      </Sheet>
    </div>
  )
}

const TONE: Record<Status, 'ok' | 'warn' | 'off' | 'info' | 'suggest'> = { queued: 'off', ready: 'info', building: 'suggest', review: 'warn', done: 'ok' }

function CardPanel({ live, id, by, guide, onClose, onMove, setToast, buildNow, changeView }: { live: Live; id: string; by: string; guide?: Status; onClose: () => void; onMove: (s: Status) => void; setToast: (v: string) => void; buildNow: (opts?: { force?: boolean }) => void; changeView: (v: StudioView) => void }) {
  const details = useRef<HTMLTextAreaElement>(null)
  const [docOpen, setDocOpen] = useState('')
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
      {docOpen && <DocumentPanel live={live} docId={docOpen} onClose={() => setDocOpen('')} />}
      {!m ? <p className="px-5 py-4 text-sm text-muted-foreground">{error || 'Opening the card…'}</p> : <div className="grid grid-cols-1 gap-5 px-5 py-4">
        <Textarea rows={2} value={val('title')} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" className="min-h-0 resize-none border-0 bg-transparent px-0 !text-xl font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent" />
        {guide && <MoveGuide status={guide} detailed={hasDetail(String(val('prompt')))} busy={live.generateBusy} hasApp={live.preview.hasApp}
          onDetail={() => { details.current?.focus(); details.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }}
          onSocra={() => { onClose(); changeView('conversation') }}
          onGenerate={() => { onClose(); buildNow({ force: true }) }}
          onTry={() => { onClose(); changeView('review') }} />}
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
        <label className="grid gap-1.5">{label('Details and acceptance criteria')}<Textarea ref={details} rows={8} value={val('prompt')} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="What it does, for whom, and how we'll know it works" className="min-h-40" /></label>
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
                <div className="flex items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" /><button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium text-primary hover:underline" onClick={() => setDocOpen(f.id)} title="Open the file">{f.fileName}</button><span className="shrink-0 text-xs text-muted-foreground">{size(f.sizeBytes)} · {ago(f.createdAt)}</span>
                  <Button asChild size="icon" variant="ghost" className="size-9"><a href={`/api/use-cases/${live.id}/moves/${id}/files/${f.id}`} download={f.fileName} aria-label={`Download ${f.fileName}`}><Download className="size-4" /></a></Button></div>
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

/** What moving a card asks for: Ready wants detail, Being made real wants something to build, Review wants a try. */
function MoveGuide({ status, detailed, busy, hasApp, onDetail, onSocra, onGenerate, onTry }: { status: Status; detailed: boolean; busy: boolean; hasApp: boolean; onDetail: () => void; onSocra: () => void; onGenerate: () => void; onTry: () => void }) {
  const box = (warn: boolean, title: React.ReactNode, body: React.ReactNode, actions: React.ReactNode) => (
    <div className={cn('grid gap-2 rounded-lg border p-4 animate-in fade-in slide-in-from-top-1 duration-300', warn ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-accent/60')}>
      <p className="flex items-center gap-2 text-sm font-semibold">{title}</p>
      <div className="text-sm text-muted-foreground">{body}</div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
  if (status === 'ready') return box(false, <><MessageCircleQuestion className="size-4 text-primary" /> {ASSISTANT_NAME}: let’s get some detail before this is built.</>,
    <><ol className="mb-2 grid list-decimal gap-1 pl-5 text-foreground"><li>Who uses this, and at what moment?</li><li>What does “done” look like? What can they do afterwards that they couldn’t before?</li><li>Which rules, limits or edge cases must it handle?</li></ol>Write it below, or answer {ASSISTANT_NAME} in the conversation: it is asking the same now and writes your answers onto this card.</>,
    <><Button type="button" size="sm" onClick={onDetail}>Add detail here</Button><Button type="button" size="sm" variant="outline" onClick={onSocra}>Answer {ASSISTANT_NAME} <ArrowRight className="size-4" /></Button></>)
  if (status === 'building') return detailed
    ? box(false, <><Play className="size-4 text-primary" /> Ready to build.</>, <>This card has enough detail. Generate the prototype to have Claude Code build it{hasApp ? ' into the next version' : ''}.</>,
      <Button type="button" size="sm" disabled={busy} onClick={onGenerate}><Play className="size-4" /> {busy ? 'A build is running…' : 'Generate the prototype'}</Button>)
    : box(true, <>This card has almost no detail yet.</>, <>If you generate now, Claude Code has nothing clear to build for it. Add what it does and how you’ll know it works, or let {ASSISTANT_NAME} ask you.</>,
      <><Button type="button" size="sm" onClick={onDetail}>Add detail here</Button><Button type="button" size="sm" variant="outline" onClick={onSocra}>Let {ASSISTANT_NAME} ask me</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onGenerate}>Generate anyway</Button></>)
  if (status === 'review') return box(false, <>Your turn to review.</>, <>Try it in the prototype. Say yes if it works, or mark what is wrong: each mark comes back as a new backlog item.</>,
    <Button type="button" size="sm" onClick={onTry}>Try & mark up <ArrowRight className="size-4" /></Button>)
  return null
}
