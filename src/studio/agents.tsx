'use client'
// Ship it > Agents: every agent this product has, what it does and how, what it did, and what waits for
// a person. Read from the Studio's records and the shared agent service. Built from the team's classes;
// the few new ones are in studio-extras.css.
import { Rich } from './rich'
import { useCallback, useEffect, useState } from 'react'
import { Bot, Brain, Check, ExternalLink, History, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react'
import { api, type Live } from './live'
import type { Me } from './flow'

type Tool = { name: string; description: string; approval?: boolean }
type Agent = {
  id: string; key: string; name: string; purpose: string; instructions: string; persona: boolean; personaText: string
  provider: string; model: string; tools: Tool[]; approvals: { output?: boolean; timeoutMinutes?: number; onTimeout?: string }
  facts: boolean; status: 'proposed' | 'approved' | 'off'; decisionId: string; why: string
}
type Run = { id: string; agent: string; person: string; input: string; output: string; status: string; error: string; demo: boolean; steps: { at: string; detail: string }[]; created_at: string }
type Approval = { id: string; agent: string; kind: string; title: string; detail: string; status: string; comment: string; decided_by: string; created_at: string }
type View = { agents: Agent[]; runs: Run[]; approvals: Approval[]; note: string; approvalPage: string }

const STATUS: Record<Agent['status'], string> = { proposed: 'Waiting for your yes', approved: 'Approved · on', off: 'Off' }
const when = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function AgentsView({ live, me, setToast }: { live: Live; me: Me; setToast: (s: string) => void }) {
  const [view, setView] = useState<View | null>(null)
  const [open, setOpen] = useState('')
  const [comments, setComments] = useState<Record<string, string>>({})
  const load = useCallback(() => api<View>(`/api/use-cases/${live.id}/agents`).then(setView).catch(() => undefined), [live.id])
  useEffect(() => {
    void load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const by = me.name || me.role
  const decideAgent = async (a: Agent, approve: boolean) => {
    await api(`/api/use-cases/${live.id}/decisions/${a.decisionId}`, { method: 'PATCH', json: { status: approve ? 'approved' : 'rejected', by } })
    setToast(approve ? `${a.name} is approved and being registered` : `${a.name} is set aside`)
    void load()
  }
  const patch = async (a: Agent, body: { persona?: boolean; on?: boolean }) => {
    await api(`/api/use-cases/${live.id}/agents/${a.key}`, { method: 'PATCH', json: { ...body, by } })
    void load()
  }
  const decide = async (ap: Approval, decision: 'approve' | 'reject') => {
    const r = await api<{ error?: string }>(`/api/use-cases/${live.id}/agents/approvals/${ap.id}`, { json: { decision, comment: comments[ap.id] ?? '', by } })
    setToast(r.error ? r.error : decision === 'approve' ? 'Approved: the agent carries on' : 'Rejected: the agent stops that step')
    void load()
  }

  if (!view) return <div className="page-wrap"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Agents</p><h1>Finding this product’s<br /><em>agents…</em></h1></div></div></div>
  const pending = view.approvals.filter((a) => a.status === 'pending')
  const nameOf = (key: string) => view.agents.find((a) => a.key === key)?.name ?? key

  return <div className="page-wrap studio-agents">
    <div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Agents · shared agent service</p><h1>The agents behind<br /><em>{live.name}.</em></h1><p>Each one is proposed by Socra from what this product needs, approved by a person, and runs in the Studio’s shared agent service: Inngest AgentKit, a Letta persona that remembers each person, and Mem0 memory kept to this product only. People approve what matters; every run is kept.</p></div>
      <div className="truth-intro-side"><div className="truth-score"><span className="eyebrow">Approved</span><strong>{view.agents.filter((a) => a.status === 'approved').length}</strong><small>{view.agents.filter((a) => a.status === 'proposed').length} waiting for a yes · {pending.length} approval{pending.length === 1 ? '' : 's'} waiting</small></div>{view.approvalPage && <a className="button button-quiet button-small" href={view.approvalPage} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Approval page</a>}</div></div>
    {view.note && <p className="studio-muted">{view.note}</p>}

    {pending.length > 0 && <section className="truth-graph-card"><div className="truth-card-heading"><div><p className="eyebrow">Waiting for a person</p><h2>Approve or reject, with a comment</h2></div><ShieldCheck size={16} /></div>
      <div className="studio-agent-list">{pending.map((ap) => <article className="studio-agent" key={ap.id}>
        <div className="studio-agent-top"><strong>{ap.title}</strong><small>{nameOf(ap.agent)} · {when(ap.created_at)}</small></div>
        <Rich text={ap.detail} lines={8} />
        <textarea className="studio-agent-comment" rows={2} placeholder="Comment (optional)" value={comments[ap.id] ?? ''} onChange={(e) => setComments({ ...comments, [ap.id]: e.target.value })} />
        <div className="studio-agent-actions"><button className="button button-primary button-small" type="button" onClick={() => void decide(ap, 'approve')}><Check size={13} /> Approve</button><button className="button button-quiet button-small" type="button" onClick={() => void decide(ap, 'reject')}><X size={13} /> Reject</button></div>
      </article>)}</div></section>}

    <section className="truth-graph-card"><div className="truth-card-heading"><div><p className="eyebrow">Agents · {view.agents.length}</p><h2>What each one does, and how</h2></div><Bot size={16} /></div>
      {view.agents.length === 0 && <p className="studio-muted">No agents yet. Socra proposes one only where an agent truly helps (a workflow, a message, an alert, a recommendation or an insight); fixed rules stay plain code.</p>}
      <div className="studio-agent-list">{view.agents.map((a) => {
        const runs = view.runs.filter((r) => r.agent === a.key)
        return <article className={`studio-agent is-${a.status}`} key={a.id}>
          <div className="studio-agent-top"><strong>{a.name}</strong><span className={`studio-agent-status is-${a.status}`}>{STATUS[a.status]}</span>{a.persona && <span className="studio-agent-tag"><UserRound size={11} /> Letta persona</span>}{a.facts && <span className="studio-agent-tag"><Sparkles size={11} /> Mem0 memory</span>}</div>
          <p>{a.purpose}</p>
          <dl className="studio-agent-facts">
            {a.persona && <><dt>Persona</dt><dd>{a.personaText}</dd></>}
            <dt>Can do</dt><dd>{a.tools.length ? a.tools.map((t) => <span key={t.name}>{t.description}{t.approval ? ' (waits for a person)' : ''}</span>) : 'Answers only; takes no actions.'}</dd>
            <dt>Approvals</dt><dd>{a.approvals.output ? 'A person checks its answer before it is used.' : 'Its answers are used directly.'}{a.tools.some((t) => t.approval) ? ' Marked actions wait for a person.' : ''} {a.approvals.timeoutMinutes ? `Unanswered after ${Math.round(a.approvals.timeoutMinutes / 60) || 1} h: ${a.approvals.onTimeout === 'approve' ? 'goes ahead' : 'does not go ahead'}.` : ''}</dd>
            <dt>Model</dt><dd>{a.provider}{a.model ? ` · ${a.model}` : ' · the service default'}</dd>
            <dt>Why it exists</dt><dd>{a.why}</dd>
          </dl>
          <div className="studio-agent-actions">
            {a.status === 'proposed' && a.decisionId && <><button className="button button-primary button-small" type="button" onClick={() => void decideAgent(a, true)}><Check size={13} /> Approve this agent</button><button className="button button-quiet button-small" type="button" onClick={() => void decideAgent(a, false)}><X size={13} /> Not now</button></>}
            {a.status === 'approved' && <button className="text-button" type="button" onClick={() => void patch(a, { on: false })}>Switch it off</button>}
            {a.status === 'off' && <button className="text-button" type="button" onClick={() => void patch(a, { on: true })}>Switch it on</button>}
            {a.persona ? <button className="text-button" type="button" onClick={() => { if (window.confirm(`Switch off ${a.name}'s persona? It will stop keeping its own identity and its memory of each person.`)) void patch(a, { persona: false }) }}>Switch the persona off</button> : <button className="text-button" type="button" onClick={() => void patch(a, { persona: true })}>Give it a persona</button>}
            <button className="text-button" type="button" onClick={() => setOpen(open === a.key ? '' : a.key)}><History size={13} /> {runs.length} run{runs.length === 1 ? '' : 's'}</button>
            <a className="text-button" href={`/settings?tab=memory&useCase=${encodeURIComponent(live.id)}&agent=${encodeURIComponent(`app:${live.id}:${a.key}`)}`}><Brain size={13} /> See its memory</a>
          </div>
          {open === a.key && <div className="studio-agent-runs">{runs.length ? runs.slice(0, 20).map((r) => <div className="studio-agent-run" key={r.id}>
            <div className="studio-agent-top"><span className={`studio-agent-status is-${r.status}`}>{r.status}</span>{r.demo && <span className="studio-agent-tag">demo</span>}<small>{when(r.created_at)}{r.person ? ` · ${r.person}` : ''}</small></div>
            <div className="studio-run-block"><span className="eyebrow">Asked</span><Rich text={r.input} lines={4} /></div>{r.output && <div className="studio-run-block"><span className="eyebrow">Answered</span><Rich text={r.output} lines={6} /></div>}{r.error && <p className="studio-agent-error">{r.error}</p>}
            {r.steps.length > 0 && <Rich text={r.steps.map((s, i) => `${i + 1}. ${s.detail}`).join('\n')} lines={5} />}
          </div>) : <p className="studio-muted">No runs yet. They appear here as the app uses this agent.</p>}</div>}
        </article>
      })}</div></section>
  </div>
}
