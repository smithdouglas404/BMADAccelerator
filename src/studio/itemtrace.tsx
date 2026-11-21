'use client'

// An item's questions and Traceability (Doug, Nov 20). Shown wherever the item appears: the Product page's
// backlog detail, the Board's new-item detail and the Board card. Everything comes from the record
// (/api/use-cases/[id]/items?node=…): what was said, the specialist sent, the skills loaded and used, the
// questions Socra asked about this item, the answers, and every move with who and why. No fixed text
// stands in for a question: if Socra hasn't asked yet, it says so.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Bot, CornerDownRight, GitCommitHorizontal, History, Loader2, MessageCircleQuestion, MessageSquare, Send, Sparkles, UserRound, Wrench } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { api, ago, type Live } from './live'
import type { Me } from './flow'

type Entry = {
  id: string; at: string; kind: 'said' | 'asked' | 'specialist' | 'answer' | 'signal' | 'turn' | 'move' | 'change'; who: string; text: string
  detail?: { loaded?: string[]; skills?: string[]; agents?: string[]; tools?: string[]; status?: string; error?: string; node?: string; before?: string; after?: string }
}
type Trace = {
  nodes: string[]; entries: Entry[]; working: boolean
  question: { messageId: string; who: string; text: string; at: string; options: { n: number; label: string; suggested: boolean }[] } | null
  decisions?: { id: string; text: string; who: string; at: string; options: { label: string; value: string }[] }[]
  counts: { questions: number; answers: number; turns: number; moves: number }
}

const KIND_LABEL: Record<Entry['kind'], string> = { said: 'Said', asked: 'Asked', specialist: 'Specialist', answer: 'Answer', signal: 'Note', turn: 'Agent turn', move: 'Status', change: 'Changed' }
const icon = (k: Entry['kind']) => (k === 'said' || k === 'answer' ? <UserRound size={13} /> : k === 'asked' ? <MessageCircleQuestion size={13} /> : k === 'specialist' ? <Bot size={13} /> : k === 'turn' ? <Sparkles size={13} /> : k === 'move' ? <GitCommitHorizontal size={13} /> : k === 'change' ? <Wrench size={13} /> : <MessageSquare size={13} />)

/** The question part of a message: its text without the numbered option lines (those become buttons). */
const questionText = (text: string) => text.split('\n').filter((l) => !/^\s*(?:\*\*)?\d{1,2}[.)]/.test(l)).join('\n').trim()

export function useItemTrace(live: Live, node: string) {
  const [trace, setTrace] = useState<Trace | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!node) return
    try { setTrace(await api<Trace>(`/api/use-cases/${live.id}/items?node=${encodeURIComponent(node)}`, { cache: 'no-store' })); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [live.id, node])
  // Refreshes with the product, and every few seconds while Socra is working on this item.
  useEffect(() => { void load() }, [load, live.updatedAt, live.agentBusy, live.pending])
  useEffect(() => {
    if (!trace?.working && !live.agentBusy) return
    const t = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(t)
  }, [trace?.working, live.agentBusy, load])
  return { trace, error, reload: load }
}

