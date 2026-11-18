'use client'
// Drill-downs into the real records behind a screen: a stored document (its readable text, the original,
// a download) and an evidence card's trace (the record itself, the document it came from, and what it
// is connected to in the Product Truth Graph). Everything shown is read from the product's own records;
// when something isn't there, the panel says so instead of inventing it.
import { useEffect, useState } from 'react'
import { ArrowRight, Download, ExternalLink, FileText, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api, ago, type Live } from './live'
import { StudioMarkdown } from './extras'
import { useTruth, STATEMENT_LABEL } from './truth'
import type { StudioView } from './flow'

export type DocText = {
  id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; origin: string; summary: string; description: string
  kind: string; moveId: string; exists: boolean; html: boolean; text: string | null; truncated: boolean; path: string
}

export const docUrl = (live: { id: string }, docId: string, as = '') => `/api/use-cases/${live.id}/documents/${docId}${as ? `?as=${as}` : ''}`
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)

function Panel({ label, title, meta, onClose, wide, children }: { label: string; title?: React.ReactNode; meta?: React.ReactNode; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <Sheet open onOpenChange={(v) => { if (!v) onClose() }}>
    <SheetContent data-ui side="right" className={cn('w-full gap-0 overflow-y-auto p-0', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
      <SheetHeader className="border-b border-border px-5 py-4 pr-14">
        <SheetDescription className="text-xs font-medium text-muted-foreground">{label}</SheetDescription>
        <SheetTitle className="text-xl font-semibold leading-snug tracking-tight text-balance">{title ?? label}</SheetTitle>
        {meta}
      </SheetHeader>
      <div className="grid grid-cols-1 gap-5 px-5 py-4">{children}</div>
    </SheetContent>
  </Sheet>
}

function Part({ label, icon, children }: { label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="grid gap-2">
    <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{icon}{label}</h3>
    {children}
  </section>
}
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>
const LinkChip = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) =>
  <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 max-w-full justify-start whitespace-normal py-1.5 text-left" onClick={onClick}>{children}</Button>

/** One stored document, opened: its readable text, the original and a download. */
export function DocumentPanel({ live, docId, onClose }: { live: Live; docId: string; onClose: () => void }) {
  const [d, setD] = useState<DocText | null>(null)
  const [error, setError] = useState('')
  const liveId = live.id
  useEffect(() => {
    let alive = true
    setD(null); setError('')
    void api<DocText>(`/api/use-cases/${liveId}/documents/${docId}?as=text`, { cache: 'no-store' }).then((r) => { if (alive) setD(r) }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [liveId, docId])
  const raw = docUrl(live, docId)
  const image = d?.mimeType.startsWith('image/')
  const pdf = d?.mimeType === 'application/pdf'
  const md = Boolean(d && (/\.(md|markdown)$/i.test(d.path) || !/\.(txt|csv|json|ya?ml|xml|log)$/i.test(d.path)))
  const meta = d ? <>
    <p className="text-xs text-muted-foreground">{[d.origin === 'upload' ? 'Uploaded' : d.moveId ? 'Attached to a card' : 'Written in the Studio', ago(d.createdAt), d.sizeBytes ? size(d.sizeBytes) : '', d.kind && d.kind !== 'other' ? d.kind : ''].filter(Boolean).join(' · ')}</p>
    {d.path && <p className="font-mono text-xs break-all text-muted-foreground">{d.path}</p>}
  </> : null
  return <Panel label="Document" title={d?.fileName ?? 'Document'} meta={meta} onClose={onClose} wide>
    {!d ? <Muted>{error || 'Opening the document…'}</Muted> : <>
      <div className="flex flex-wrap gap-2">
        {d.exists ? <><Button asChild size="sm"><a href={raw} target="_blank" rel="noreferrer"><ExternalLink /> Open the original</a></Button><Button asChild size="sm" variant="outline"><a href={docUrl(live, docId, 'download')} download={d.fileName}><Download /> Download</a></Button></>
          : <Muted>The original file is no longer in the workspace; only its record remains.</Muted>}
      </div>
      {(d.summary || d.description) && !/^No summary yet/.test(d.summary) && <Part label="What the document agent read">{d.description && <p className="text-sm leading-relaxed">{d.description}</p>}{d.summary && d.summary.trim() !== d.description.trim() && <p className="text-sm leading-relaxed">{d.summary}</p>}</Part>}
      <Part label="Contents" icon={<FileText className="size-3.5" />}>
        {image && d.exists ? <img className="max-w-full rounded-md border border-border" src={raw} alt={d.fileName} />
          : pdf && d.exists ? <iframe className="h-[70vh] w-full rounded-md border border-border bg-white" src={raw} title={d.fileName} />
          : d.html && d.exists ? <iframe className="h-[70vh] w-full rounded-md border border-border bg-white" src={raw} title={d.fileName} sandbox="" />
          : d.text != null ? <div className="rounded-md border border-border bg-card p-4 text-sm leading-relaxed">{md ? <StudioMarkdown text={d.text} /> : <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap">{d.text}</pre>}{d.truncated && <p className="mt-3 text-sm text-muted-foreground">This is the first part of a long file. Open the original for all of it.</p>}</div>
          : d.exists ? <Muted>This file type can’t be shown as text here. Open the original or download it.</Muted>
          : <Muted>Only the record remains: the file was removed from the workspace, and no readable copy was kept.</Muted>}
      </Part>
    </>}
  </Panel>
}

type Ev = Live['evidence'][number]

/** Spec sections and capabilities an evidence card's “supports” line names, matched on their titles. */
function supported(live: Live, trace: string) {
  const parts = trace.split(/[;,\n]| and /i).map((p) => p.trim().toLowerCase()).filter((p) => p.length > 2)
  const spec = live.spec.filter((s) => parts.some((p) => s.title.toLowerCase().includes(p) || p.includes(s.title.toLowerCase()) || p === s.ref.toLowerCase()))
  const caps = live.capabilities.filter((c) => parts.some((p) => c.label.toLowerCase().includes(p) || p.includes(c.label.toLowerCase())))
  return { spec, caps }
}

/** An evidence card's trace: the record, the document it came from, and what it is connected to. */
export function EvidenceTracePanel({ live, ev, onClose, openDoc, changeView }: { live: Live; ev: Ev; onClose: () => void; openDoc: (id: string) => void; changeView: (view: StudioView, node?: string) => void }) {
  const truth = useTruth(live)
  const node = `evidence:${ev.id}`
  const docNode = ev.documentId ? `doc:${ev.documentId}` : ''
  const doc = ev.documentId ? live.documents.find((d) => d.id === ev.documentId) : undefined
  const edges = (truth?.edges ?? []).filter((e) => e.from === node || e.to === node || (docNode && (e.from === docNode || e.to === docNode)))
  const others = [...new Map(edges.map((e) => {
    // The record on the far side: for an edge touching the evidence itself, the other end; for one touching only its document, the document's other end.
    const other = e.from === node ? e.to : e.to === node ? e.from : e.from === docNode ? e.to : e.from
    return [other, { id: other, relation: e.relation, label: e.label }] as const
  })).values()].filter((o) => o.id !== node)
  const nodeOf = (id: string) => truth?.nodes.find((n) => n.id === id)
  const { spec, caps } = supported(live, ev.trace)
  const go = (view: StudioView, n = '') => { onClose(); changeView(view, n) }
  return <Panel label="Evidence trace" title={ev.insight} meta={<p className="text-xs text-muted-foreground">{ev.type} · {ev.confidence} confidence · added {ago(ev.createdAt)}</p>} onClose={onClose}>
    <Part label="Source">
      {doc && <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <Button type="button" variant="link" className="h-9 min-w-0 flex-1 justify-start truncate px-0" onClick={() => openDoc(doc.id)}>{doc.fileName}</Button>
        <span className="text-xs text-muted-foreground">{ago(doc.createdAt)}{doc.exists === false ? ' · record only' : ''}</span>
        {doc.exists !== false && <Button asChild size="icon-sm" variant="ghost"><a href={docUrl(live, doc.id, 'download')} download={doc.fileName} aria-label={`Download ${doc.fileName}`}><Download /></a></Button>}
      </div>}
      <p className="text-sm leading-relaxed">{ev.source}</p>
      {!doc && <Muted>{ev.type === 'conversation' ? 'This came from the conversation, not a file.' : 'No stored file matches this source; it was recorded from research or the conversation.'}</Muted>}
    </Part>
    <Part label="What it supports">
      {ev.trace ? <p className="text-sm leading-relaxed">{ev.trace}</p> : <Muted>Nothing named yet.</Muted>}
      {(spec.length > 0 || caps.length > 0) && <div className="flex flex-wrap gap-2">
        {spec.map((s) => <LinkChip key={s.id} onClick={() => go(s.tab === 'trd' ? 'trd' : 'spec', s.key)}>{s.ref} · {s.title} <ArrowRight /></LinkChip>)}
        {caps.map((c) => <LinkChip key={c.id} onClick={() => go('readiness')}>{c.label} <ArrowRight /></LinkChip>)}
      </div>}
    </Part>
    <Part label={<>Connected in the truth graph · {truth ? others.length : '…'}</>} icon={<Network className="size-3.5" />}>
      {!truth ? <Muted>Reading the graph…</Muted> : others.length === 0 ? <Muted>No other record is linked to this evidence yet.</Muted>
        : <div className="flex flex-wrap gap-2">{others.slice(0, 20).map((o) => { const n = nodeOf(o.id); return <LinkChip key={o.id} onClick={() => go('truth', `graph:${o.id}`)}><em className="font-serif text-primary not-italic">{o.relation}</em> {n?.title ?? o.id}{n ? <span className="text-xs text-muted-foreground"> · {STATEMENT_LABEL[n.statement]}</span> : null} <ArrowRight /></LinkChip> })}</div>}
      <div><Button type="button" variant="ghost" size="sm" onClick={() => go('truth', `graph:${node}`)}>Open it in the truth graph <ArrowRight /></Button></div>
    </Part>
  </Panel>
}
