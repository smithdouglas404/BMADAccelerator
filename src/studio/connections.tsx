'use client'
// Connections on shadcn/ui + Animate UI: the Git repository every build pushes to, the optional Linear
// sync, what the next sync would send, and which coding agent builds the pilot. Same calls as before.
// Keys never show here: the GitHub and Linear keys live on Settings and stay on the server.
import { useEffect, useState } from 'react'
import { ArrowRight, Check, CircleHelp, GitBranch, Layers3, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ago, type Live } from './live'
import type { StudioView } from './flow'
import { Field, PageHeader, Row, Section, SectionBody, StatusBadge } from './kit'

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
type SyncState = 'idle' | 'syncing' | 'synced'
type Preview = { backlog: { id: string; title: string; group: string; synced: boolean }[]; gitDiffs: { id: string; file: string; summary: string; from: string; to: string }[]; linearDiffs: { id: string }[]; gitRecords: number; linearRecords: number }

export function ConnectionsView({ live, act, setToast, changeView }: { live: Live; act: Act; setToast: (value: string) => void; changeView: (view: StudioView) => void }) {
  const [repositoryUrl, setRepositoryUrl] = useState(live.repoUrl)
  const [linearTeam, setLinearTeam] = useState(live.linearTeam)
  const [gitSync, setGitSync] = useState<SyncState>('idle')
  const [linearSync, setLinearSync] = useState<SyncState>('idle')
  const [tick, setTick] = useState(0)
  const sync = (kind: 'git' | 'linear') => {
    const setter = kind === 'git' ? setGitSync : setLinearSync
    setter('syncing')
    setToast(kind === 'git' ? 'Preparing backlog records and spec diffs for a repository branch' : 'Projecting the curated backlog and spec diffs into Linear')
    void act(async () => {
      try {
        const r = await api<{ status?: string }>(`/api/use-cases/${live.id}/sync`, { json: { kind } })
        setter('synced')
        setToast(r.status || (kind === 'git' ? 'Git sync complete: backlog and spec diffs are traceable by source id' : 'Linear sync complete: backlog and spec changes stay linked to the Studio'))
      } catch (e) {
        setter('idle')
        throw e
      } finally {
        setTick((t) => t + 1)
      }
    })
  }
  const syncState: SyncState = gitSync === 'synced' || linearSync === 'synced' ? 'synced' : gitSync === 'syncing' || linearSync === 'syncing' ? 'syncing' : 'idle'
  const label = (s: SyncState, idle: string) => (s === 'syncing' ? 'Syncing…' : s === 'synced' ? 'Synced' : idle)
  const gitTone = live.connections.github && live.repoUrl ? 'ok' : live.repoUrl ? 'info' : 'warn'

  return (
    <div data-ui className="mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Connections"
        description="Where the work goes next. A connected repository gives every build a durable home; Linear can be an optional synchronised view of the same product truth."
        actions={<Button type="button" variant="outline" onClick={() => changeView('brief')} className="gap-1.5">Back to the prototype brief <ArrowRight className="size-4" /></Button>}
      />
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={<span className="flex items-center gap-2"><GitBranch className="size-5 text-primary" />Git repository</span>} description="The source of truth for the code. Every build is pushed here." action={<StatusBadge tone={gitTone}>{live.connections.github && live.repoUrl ? 'Connected' : live.repoUrl ? 'URL saved' : 'Needs a URL'}</StatusBadge>}>
          <SectionBody>
            <p className="text-sm">{live.connections.github ? 'The GitHub key on Settings lets the Studio push; every build goes here automatically.' : 'Add a GitHub key on Settings (Models and keys) before the first real push.'}</p>
            <Field id="conn-repo" label="Repository URL"><Input id="conn-repo" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} placeholder="https://github.com/org/repository" /></Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { repoUrl: repositoryUrl.trim() } }), 'Repository URL saved. The next package can target this repository')}>Save repository</Button>
              <Button type="button" variant="outline" disabled={gitSync === 'syncing'} onClick={() => sync('git')} className="gap-1.5"><RefreshCw className="size-4" /> {label(gitSync, 'Sync the package')}</Button>
            </div>
            <p className="flex gap-2 text-xs text-muted-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0" />{live.gitStatus ? `${live.gitStatus}${live.gitPushedAt ? ` · ${ago(live.gitPushedAt)}` : ''}` : 'The ZIP stays an auditable handoff; the unpacked package is committed to a dedicated prototype branch.'}</p>
          </SectionBody>
        </Section>
        <Section title={<span className="flex items-center gap-2"><Layers3 className="size-5 text-info" />Linear workspace</span>} description="Optional. Syncs capabilities, epics and stories once they're shaped." action={<StatusBadge tone={live.connections.linear ? 'ok' : 'off'}>{live.connections.linear ? 'Key on Settings' : 'Optional'}</StatusBadge>}>
          <SectionBody>
            <p className="text-sm">The Studio stays the conversational source of truth. A sync only projects the curated backlog and spec changes; it never erases the conversation.</p>
            <Field id="conn-linear" label="Linear team"><Input id="conn-linear" value={linearTeam} onChange={(e) => setLinearTeam(e.target.value)} placeholder="Team key or name, for example ENG" /></Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void act(() => api(`/api/use-cases/${live.id}`, { method: 'PATCH', json: { linearTeam: linearTeam.trim() } }), 'Linear team saved. Sync stays opt-in')}>Save team</Button>
              <Button type="button" variant="outline" disabled={linearSync === 'syncing'} onClick={() => sync('linear')} className="gap-1.5"><RefreshCw className="size-4" /> {label(linearSync, 'Sync to Linear')}</Button>
            </div>
            {live.linearStatus && <p className="flex gap-2 text-xs text-muted-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0" />{live.linearStatus}{live.linearSyncedAt ? ` · ${ago(live.linearSyncedAt)}` : ''}</p>}
          </SectionBody>
        </Section>
      </div>
      <SyncPreview live={live} syncState={syncState} refresh={tick} />
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Section title="The loop" description="How a change travels from the conversation to a running pilot.">
          <SectionBody>
            <ol className="flex flex-wrap items-center gap-2 text-sm">
              {['Product truth', 'Prototype package', 'Repository', 'Pilot', 'Linear, if you use it'].map((s, i, all) => <li key={s} className="flex items-center gap-2"><span className="rounded-md border border-border bg-muted px-2.5 py-1">{s}</span>{i < all.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}</li>)}
            </ol>
          </SectionBody>
        </Section>
        <ProvidersCard />
      </div>
    </div>
  )
}

