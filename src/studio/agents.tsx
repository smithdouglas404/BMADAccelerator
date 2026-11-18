'use client'
// Ship it > Agents: every agent this product has, what it does and how, what it did, and what waits for
// a person. Read from the Studio's records and the shared agent service. On shadcn/ui + Animate UI.
import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, ChevronDown, ExternalLink, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { api, type Live } from './live'
import type { Me } from './flow'
import { Empty, PageHeader, Section, StatusBadge } from './kit'

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
const STATUS_TONE = { proposed: 'warn', approved: 'ok', off: 'off' } as const
const RUN_TONE: Record<string, 'ok' | 'warn' | 'info' | 'off'> = { done: 'ok', completed: 'ok', running: 'info', waiting: 'warn', failed: 'warn', error: 'warn' }
const PAGE = 'mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8'
const when = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function AgentsView({ live, me, setToast }: { live: Live; me: Me; setToast: (s: string) => void }) {
  const [view, setView] = useState<View | null>(null)
  const [open, setOpen] = useState('')
  const [comments, setComments] = useState<Record<string, string>>({})
  const [personaOff, setPersonaOff] = useState<Agent | null>(null)
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

  if (!view) return <div data-ui className={PAGE}><PageHeader title="Agents" eyebrow="Agents" headline={<>Finding this product’s<br /><em>agents…</em></>} description="Finding this product’s agents…" /></div>
  const pending = view.approvals.filter((a) => a.status === 'pending')
  const nameOf = (key: string) => view.agents.find((a) => a.key === key)?.name ?? key
  const approved = view.agents.filter((a) => a.status === 'approved').length
  const proposed = view.agents.filter((a) => a.status === 'proposed').length

  return <div data-ui className={PAGE}>
    <PageHeader
      title="Agents"
      eyebrow="Agents · shared agent service"
      headline={<>The agents behind<br /><em>{live.name}.</em></>}
      description="Socra proposes each one from what this product needs and a person approves it. They run in the Studio’s shared agent service: Inngest AgentKit, a Letta persona that remembers each person, and Mem0 memory kept to this product only. Every run is kept."
      actions={<>
        <div className="grid justify-items-end"><span className="text-2xl font-semibold text-primary">{approved} approved</span><span className="text-sm text-muted-foreground">{proposed} waiting for a yes · {pending.length} {pending.length === 1 ? 'approval' : 'approvals'} waiting</span></div>
        {view.approvalPage && <Button asChild variant="outline" size="sm"><a href={view.approvalPage} target="_blank" rel="noopener noreferrer" className="gap-1.5"><ExternalLink className="size-4" /> Approval page</a></Button>}
      </>}
    />
    {view.note && <p className="-mt-3 text-sm text-muted-foreground">{view.note}</p>}

    {pending.length > 0 && <Section statement={<>AI suggests. <em>People decide.</em></>} title="Waiting for a person" description="Approve or reject, with a comment if it helps." action={<ShieldCheck className="size-4 text-warning" />}>
      {pending.map((ap) => <article key={ap.id} className="grid min-w-0 gap-3 border-b border-border px-5 py-4 last:border-b-0">
        <div className="grid gap-0.5"><h3 className="text-base font-semibold">{ap.title}</h3><span className="text-xs text-muted-foreground">{nameOf(ap.agent)} · {when(ap.created_at)}</span></div>
        <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">{ap.detail}</pre>
        <Textarea aria-label={`Comment on ${ap.title}`} rows={2} placeholder="Comment (optional)" value={comments[ap.id] ?? ''} onChange={(e) => setComments({ ...comments, [ap.id]: e.target.value })} />
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" className="gap-1.5" onClick={() => void decide(ap, 'approve')}><Check className="size-4" /> Approve</Button><Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => void decide(ap, 'reject')}><X className="size-4" /> Reject</Button></div>
      </article>)}
    </Section>}

    <Section statement={<>Each agent, <em>with a memory.</em></>} title={`What each one does, and how · ${view.agents.length}`} description="Fixed rules stay plain code; an agent appears only where one truly helps." action={<Bot className="size-4 text-muted-foreground" />}>
      {view.agents.length === 0 && <Empty>No agents yet. Socra proposes one only where an agent truly helps (a workflow, a message, an alert, a recommendation or an insight); fixed rules stay plain code.</Empty>}
      {view.agents.map((a) => {
        const runs = view.runs.filter((r) => r.agent === a.key)
        return <article key={a.id} className={cn('grid min-w-0 gap-4 border-b border-border px-5 py-5 last:border-b-0', a.status === 'off' && 'opacity-70')}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-1 text-lg font-semibold">{a.name}</h3>
            <StatusBadge tone={STATUS_TONE[a.status]}>{STATUS[a.status]}</StatusBadge>
            {a.persona && <StatusBadge tone="suggest"><UserRound className="mr-1 inline size-3" />Letta persona</StatusBadge>}
            {a.facts && <StatusBadge tone="info"><Sparkles className="mr-1 inline size-3" />Mem0 memory</StatusBadge>}
          </div>
          <p className="text-base">{a.purpose}</p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
            {a.persona && <><dt className="text-muted-foreground">Persona</dt><dd>{a.personaText}</dd></>}
            <dt className="text-muted-foreground">Can do</dt><dd>{a.tools.length ? <ul className="grid gap-1">{a.tools.map((t) => <li key={t.name}>{t.description}{t.approval ? <span className="text-warning"> (waits for a person)</span> : ''}</li>)}</ul> : 'Answers only; takes no actions.'}</dd>
            <dt className="text-muted-foreground">Approvals</dt><dd>{a.approvals.output ? 'A person checks its answer before it is used.' : 'Its answers are used directly.'}{a.tools.some((t) => t.approval) ? ' Marked actions wait for a person.' : ''} {a.approvals.timeoutMinutes ? `Unanswered after ${Math.round(a.approvals.timeoutMinutes / 60) || 1} h: ${a.approvals.onTimeout === 'approve' ? 'goes ahead' : 'does not go ahead'}.` : ''}</dd>
            <dt className="text-muted-foreground">Model</dt><dd>{a.provider}{a.model ? ` · ${a.model}` : ' · the service default'}</dd>
            <dt className="text-muted-foreground">Why it exists</dt><dd>{a.why}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {a.status === 'proposed' && a.decisionId && <div className="flex gap-2"><Button type="button" size="sm" className="gap-1.5" onClick={() => void decideAgent(a, true)}><Check className="size-4" /> Approve this agent</Button><Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => void decideAgent(a, false)}><X className="size-4" /> Not now</Button></div>}
            {a.status !== 'proposed' && <div className="flex items-center gap-2"><Switch id={`on-${a.key}`} checked={a.status === 'approved'} onCheckedChange={(v) => void patch(a, { on: v })} /><Label htmlFor={`on-${a.key}`} className="text-sm font-normal">On</Label></div>}
            <div className="flex items-center gap-2"><Switch id={`persona-${a.key}`} checked={a.persona} onCheckedChange={(v) => { if (v) void patch(a, { persona: true }); else setPersonaOff(a) }} /><Label htmlFor={`persona-${a.key}`} className="text-sm font-normal">Letta persona</Label></div>
            <Button type="button" size="sm" variant="ghost" aria-expanded={open === a.key} onClick={() => setOpen(open === a.key ? '' : a.key)} className="gap-1.5 px-2"><ChevronDown className={cn('size-4 transition-transform', open === a.key && 'rotate-180')} /> {runs.length} {runs.length === 1 ? 'run' : 'runs'}</Button>
          </div>
          {open === a.key && <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
            {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet. They appear here as the app uses this agent.</p>}
            {runs.slice(0, 20).map((r) => <div key={r.id} className="grid gap-1.5 border-b border-border pb-2 text-sm last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={RUN_TONE[r.status] ?? 'off'}>{r.status}</StatusBadge>{r.demo && <StatusBadge tone="off">demo</StatusBadge>}<span className="text-xs text-muted-foreground">{when(r.created_at)}{r.person ? ` · ${r.person}` : ''}</span></div>
              <p><span className="font-semibold">Asked</span> {r.input}</p>{r.output && <p><span className="font-semibold">Answered</span> {r.output}</p>}{r.error && <p className="text-destructive">{r.error}</p>}
              {r.steps.length > 0 && <ol className="list-decimal pl-5 text-xs text-muted-foreground">{r.steps.map((s, i) => <li key={i}>{s.detail}</li>)}</ol>}
            </div>)}
          </div>}
        </article>
      })}
    </Section>
    <AlertDialog open={!!personaOff} onOpenChange={(v) => { if (!v) setPersonaOff(null) }}>
      <AlertDialogContent data-ui>
        <AlertDialogHeader><AlertDialogTitle>Switch off {personaOff?.name}’s persona?</AlertDialogTitle><AlertDialogDescription>It will stop keeping its own identity and its memory of each person. You can give it a persona again later.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep the persona</AlertDialogCancel><AlertDialogAction onClick={() => { if (personaOff) void patch(personaOff, { persona: false }) }}>Switch it off</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