/** Socra's open question about this item, answered right here (a pick or your own words). */
export function ItemQuestions({ live, me, node, trace, reload, setToast }: { live: Live; me: Me; node: string; trace: Trace | null; reload: () => Promise<void>; setToast: (v: string) => void }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const send = async (content: string) => {
    const text = content.trim()
    if (!text) return
    setSending(true)
    try {
      await api(`/api/use-cases/${live.id}/messages`, { json: { content: text, author: me, about: trace?.nodes ?? [node], ...(trace?.question ? { replyTo: trace.question.messageId } : {}), source: 'Item detail' } })
      setReply('')
      setToast(`Answer kept on the item. ${ASSISTANT_NAME} is writing it in.`)
      await reload()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setSending(false) }
  }
  const decide = async (id: string, status: 'approved' | 'rejected', answer?: string) => {
    setSending(true)
    try {
      await api(`/api/use-cases/${live.id}/decisions/${id}`, { method: 'PATCH', json: { status, ...(answer ? { answer } : {}), by: me.name ? `${me.name} (${me.role})` : me.role } })
      setToast(status === 'approved' ? `Decided. ${ASSISTANT_NAME} carries it into the product.` : `Rejected. ${ASSISTANT_NAME} will suggest another way.`)
      await reload()
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setSending(false) }
  }
  if (!trace) return <section className="studio-card-section studio-item-ask"><span className="eyebrow"><MessageCircleQuestion size={11} /> Questions</span><p className="studio-muted">Loading…</p></section>
  const q = trace.question
  const ds = trace.decisions ?? []
  return <section className="studio-card-section studio-item-ask" aria-label="Questions about this item">
    <span className="eyebrow"><MessageCircleQuestion size={11} /> Questions about this item</span>
    {ds.map((d) => <div key={d.id} className="studio-item-question">
      <p className="studio-item-who">{d.who} · needs your decision · {ago(d.at)}</p>
      <p className="studio-item-q">{d.text}</p>
      <div className="studio-item-options">
        {d.options.map((o, i) => <button key={o.value + i} type="button" className="button button-small button-quiet" disabled={sending} onClick={() => void decide(d.id, 'approved', o.label)}><b>{i + 1}</b> {o.label}</button>)}
        {d.options.length === 0 && <button type="button" className="button button-small button-primary" disabled={sending} onClick={() => void decide(d.id, 'approved')}>Approve</button>}
        <button type="button" className="button button-small button-quiet" disabled={sending} onClick={() => void decide(d.id, 'rejected')}>Reject</button>
      </div>
    </div>)}
    {q ? <div className="studio-item-question">
      <p className="studio-item-who">{q.who} · {ago(q.at)}</p>
      <p className="studio-item-q">{questionText(q.text)}</p>
      {q.options.length > 0 && <div className="studio-item-options">{q.options.map((o) => <button key={o.n} type="button" className={`button button-small ${o.suggested ? 'button-primary' : 'button-quiet'}`} disabled={sending} onClick={() => void send(String(o.n))}><b>{o.n}</b> {o.label.replace(/\s*\((suggested|recommended)\)\s*$/i, '')}{o.suggested && <em> suggested</em>}</button>)}</div>}
    </div> : trace.working || live.agentBusy ? <p className="studio-item-working"><Loader2 size={13} className="studio-spin" /> {ASSISTANT_NAME} and the specialist are looking at it. Their questions appear here and in the conversation.</p>
      : ds.length ? null : <p className="studio-muted">{trace.counts.questions ? `No question is waiting: ${trace.counts.answers} ${trace.counts.answers === 1 ? 'answer' : 'answers'} given so far.` : `${ASSISTANT_NAME} hasn't asked anything about this item yet.`}</p>}
    <div className="studio-item-reply">
      <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={q ? 'Answer in your own words…' : `Add detail or ask ${ASSISTANT_NAME} about this item…`} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(reply) } }} aria-label="Your answer" />
      <button type="button" className="button button-primary button-small" disabled={sending || !reply.trim()} onClick={() => void send(reply)}><Send size={13} /> {sending ? 'Sending…' : 'Send'}</button>
    </div>
  </section>
}

/** Everything that happened to this item, oldest first, from the record. */
export function ItemTraceability({ trace, error, plain }: { trace: Trace | null; error?: string; plain?: (t: string) => string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const end = useRef<HTMLOListElement>(null)
  const p = plain ?? ((t: string) => t)
  if (!trace) return <section className="studio-card-section"><span className="eyebrow"><History size={11} /> Traceability</span><p className="studio-muted">{error || 'Loading…'}</p></section>
  const c = trace.counts
  return <section className="studio-card-section studio-trace" aria-label="Traceability">
    <div className="studio-card-section-head"><span className="eyebrow"><History size={11} /> Traceability · {trace.entries.length}</span><small className="studio-muted">{c.questions} asked · {c.answers} answered · {c.turns} agent {c.turns === 1 ? 'turn' : 'turns'} · {c.moves} {c.moves === 1 ? 'move' : 'moves'}</small></div>
    {trace.entries.length === 0 ? <p className="studio-card-empty">Nothing recorded for this item yet.</p> :
      <ol className="studio-trace-list" ref={end}>{trace.entries.map((e) => {
        const d = e.detail
        const long = e.text.length > 220
        return <li key={e.id} className={`studio-trace-${e.kind}`}>
          <span className="studio-trace-icon">{icon(e.kind)}</span>
          <div className="studio-trace-body">
            <p className="studio-trace-head"><strong>{e.who}</strong><span className="studio-trace-kind">{KIND_LABEL[e.kind]}</span><small>{ago(e.at)} · {new Date(e.at).toLocaleString()}</small></p>
            <p className="studio-trace-text">{long && !open[e.id] ? `${p(e.text).slice(0, 220)}…` : p(e.text)}{long && <button type="button" className="text-button" onClick={() => setOpen({ ...open, [e.id]: !open[e.id] })}>{open[e.id] ? 'Less' : 'More'}</button>}</p>
            {e.kind === 'turn' && d && <div className="studio-trace-turn">
              <p><span>Skills loaded</span> {d.loaded?.length ? d.loaded.join(', ') : 'none recorded'}</p>
              <p><span>Skills used</span> {d.skills?.length ? d.skills.join(', ') : 'none opened'}</p>
              <p><span>Specialists sent</span> {d.agents?.length ? d.agents.join(', ') : 'none'}</p>
              <p><span>Studio actions</span> {d.tools?.length ? d.tools.join(', ') : 'none'}</p>
              {d.status === 'failed' && <p><span>Failed</span> {d.error || 'unknown error'}</p>}
            </div>}
            {e.kind === 'move' && d?.before && d?.after && <p className="studio-trace-delta"><CornerDownRight size={11} /> {d.before} <ArrowRight size={11} /> {d.after}</p>}
          </div>
        </li>
      })}</ol>}
  </section>
}
