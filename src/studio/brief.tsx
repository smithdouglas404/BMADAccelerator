'use client'
// The Prototype brief on shadcn/ui + Animate UI: what goes to Claude Code, the Build button (the ZIP is
// secondary), the decisions only a person makes, the component map, the Agent Kit routes and the builds.
// Same calls as the older screen.
import { useState, type ReactNode } from 'react'
import { ArrowRight, Bot, Check, Code2, Database, Download, ExternalLink, Timer, FileText, FolderGit2, GitBranch, Layers3, PackageOpen, Play, Sparkles, Target, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { api, ago, previewUrl, type Live, type LiveDecision } from './live'
import type { StudioView } from './flow'
import { Empty, PageHeader, Section, SectionBody, StatusBadge } from './kit'
import { SpecImpact } from './specview'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
type Role = 'owner' | 'engineer'
type Tone = 'ok' | 'warn' | 'off' | 'info' | 'suggest'
type BuildOpts = { redesign?: boolean; fresh?: boolean }

const DECISION_TONE: Record<LiveDecision['status'], Tone> = { approved: 'ok', assumed: 'suggest', open: 'warn', rejected: 'off' }
const ROUTE_TONE: Record<string, Tone> = { done: 'ok', complete: 'ok', active: 'info', running: 'info', waiting: 'warn', paused: 'warn' }
const ROUTE_DOT: Record<Tone, string> = { ok: 'bg-primary', info: 'bg-info', warn: 'bg-warning', suggest: 'bg-suggest', off: 'bg-muted-foreground/50' }

/** Owner or engineer: the same product, read at their level. */
export function RoleLens({ role, setRole }: { role: Role; setRole: (role: Role) => void }) {
  const opt = (r: Role, icon: ReactNode, label: string) => (
    <button type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', role === r ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>{icon}{label}</button>
  )
  return (
    <div role="group" aria-label="Workspace lens" className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {opt('owner', <UserRound className="size-4" />, 'Product owner')}
      {opt('engineer', <Code2 className="size-4" />, 'Product engineer')}
    </div>
  )
}

type Props = {
  live: Live; act: Act; buildNow: (opts?: BuildOpts) => void; validationScore: number; repositoryUrl: string; generatedFiles: string[]
  prototypeStatus: 'idle' | 'assembling' | 'ready'; generatePrototype: () => void; setTechnicalOpen: (value: boolean) => void; technicalOpen: boolean
  changeView: (view: StudioView) => void; role: Role; setRole?: (role: Role) => void; setToast?: (value: string) => void; generationVersion: number
}

export function BriefView({ live, act, buildNow, validationScore, repositoryUrl, generatedFiles, prototypeStatus, generatePrototype, generationVersion, setTechnicalOpen, technicalOpen, changeView, role }: Props) {
  const components = live.components.map((c) => c.name)
  const trd = live.spec.filter((x) => x.tab === 'trd' && x.review !== 'remove')
  const trdShaped = trd.filter((x) => x.content.trim()).length
  const openDecisions = live.decisions.filter((d) => d.status !== 'approved').length
  // Only files that really exist in the last package; nothing is listed before one is assembled.
  const files = generatedFiles
  const buildLabel = live.generateBusy ? 'Claude Code is building…' : live.preview.hasApp ? `Build version ${live.generateCount + 1} with Claude Code` : 'Build it with Claude Code'
  const byType = Object.entries(live.evidence.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(', ')
  // Each line says honestly whether it is there yet: a check only when it is.
  const manifest: [ReactNode, string, string, boolean][] = [
    [<Target key="t" className="size-4" />, 'Validated use case', `${validationScore}% readiness recommendation`, validationScore >= 80],
    [<FileText key="f" className="size-4" />, 'PRFAQ and decisions', `${live.prfaq.trim() ? 'Customer promise written' : 'No PRFAQ yet'}, ${live.decisions.length} decisions, ${openDecisions} open`, Boolean(live.prfaq.trim()) && live.decisions.length > 0],
    [<Database key="d" className="size-4" />, 'Evidence library', live.evidence.length ? `${live.evidence.length} ${live.evidence.length === 1 ? 'source' : 'sources'}: ${byType}` : 'No sources yet', live.evidence.length > 0],
    [<Code2 key="c" className="size-4" />, 'Technical requirements', `${trdShaped} of ${trd.length} TRD sections written`, trd.length > 0 && trdShaped === trd.length],
    [<Layers3 key="l" className="size-4" />, 'shadcn/ui component map', components.length ? `${components.length} suggested components, ready to adapt` : 'Not mapped yet', components.length > 0],
    [<Bot key="b" className="size-4" />, 'Inngest Agent Kit routes', live.routes.length ? `${live.routes.length} routes: ${live.routes.map((r) => r.agent).join(', ')}` : 'No routes yet', live.routes.length > 0],
  ]
  const statusTone: Tone = prototypeStatus === 'ready' ? 'ok' : prototypeStatus === 'assembling' ? 'info' : 'off'

  return (
    <div data-ui className="mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Generate the prototype" eyebrow="Ready to hand the work to Claude Code" headline={<>Assemble the brief<br /><em>without losing the why.</em></>}
        description="Everything Claude Code gets, with the why kept attached: the validated use case, PRFAQ, evidence, decisions, component map, agent routes and the board."
        actions={<>
          <Button type="button" onClick={() => buildNow()} disabled={live.generateBusy} className="gap-1.5"><Play className="size-4" />{buildLabel}</Button>
          <Button type="button" variant="outline" onClick={generatePrototype} disabled={prototypeStatus === 'assembling'} className="gap-1.5"><PackageOpen className="size-4" />{prototypeStatus === 'assembling' ? 'Assembling ZIP…' : prototypeStatus === 'ready' ? 'Assemble again and download ZIP' : 'Download Claude Code ZIP'}</Button>
        </>}
      />
      <p className="-mt-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{live.generateBusy ? `${live.generateStatus ? `${live.generateStatus}. ` : ''}Building on your Claude plan; the preview updates when it’s done.` : repositoryUrl || 'Builds run on your Claude plan. The ZIP is for running it in your own Claude Code.'}</p>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <Section
            title={generatedFiles.length ? `${generatedFiles.length} files ready to ship` : 'The package is ready to assemble'}
            description={`Prototype package for Claude Code · iteration ${generationVersion || 0}`}
            action={<StatusBadge tone={statusTone}>{prototypeStatus === 'ready' ? 'Downloaded' : prototypeStatus === 'assembling' ? 'Working' : 'Draft'}</StatusBadge>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {manifest.map(([icon, title, detail, done]) => (
                <div key={title} className="flex min-w-0 items-start gap-3 border-b border-border px-5 py-3.5 sm:odd:border-r">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary">{icon}</span>
                  <div className="grid min-w-0 flex-1 gap-0.5"><span className="text-sm font-semibold">{title}</span><span className="text-xs text-muted-foreground">{detail}</span></div>
                  {done ? <Check className="mt-1 size-4 shrink-0 text-primary" aria-label="Done" /> : <Timer className="mt-1 size-4 shrink-0 text-muted-foreground" aria-label="Not yet" />}
                </div>
              ))}
            </div>
            <SectionBody>
              <h3 className="text-sm font-semibold">Package contents</h3>
              {files.length === 0
                ? <p className="text-sm text-muted-foreground">Nothing assembled yet. Build it or download the ZIP and the package files appear here, each one openable.</p>
                : <ul aria-label="Package contents" className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                    {files.map((file) => (
                      <li key={file} className="flex min-w-0 items-center gap-1 text-sm">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <a className="min-w-0 flex-1 truncate font-mono text-xs text-link hover:underline" title={`Open ${file}`} href={`/api/use-cases/${live.id}/package/files/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer">{file}</a>
                        <Button asChild size="icon" variant="ghost" aria-label={`Download ${file}`}><a href={`/api/use-cases/${live.id}/package/files/${encodeURIComponent(file)}?as=download`} download={file}><Download className="size-4" /></a></Button>
                      </li>
                    ))}
                  </ul>}
            </SectionBody>
          </Section>

          <BuildHistory live={live} buildNow={buildNow} />

          <Section statement={<>Where agents <em>earn their place.</em></>} title="Agent Kit routes" description="Which agent does what, and where a person pauses it. Visible, not overwhelming." action={<Bot className="size-4 text-muted-foreground" />}>
            {live.routes.length === 0 && <Empty>Socra adds agent routes here once the product needs one.</Empty>}
            {live.routes.length > 0 && (
              <ol className="grid grid-cols-1 px-5 py-4">
                {live.routes.map((route, i) => {
                  const tone = ROUTE_TONE[route.state] ?? 'off'
                  return (
                    <li key={route.id} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-3">
                      <span className="relative flex justify-center"><span className={cn('mt-1.5 size-2.5 rounded-full', ROUTE_DOT[tone])} />{i < live.routes.length - 1 && <span className="absolute top-5 bottom-0 w-px bg-border" />}</span>
                      <div className="grid min-w-0 gap-0.5 pb-4"><span className="text-sm font-semibold">{route.agent}</span><span className="text-xs text-muted-foreground">{route.action}</span>{role === 'engineer' && route.detail && <span className="text-xs text-muted-foreground/80">{route.detail}</span>}</div>
                      <span className="self-start"><StatusBadge tone={tone}>{route.state}</StatusBadge></span>
                    </li>
                  )
                })}
              </ol>
            )}
          </Section>
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-6">
          <Section statement={<>Some calls stay <em>human.</em></>} title="Decisions only a person makes" description={`${live.decisions.length} tracked; ${openDecisions} ${openDecisions === 1 ? 'is' : 'are'} still open before production hardening. Meaning stays yours.`} action={<UserRound className="size-4 text-muted-foreground" />}>
            <DecisionRegister live={live} act={act} />
          </Section>

          <Section statement={<>A thin slice on a <em>complete floor.</em></>} title="Components for the thin slice" description="The UI baseline Claude Code starts from." action={<Layers3 className="size-4 text-muted-foreground" />}>
            <SectionBody>
              {components.length ? <div className="flex flex-wrap gap-1.5">{components.map((c) => <Badge key={c} variant="secondary" className="rounded-md px-2 py-0.5 text-xs font-medium">{c}</Badge>)}</div> : <p className="text-sm text-muted-foreground">No component map yet. It is written from the PRD once the shape is clear.</p>}
              <Button type="button" variant="ghost" size="sm" aria-expanded={technicalOpen} onClick={() => setTechnicalOpen(!technicalOpen)} className="justify-self-start gap-1.5 px-2">{technicalOpen ? 'Hide why these' : 'Why these'} <ArrowRight className={cn('size-4 transition-transform', technicalOpen && 'rotate-90')} /></Button>
              {technicalOpen && (
                live.components.some((c) => c.why)
                  ? <ul className="grid gap-2">{live.components.filter((c) => c.why).map((c) => <li key={c.name} className="text-sm"><span className="font-semibold">{c.name}</span> <span className="text-muted-foreground">{c.why}</span></li>)}</ul>
                  : <p className="text-sm text-muted-foreground">The component map is written from the PRD with the shadcn registry once the shape is clear.</p>
              )}
            </SectionBody>
          </Section>

          <Button type="button" variant="outline" onClick={() => changeView('connections')} className="gap-1.5"><FolderGit2 className="size-4" /> Review the repository connection</Button>
        </aside>
      </div>
    </div>
  )
}

/** The human-in-the-loop register: approve or reopen, answer in your words, choose what goes into the next build. */
function DecisionRegister({ live, act }: { live: Live; act: Act }) {
  const [answer, setAnswer] = useState<Record<string, string>>({})
  const [impactOf, setImpactOf] = useState('')
  const [showApproved, setShowApproved] = useState(false)
  const patch = (id: string, body: Record<string, unknown>, ok: string) => void act(() => api(`/api/use-cases/${live.id}/decisions/${id}`, { method: 'PATCH', json: body }), ok)
  const open = live.decisions.filter((d) => d.status !== 'approved')
  const approved = live.decisions.filter((d) => d.status === 'approved')
  const list = showApproved ? [...open, ...approved] : open

  if (live.decisions.length === 0) return <Empty>No decisions yet. They appear here as Socra proposes them and you answer.</Empty>
  return (
    <>
      {open.length === 0 && !showApproved && <Empty>Every decision is approved.</Empty>}
      {list.map((d) => (
        <div key={d.id} className="grid min-w-0 grid-cols-1 gap-3 border-b border-border px-5 py-4 last:border-b-0">
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{d.text}</span><span className="shrink-0"><StatusBadge tone={DECISION_TONE[d.status]}>{d.status}</StatusBadge></span></div>
            <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{d.capability || 'Whole product'} · {ago(d.createdAt)}{d.words ? ` · you said “${d.words.slice(0, 80)}”` : ''}</span>
          </div>
          {d.status !== 'approved' && <Textarea aria-label={`Your answer to: ${d.text}`} rows={2} value={answer[d.id] ?? d.answer} onChange={(e) => setAnswer({ ...answer, [d.id]: e.target.value })} placeholder="Your answer, in your words…" className="min-h-0 text-sm" />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {d.status !== 'approved'
              ? <Button type="button" size="sm" className="gap-1.5" onClick={() => patch(d.id, { status: 'approved', ...(answer[d.id] ? { answer: answer[d.id] } : {}) }, 'Decision approved and carried forward')}><Check className="size-4" /> Approve</Button>
              : <Button type="button" size="sm" variant="outline" onClick={() => patch(d.id, { status: 'open' }, 'Decision reopened. Socra will ask about it')}>Reopen</Button>}
            <div className="flex items-center gap-2">
              <Checkbox id={`build-${d.id}`} checked={d.includeInBuild} onCheckedChange={(v) => patch(d.id, { includeInBuild: !!v }, v ? 'Included in the next build' : 'Left out of the next build')} />
              <Label htmlFor={`build-${d.id}`} className="text-sm font-normal">Include in next build</Label>
            </div>
            <Button type="button" size="sm" variant="ghost" aria-expanded={impactOf === d.id} onClick={() => setImpactOf(impactOf === d.id ? '' : d.id)} className="gap-1.5 px-2">What it touches <ArrowRight className={cn('size-4 transition-transform', impactOf === d.id && 'rotate-90')} /></Button>
          </div>
          {impactOf === d.id && <SpecImpact live={live} decisionId={d.id} className="bg-background" />}
        </div>
      ))}
      {approved.length > 0 && (
        <div className="px-5 py-3"><Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => setShowApproved(!showApproved)}>{showApproved ? 'Hide approved decisions' : `Show ${approved.length} approved ${approved.length === 1 ? 'decision' : 'decisions'}`}</Button></div>
      )}
    </>
  )
}

/** Claude Code builds: the next version, a fresh design direction, or start fresh from the requirements. */
function BuildHistory({ live, buildNow }: { live: Live; buildNow: (opts?: BuildOpts) => void }) {
  const [confirmFresh, setConfirmFresh] = useState(false)
  const open = previewUrl(live.preview.port, '/')
  return (
    <Section
      title={live.generateBusy ? live.generateStatus || 'Building the next version…' : live.generateCount ? `Version ${live.generateCount} built ${ago(live.lastGeneratedAt)}` : 'No version built yet'}
      description={`Claude Code builds · ${live.generateCount}. Builds start only when someone presses Build.`}
      action={live.generateBusy ? <StatusBadge tone="info">Building</StatusBadge> : undefined}
    >
      <SectionBody>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={live.generateBusy} onClick={() => buildNow()} className="gap-1.5"><Play className="size-4" /> {live.generateCount ? `Build version ${live.generateCount + 1}` : 'Build it now'}</Button>
          {live.generateCount > 0 && <Button type="button" size="sm" variant="outline" disabled={live.generateBusy} onClick={() => buildNow({ redesign: true })} className="gap-1.5"><Sparkles className="size-4" /> Fresh design direction</Button>}
          {live.generateCount > 0 && <Button type="button" size="sm" variant="ghost" disabled={live.generateBusy} onClick={() => setConfirmFresh(true)}>Start fresh from the spec</Button>}
          {open && <Button asChild size="sm" variant="ghost" className="gap-1.5"><a href={open} target="_blank" rel="noreferrer">Open the live product <ExternalLink className="size-4" /></a></Button>}
          {live.repoUrl && <Button asChild size="sm" variant="ghost" className="gap-1.5"><a href={live.repoUrl} target="_blank" rel="noreferrer"><GitBranch className="size-4" /> Repository</a></Button>}
        </div>
        {live.agentError && <p className="text-sm text-destructive">{live.agentError}</p>}
      </SectionBody>
      <AlertDialog open={confirmFresh} onOpenChange={setConfirmFresh}>
        <AlertDialogContent data-ui>
          <AlertDialogHeader>
            <AlertDialogTitle>Start fresh from the spec?</AlertDialogTitle>
            <AlertDialogDescription>The current app and its design are archived and never read again. Your requirements, decisions and evidence stay, and Claude Code rebuilds from them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep the current app</AlertDialogCancel><AlertDialogAction onClick={() => buildNow({ fresh: true })}>Start fresh</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}
