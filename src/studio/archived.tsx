'use client'
// Archiving a use case with its closeout, and the Archived screen (Doug, Nov 22).
import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, X } from 'lucide-react'
import { api, ago } from './live'
import { useMe } from './flow'
import { StudioTop } from './pages'

export type Closeout = { by: string; outcome: string; decision: string; comments: string; cost: string; benefits: string }

/** The three closeout questions, asked when a use case is archived. */
export function ArchiveDialog({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: () => void }) {
  const [me] = useMe()
  const [outcome, setOutcome] = useState<'' | 'approved' | 'rejected'>('')
  const [comments, setComments] = useState('')
  const [cost, setCost] = useState('')
  const [benefits, setBenefits] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await api(`/api/use-cases/${id}/archive`, { json: { action: 'archive', outcome, comments, cost, benefits, by: me.name || me.role } })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div className="studio-archive-backdrop" role="dialog" aria-modal="true" aria-label={`Archive ${name}`}>
      <div className="studio-archive-dialog">
        <div className="studio-archive-head"><div><p className="eyebrow">Archive use case</p><h3>{name}</h3></div><button type="button" className="icon-button subtle" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
        <p className="studio-muted">It leaves the list and nothing is lost. Before it goes, capture how it ended. You can find it again under Archived and restore it.</p>
        <fieldset className="studio-archive-field">
          <legend>1. Was it approved for production?</legend>
          <label><input type="radio" name="outcome" checked={outcome === 'approved'} onChange={() => setOutcome('approved')} /> Approved for production</label>
          <label><input type="radio" name="outcome" checked={outcome === 'rejected'} onChange={() => setOutcome('rejected')} /> Rejected</label>
        </fieldset>
        <label className="studio-archive-field">{outcome === 'rejected' ? 'Comments (needed for a rejection)' : 'Comments'}<textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder={outcome === 'rejected' ? 'Why was it rejected?' : 'Anything the approvers said'} /></label>
        <label className="studio-archive-field">2. Estimated cost to implement<input value={cost} maxLength={200} onChange={(e) => setCost(e.target.value)} placeholder="e.g. $150,000 over six months" /></label>
        <label className="studio-archive-field">3. Benefits, and the metrics that must be tracked and delivered<textarea rows={5} value={benefits} onChange={(e) => setBenefits(e.target.value)} placeholder="What the use case was for, and what has to be measured and delivered" /></label>
        {error && <p className="studio-archive-error" role="alert">{error}</p>}
        <div className="studio-archive-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={busy || !outcome} onClick={() => void submit()}><Archive size={14} /> {busy ? 'Archiving…' : 'Archive'}</button></div>
      </div>
    </div>
  )
}

type Row = { id: string; name: string; statement: string; customer: string; businessArea: string; archivedAt: string; createdBy: string; closeout: Closeout | null }

export function ArchivedPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [me] = useMe()
  const load = () => void api<Row[]>('/api/use-cases?archived=only', { cache: 'no-store' }).then(setRows).catch((e: Error) => setError(e.message))
  useEffect(load, [])
  const restore = async (id: string) => {
    try { await api(`/api/use-cases/${id}/archive`, { json: { action: 'restore', by: me.name || me.role } }); load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="studio-page">
      <StudioTop active="archived" />
      <div className="page-wrap">
        <div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Archived use cases</p><h1>What happened to<br /><em>past use cases.</em></h1><p>Every archived use case keeps everything, plus how it ended: approved or rejected, what it would cost, and what it had to deliver.</p></div><div className="intro-actions"><span>{rows ? `${rows.length} archived` : ''}</span></div></div>
        {error && <p className="studio-archive-error" role="alert">{error}</p>}
        <div className="studio-archived-list">
          {rows?.length === 0 && <div className="empty-column">Nothing has been archived yet. Use the Archive button on a use case.</div>}
          {rows?.map((r) => (
            <section key={r.id} className="studio-archived-item">
              <div className="studio-archived-top">
                <div><span className="eyebrow">{[r.customer, r.businessArea].filter(Boolean).join(' · ') || 'Use case'}</span><h3>{r.name}</h3></div>
                <span className={`studio-archived-badge is-${r.closeout?.outcome || 'none'}`}>{r.closeout?.decision ?? 'No decision recorded'}</span>
              </div>
              <p className="studio-muted">Archived {ago(r.archivedAt)}{r.closeout?.by ? ` by ${r.closeout.by}` : ''}{r.createdBy ? ` · started by ${r.createdBy}` : ''}</p>
              <dl className="studio-archived-closeout">
                <div><dt>Comments</dt><dd>{r.closeout?.comments}</dd></div>
                <div><dt>Estimated cost to implement</dt><dd>{r.closeout?.cost}</dd></div>
                <div><dt>Benefits and metrics to track and deliver</dt><dd>{r.closeout?.benefits}</dd></div>
              </dl>
              <div className="studio-archived-actions"><a className="button button-quiet" href={`/use-cases/${r.id}`}>Open</a><button type="button" className="button button-quiet" onClick={() => void restore(r.id)}><ArchiveRestore size={14} /> Restore</button></div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
