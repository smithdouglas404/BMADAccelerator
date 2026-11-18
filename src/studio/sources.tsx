'use client'
// Drill-downs into the real records behind a screen: a stored document (its readable text, the original,
// a download) and an evidence card's trace (the record itself, the document it came from, and what it
// is connected to in the Product Truth Graph). Everything shown is read from the product's own records;
// when something isn't there, the panel says so instead of inventing it.
import { useEffect, useState } from 'react'
import { ArrowRight, Download, ExternalLink, FileText, Network, X } from 'lucide-react'
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

function Panel({ label, onClose, wide, children }: { label: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return <div className="studio-card-overlay" onClick={onClose}>
    <aside className={`studio-card-panel${wide ? ' studio-doc-panel' : ''}`} onClick={(e) => e.stopPropagation()} aria-label={label}>
      <div className="studio-card-head"><p className="eyebrow">{label}</p><button className="icon-button subtle" type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      {children}
    </aside>
  </div>
}

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
  return <Panel label="Document" onClose={onClose} wide>
    {!d ? <p className="studio-muted">{error || 'Opening the document…'}</p> : <>
      <h2 className="studio-doc-title">{d.fileName}</h2>
      <p className="studio-doc-meta">{[d.origin === 'upload' ? 'Uploaded' : d.moveId ? 'Attached to a card' : 'Written in the Studio', ago(d.createdAt), d.sizeBytes ? size(d.sizeBytes) : '', d.kind && d.kind !== 'other' ? d.kind : ''].filter(Boolean).join(' · ')}</p>
      {d.path && <p className="studio-doc-path">{d.path}</p>}
      <div className="studio-doc-actions">
        {d.exists ? <><a className="button button-primary button-small" href={raw} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open the original</a><a className="button button-quiet button-small" href={docUrl(live, docId, 'download')} download={d.fileName}><Download size={13} /> Download</a></>
          : <span className="studio-muted">The original file is no longer in the workspace; only its record remains.</span>}
      </div>
      {(d.summary || d.description) && !/^No summary yet/.test(d.summary) && <section className="studio-card-section"><span className="eyebrow">What the document agent read</span>{d.description && <p className="studio-doc-summary">{d.description}</p>}{d.summary && <p className="studio-doc-summary">{d.summary}</p>}</section>}
      <section className="studio-card-section"><span className="eyebrow"><FileText size={11} /> Contents</span>
        {image && d.exists ? <img className="studio-doc-image" src={raw} alt={d.fileName} />
          : pdf && d.exists ? <iframe className="studio-doc-frame" src={raw} title={d.fileName} />
          : d.html && d.exists ? <iframe className="studio-doc-frame" src={raw} title={d.fileName} sandbox="" />
          : d.text != null ? <div className="studio-doc-body">{md ? <StudioMarkdown text={d.text} /> : <pre>{d.text}</pre>}{d.truncated && <p className="studio-muted">This is the first part of a long file. Open the original for all of it.</p>}</div>
          : <p className="studio-muted">This file type can’t be shown as text here. Open the original or download it.</p>}
      </section>
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
    const other = e.from === node || e.from === docNode ? e.to : e.from
    return [other, { id: other, relation: e.relation, label: e.label }] as const
  })).values()].filter((o) => o.id !== node && o.id !== docNode)
  const nodeOf = (id: string) => truth?.nodes.find((n) => n.id === id)
  const { spec, caps } = supported(live, ev.trace)
  const go = (view: StudioView, n = '') => { onClose(); changeView(view, n) }
  return <Panel label="Evidence trace" onClose={onClose}>
    <p className="eyebrow">{ev.type} · {ev.confidence} confidence · added {ago(ev.createdAt)}</p>
    <h2 className="studio-doc-title">{ev.insight}</h2>
    <section className="studio-card-section"><span className="eyebrow">Source</span>
      {doc ? <ul className="studio-card-files"><li><FileText size={13} /><button type="button" className="studio-link-button" onClick={() => openDoc(doc.id)}>{doc.fileName}</button><small>{ago(doc.createdAt)}</small><a className="studio-card-dl" href={docUrl(live, doc.id, 'download')} download={doc.fileName} aria-label={`Download ${doc.fileName}`}><Download size={13} /></a></li></ul> : null}
      <p className="studio-doc-summary">{ev.source}</p>
      {!doc && <p className="studio-muted">{ev.type === 'conversation' ? 'This came from the conversation, not a file.' : 'No stored file matches this source; it was recorded from research or the conversation.'}</p>}
    </section>
    <section className="studio-card-section"><span className="eyebrow">What it supports</span>
      {ev.trace ? <p className="studio-doc-summary">{ev.trace}</p> : <p className="studio-muted">Nothing named yet.</p>}
      {(spec.length > 0 || caps.length > 0) && <div className="studio-trace-links">
        {spec.map((s) => <button type="button" key={s.id} onClick={() => go(s.tab === 'trd' ? 'trd' : 'spec', s.key)}>{s.ref} · {s.title} <ArrowRight size={11} /></button>)}
        {caps.map((c) => <button type="button" key={c.id} onClick={() => go('readiness')}>{c.label} <ArrowRight size={11} /></button>)}
      </div>}
    </section>
    <section className="studio-card-section"><span className="eyebrow"><Network size={11} /> Connected in the truth graph · {truth ? others.length : '…'}</span>
      {!truth ? <p className="studio-muted">Reading the graph…</p> : others.length === 0 ? <p className="studio-muted">No other record is linked to this evidence yet.</p>
        : <div className="studio-trace-links">{others.slice(0, 20).map((o) => { const n = nodeOf(o.id); return <button type="button" key={o.id} onClick={() => go('truth', `graph:${o.id}`)}><em>{o.relation}</em> {n?.title ?? o.id}{n ? <small> · {STATEMENT_LABEL[n.statement]}</small> : null} <ArrowRight size={11} /></button> })}</div>}
      <button className="text-button" type="button" onClick={() => go('truth', `graph:${node}`)}>Open it in the truth graph <ArrowRight size={12} /></button>
    </section>
  </Panel>
}