/** What the next sync would send: backlog records and spec diffs. */
function SyncPreview({ live, syncState, refresh }: { live: Live; syncState: SyncState; refresh: number }) {
  const [p, setP] = useState<Preview | null>(null)
  useEffect(() => {
    void api<Preview>(`/api/use-cases/${live.id}/sync`, { cache: 'no-store' }).then(setP).catch(() => setP(null))
  }, [live.id, refresh, live.updatedAt])
  const backlog = p?.backlog ?? []
  const diffs = p?.gitDiffs ?? []
  return (
    <Section
      title="What the next sync would send"
      description={p ? `${p.gitRecords} records already in Git · ${p.linearRecords} in Linear. Syncing again never duplicates them.` : 'Reading what the next sync would send…'}
      action={<StatusBadge tone={syncState === 'synced' ? 'ok' : syncState === 'syncing' ? 'info' : 'off'}>{syncState === 'synced' ? 'Synced' : syncState === 'syncing' ? 'Syncing' : 'Ready'}</StatusBadge>}
    >
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2">
        <div className="min-w-0 border-border lg:border-r">
          <h3 className="border-b border-border px-5 py-2.5 text-sm font-semibold">Backlog records · {backlog.length}</h3>
          {backlog.slice(0, 8).map((item) => <Row key={item.id} title={item.title} detail={`${item.id} · ${item.group || 'Unsorted signal'}`}>{item.synced && <Check className="size-4 text-primary" aria-label="Already synced" />}</Row>)}
          {backlog.length === 0 && <p className="px-5 py-3 text-sm text-muted-foreground">Nothing to send.</p>}
        </div>
        <div className="min-w-0">
          <h3 className="border-b border-border px-5 py-2.5 text-sm font-semibold">Specification changes · {diffs.length}</h3>
          {diffs.length === 0 && <Row title="No spec changes since the last sync" detail="prototype/spec is up to date" />}
          {diffs.slice(0, 8).map((d) => <Row key={d.id} title={d.summary} detail={`${d.file} · ${d.from} → ${d.to}`} />)}
        </div>
      </div>
    </Section>
  )
}

/** Which coding agent builds the pilot: Claude Code today; the others are on the way. */
function ProvidersCard() {
  const rows = [
    ['Claude Code', 'Builds every version from the package, on your Claude plan', 'Active'],
    ['Cursor', 'Same package, opened as a Cursor background agent', 'Coming'],
    ['Devin', 'Same package, handed to a Devin session', 'Coming'],
    ['Antigravity', 'Same package, run in Google Antigravity', 'Coming'],
  ]
  return (
    <Section title="Who builds the pilot" description="The coding agent that turns the package into the product." action={<Button asChild size="sm" variant="ghost"><a href="/settings" className="gap-1.5"><Play className="size-4" /> Settings</a></Button>}>
      {rows.map(([name, detail, state]) => <Row key={name} title={name} detail={detail}><StatusBadge tone={state === 'Active' ? 'ok' : 'off'}>{state}</StatusBadge></Row>)}
    </Section>
  )
}
