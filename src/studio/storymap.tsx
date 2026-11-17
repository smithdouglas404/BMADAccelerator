'use client'
// The Story map (Doug, Nov 16): every story and Socra's open ideas, read left to right like a PERT chart
// by what depends on what, with no durations. Solid lines are links a person made or accepted; dashed
// ones are Socra's guesses to accept or dismiss. Stories with no link stand out. Pick two stories to
// connect them and Socra asks the questions that firm up the link. On shadcn/ui + Animate UI.
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, ArrowRight, Check, Crosshair, Link2, Sparkles, X } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { PageHeader, Section, SectionBody, StatusBadge } from './kit'
import { LINK_LABEL, columns, neighbourhood, type LinkKind, type StoryLinkRow, type StoryNode } from '@/lib/studio/storymap'
import { api, type Live } from './live'
import type { Me, StudioView } from './flow'

type MapData = { nodes: StoryNode[]; links: StoryLinkRow[]; unlinked: string[]; dismissed: number }

const STATE_LABEL: Record<StoryNode['state'], string> = { idea: `${ASSISTANT_NAME}'s idea`, backlog: 'Backlog', shaping: 'Ready to shape', building: 'Being built', review: 'Human review', done: 'Done' }
const STATE_ORDER: StoryNode['state'][] = ['done', 'review', 'building', 'shaping', 'backlog', 'idea']
const W = 224, H = 96, GX = 86, GY = 16, PAD = 18
const MANY = 40
const STATE_BAR: Record<StoryNode['state'], string> = { done: 'border-l-primary', review: 'border-l-info', building: 'border-l-suggest', shaping: 'border-l-warning', backlog: 'border-l-muted-foreground', idea: 'border-l-warning' }
const STATE_TEXT: Record<StoryNode['state'], string> = { done: 'text-primary', review: 'text-info', building: 'text-suggest', shaping: 'text-warning', backlog: 'text-muted-foreground', idea: 'text-warning' }
const PAGE = 'mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8'

type Props = { live: Live; me: Me; changeView: (v: StudioView) => void; setToast: (v: string) => void }

export function StoryMapView({ live, me, changeView, setToast }: Props) {
  const [data, setData] = useState<MapData | null>(null)
  const [tick, setTick] = useState(0)
  const [selected, setSelected] = useState('')
  const [focus, setFocus] = useState('')
  const [area, setArea] = useState('')
  const [connecting, setConnecting] = useState<string[] | null>(null)
  const [kind, setKind] = useState<LinkKind>('depends_on')
  const [ask, setAsk] = useState(true)
  const [busy, setBusy] = useState(false)
  const key = `${live.id}|${live.updatedAt}|${live.backlog.length}|${tick}`
  useEffect(() => {
    let alive = true
    void api<MapData>(`/api/use-cases/${live.id}/story-map`, { cache: 'no-store' }).then((d) => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [key, live.id])

  const author = me.name ? { name: me.name, role: me.role } : { role: me.role }
  const post = async (body: Record<string, unknown>, ok: string | ((r: { by?: string; added?: number }) => string)) => {
    setBusy(true)
    try { const r = await api<{ by?: string; added?: number }>(`/api/use-cases/${live.id}/story-map`, { json: { ...body, author } }); setToast(typeof ok === 'string' ? ok : ok(r ?? {})); setTick((t) => t + 1) }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const nodes = useMemo(() => data?.nodes ?? [], [data])
  const links = useMemo(() => data?.links ?? [], [data])
  const areas = useMemo(() => [...new Set(nodes.map((n) => n.capability).filter(Boolean))].sort(), [nodes])
  const visible = useMemo(() => {
    let v = nodes
    if (area) v = v.filter((n) => n.capability === area)
    if (focus) { const keep = neighbourhood(focus, links); v = nodes.filter((n) => keep.has(n.id)) }
    return v
  }, [nodes, links, area, focus])
  const ids = new Set(visible.map((n) => n.id))
  const shownLinks = links.filter((l) => ids.has(l.from) && ids.has(l.to))
  const layout = useMemo(() => {
    // Stories with links read left to right in PERT columns; loose ones wait in a grid underneath, by area.
    const touched = new Set(shownLinks.flatMap((l) => [l.from, l.to]))
    const linked = visible.filter((n) => touched.has(n.id))
    const loose = visible.filter((n) => !touched.has(n.id))
    const col = columns(linked, shownLinks)
    const byCol = new Map<number, StoryNode[]>()
    for (const n of linked) { const c = col.get(n.id) ?? 0; byCol.set(c, [...(byCol.get(c) ?? []), n]) }
    const pos = new Map<string, { x: number; y: number }>()
    let rows = 0
    for (const [c, list] of byCol) {
      list.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.title.localeCompare(b.title))
      list.forEach((n, r) => pos.set(n.id, { x: PAD + c * (W + GX), y: PAD + r * (H + GY) }))
      rows = Math.max(rows, list.length)
    }
    const cols = byCol.size ? Math.max(...[...byCol.keys()].map((c) => c + 1)) : 0
    const pertW = cols ? cols * W + (cols - 1) * GX : 0
    const per = Math.max(3, Math.floor((pertW + GY) / (W + GY)))
    const top = rows ? PAD + rows * (H + GY) + 36 : PAD + 28
    loose.sort((a, b) => (a.capability || '~').localeCompare(b.capability || '~') || STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.title.localeCompare(b.title))
    loose.forEach((n, i) => pos.set(n.id, { x: PAD + (i % per) * (W + GY), y: top + Math.floor(i / per) * (H + GY) }))
    const looseRows = Math.ceil(loose.length / per)
    const width = PAD * 2 + Math.max(pertW, loose.length ? Math.min(per, loose.length) * W + (Math.min(per, loose.length) - 1) * GY : 0, W)
    const height = (loose.length ? top + looseRows * (H + GY) - GY : PAD + rows * (H + GY) - GY) + PAD
    return { pos, width, height, looseTop: loose.length ? top - 26 : -1, looseCount: loose.length, looseStories: loose.filter((n) => n.state !== 'idea').length }
  }, [visible, shownLinks])

  if (!data) return <div data-ui className={PAGE}><PageHeader title="Story map" eyebrow="Story map" headline={<>Drawing how the<br /><em>stories connect…</em></>} description="Drawing how the stories connect…" /></div>

  const unlinked = new Set(data.unlinked)
  const node = (id: string) => nodes.find((n) => n.id === id)
  const sel = node(selected)
  const selLinks = sel ? links.filter((l) => l.from === sel.id || l.to === sel.id) : []
  const suggested = links.filter((l) => l.status === 'suggested')

  const pick = (id: string) => {
    if (!connecting) { setSelected(id === selected ? '' : id); return }
    if (connecting.includes(id)) return
    const next = [...connecting, id]
    setConnecting(next)
  }
  const edgePath = (l: StoryLinkRow) => {
    const a = layout.pos.get(l.from), b = layout.pos.get(l.to)
    if (!a || !b) return ''
    if (l.kind === 'related' || a.x === b.x) {
      // Same column or a plain relation: a soft curve between the boxes' sides.
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x + W, y2 = b.y + H / 2
      if (a.x === b.x) return `M${x1},${y1} C${x1 + 46},${y1} ${x2 + 46},${y2} ${x2},${y2}`
      const [l1, r1] = a.x < b.x ? [a, b] : [b, a]
      return `M${l1.x + W},${l1.y + H / 2} C${l1.x + W + GX / 2},${l1.y + H / 2} ${r1.x - GX / 2},${r1.y + H / 2} ${r1.x},${r1.y + H / 2}`
    }
    // depends on / split from: the arrow runs from what comes first (to) into what needs it (from).
    const sx = b.x + W, sy = b.y + H / 2, ex = a.x, ey = a.y + H / 2
    return `M${sx},${sy} C${sx + GX / 2},${sy} ${ex - GX / 2},${ey} ${ex},${ey}`
  }
  const pair = connecting?.length === 2 ? connecting.map((id) => node(id)!).filter(Boolean) : null

  const suggestLinks = () => void post({ action: 'suggest' }, (r) => r.by === 'jev' ? (r.added ? `Jev suggested ${r.added} link${r.added === 1 ? '' : 's'}, drawn dashed. Accept or dismiss each one.` : 'Jev found no new links worth suggesting.') : `${ASSISTANT_NAME} is looking for links. Its guesses appear here dashed.`)
  const accept = (l: StoryLinkRow) => void post({ action: 'accept', link: l.id }, 'Link accepted')
  const dismiss = (l: StoryLinkRow) => void post({ action: 'dismiss', link: l.id }, `Dismissed. ${ASSISTANT_NAME} won't offer it again.`)
  const LINE: Record<string, string> = { confirmed: 'stroke-primary opacity-75', suggested: 'stroke-warning opacity-70 [stroke-dasharray:5_4]' }

  return <div data-ui className={PAGE}>
    <PageHeader
      title="Story map" eyebrow="Story map · how the work fits together" headline={<>See how the stories<br /><em>connect.</em></>}
      description={<>Read left to right: a story sits after the stories it depends on. Solid lines are links a person made; dashed ones are {ASSISTANT_NAME}’s guesses to accept or dismiss. A story with a warm outline has no links yet.</>}
      actions={<>
        <Button type="button" variant={connecting ? 'secondary' : 'default'} onClick={() => { setConnecting(connecting ? null : []); setSelected('') }} className="gap-1.5"><Link2 className="size-4" /> {connecting ? 'Cancel connecting' : 'Connect two stories'}</Button>
        {!connecting && nodes.length > 1 && <Button type="button" variant="outline" disabled={busy} onClick={suggestLinks} className="gap-1.5"><Sparkles className="size-4" /> Ask {ASSISTANT_NAME} to suggest links</Button>}
      </>}
    />
    <p className="-mt-3 text-sm text-muted-foreground">{nodes.filter((n) => n.state !== 'idea').length} stories · {links.filter((l) => l.status === 'confirmed').length} {links.filter((l) => l.status === 'confirmed').length === 1 ? 'link' : 'links'} · {suggested.length} suggested · {nodes.filter((n) => n.state === 'idea').length} ideas · {data.dismissed} dismissed</p>

    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Section
        title={connecting ? (connecting.length === 0 ? 'Pick the story that comes first' : connecting.length === 1 ? 'Now pick the one that comes after it' : 'How are they linked?') : 'The stories, left to right'}
        description={focus ? `Focused on ${node(focus)?.title ?? ''} and what it touches` : area ? `Area: ${area}` : 'Every story and idea'}
      >
        <div role="group" aria-label="Filter by area" className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
          {focus && <Button type="button" size="sm" variant="secondary" onClick={() => setFocus('')} className="gap-1.5"><X className="size-4" /> Leave focus</Button>}
          <Button type="button" size="sm" variant={!area ? 'secondary' : 'ghost'} aria-pressed={!area} onClick={() => setArea('')}>All areas</Button>
          {areas.slice(0, 8).map((a) => <Button type="button" size="sm" key={a} variant={area === a ? 'secondary' : 'ghost'} aria-pressed={area === a} onClick={() => { setArea(a); setFocus('') }}>{a}</Button>)}
        </div>
        {visible.length > MANY && !focus && !area && <p className="flex items-center gap-2 border-b border-border bg-warning/5 px-5 py-2.5 text-sm text-warning"><Crosshair className="size-4" /> {visible.length} stories is a lot to read at once. Pick a story and press Focus, or choose an area.</p>}
        {nodes.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No stories yet. They appear here as {ASSISTANT_NAME} and the team turn the conversation into board cards; nothing is made up.</p> :
          <div className="max-h-[72vh] overflow-auto">
            <div className="relative min-w-full bg-[radial-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:18px_18px]" style={{ width: layout.width, height: layout.height }}>
              {layout.looseTop >= 0 && <p className="absolute text-xs font-medium tracking-wide text-warning uppercase" style={{ top: layout.looseTop, left: PAD }}>Not linked yet · {layout.looseStories} {layout.looseStories === 1 ? 'story' : 'stories'}{layout.looseCount > layout.looseStories ? ` and ${layout.looseCount - layout.looseStories} of ${ASSISTANT_NAME}’s ideas` : ''}, grouped by area</p>}
              <svg width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
                <defs><marker id="sm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" /></marker></defs>
                {shownLinks.map((l) => <path key={l.id} d={edgePath(l)} fill="none" className={cn('stroke-muted-foreground', LINE[l.status], l.kind === 'split_from' && l.status !== 'suggested' && 'stroke-suggest', sel && (l.from === sel.id || l.to === sel.id) ? '[stroke-width:2.5] opacity-100' : '[stroke-width:1.5]')} markerEnd={l.kind === 'related' ? undefined : 'url(#sm-arrow)'} />)}
              </svg>
              {visible.map((n) => { const p = layout.pos.get(n.id)!; const dashed = n.suggested || n.state === 'idea'; return (
                <button type="button" key={n.id} style={{ left: p.x, top: p.y, width: W, height: H }} aria-pressed={selected === n.id || !!connecting?.includes(n.id)}
                  className={cn('absolute flex flex-col gap-1 overflow-hidden rounded-lg border border-l-[3px] border-white/15 bg-background px-3 py-2 text-left shadow-sm transition hover:-translate-y-px hover:border-primary/50', STATE_BAR[n.state], dashed && 'border-dashed bg-background/50', unlinked.has(n.id) && 'ring-1 ring-warning/50', selected === n.id && 'border-primary bg-primary/10 ring-2 ring-primary/30', connecting?.includes(n.id) && 'border-warning bg-warning/10 ring-2 ring-warning/40')}
                  onClick={() => pick(n.id)} title={n.note || n.title}>
                  <span className={cn('truncate text-xs font-medium', STATE_TEXT[n.state])}>{STATE_LABEL[n.state]}{n.kind !== 'story' && n.kind !== 'recommendation' ? ` · ${n.kind}` : ''}</span>
                  <span className="line-clamp-2 text-sm leading-snug font-semibold">{n.title}</span>
                  <span className="mt-auto truncate text-xs text-muted-foreground">{n.capability || 'No area yet'}</span>
                </button>) })}
            </div>
          </div>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><i className="inline-block w-6 border-t-2 border-primary" /> linked by a person</span>
          <span className="flex items-center gap-2"><i className="inline-block w-6 border-t-2 border-dashed border-warning" /> {ASSISTANT_NAME}’s guess</span>
          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-3.5 rounded-sm border border-border ring-1 ring-warning/60" /> no links yet</span>
          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-3.5 rounded-sm border border-dashed border-warning" /> {ASSISTANT_NAME}’s idea, not a story yet</span>
        </div>
      </Section>

      <aside className="grid min-w-0 grid-cols-1 content-start gap-6">
        {pair && pair.length === 2 ? (
          <Section title="How are they linked?" description="Pick the sentence that reads true.">
            <SectionBody>
              <div role="radiogroup" aria-label="Kind of link" className="grid gap-2">
                {(['depends_on', 'split_from', 'related'] as LinkKind[]).map((k) => <button type="button" role="radio" aria-checked={kind === k} key={k} onClick={() => setKind(k)} className={cn('rounded-lg border px-3 py-2.5 text-left text-sm transition-colors', kind === k ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50')}><span className="font-semibold">{k === 'related' ? pair[0].title : pair[1].title}</span> <span className="text-warning">{LINK_LABEL[k]}</span> <span className="font-semibold">{k === 'related' ? pair[1].title : pair[0].title}</span></button>)}
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConnecting([connecting![1], connecting![0]])} className="justify-self-start gap-1.5 px-2"><ArrowLeftRight className="size-4" /> Swap which comes first</Button>
              <div className="flex items-start gap-2"><Checkbox id="sm-ask" checked={ask} onCheckedChange={(v) => setAsk(!!v)} className="mt-0.5" /><Label htmlFor="sm-ask" className="text-sm font-normal">Ask {ASSISTANT_NAME} two or three questions to firm up the link</Label></div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy} className="gap-1.5" onClick={() => void post({ action: 'connect', from: kind === 'related' ? pair[0].id : pair[1].id, to: kind === 'related' ? pair[1].id : pair[0].id, kind, ask }, ask ? `Linked. ${ASSISTANT_NAME} is asking what firms it up in the conversation.` : 'Linked.').then(() => { setConnecting(null); if (ask) changeView('conversation') })}><Check className="size-4" /> Connect</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConnecting(null)}>Cancel</Button>
              </div>
            </SectionBody>
          </Section>
        ) : sel ? (
          <Section title={sel.title} description={<>{STATE_LABEL[sel.state]}{sel.capability ? ` · ${sel.capability}` : ''}</>} action={<Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={() => setSelected('')}><X className="size-4" /></Button>}>
            <SectionBody>
              {sel.note && <p className="text-sm">{sel.note}</p>}
              {unlinked.has(sel.id) && <p className="flex gap-2 rounded-lg border border-dashed border-warning/40 p-3 text-sm text-warning"><Sparkles className="mt-0.5 size-4 shrink-0" /> No links yet. Is it really on its own, or does it need something, or feed something?</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="gap-1.5" onClick={() => { setFocus(sel.id); setArea('') }}><Crosshair className="size-4" /> Focus on this</Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => { setConnecting([sel.id]); setSelected('') }}><Link2 className="size-4" /> Connect to…</Button>
                <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => changeView(sel.id.startsWith('move:') ? 'pilot' : 'overview')}>Open on the {sel.id.startsWith('move:') ? 'Board' : 'backlog'} <ArrowRight className="size-4" /></Button>
              </div>
            </SectionBody>
            <div className="border-t border-border px-5 pt-3 pb-1 text-sm font-semibold">Links · {selLinks.length}</div>
            {selLinks.length === 0 && <p className="px-5 pb-4 text-sm text-muted-foreground">Nothing linked to this yet.</p>}
            {selLinks.map((l) => { const other = node(l.from === sel.id ? l.to : l.from); const text = l.from === sel.id ? `${LINK_LABEL[l.kind as LinkKind]} ${other?.title}` : `${other?.title} ${LINK_LABEL[l.kind as LinkKind]} this`; return (
              <div key={l.id} className="grid gap-1.5 border-t border-border px-5 py-3">
                <button type="button" onClick={() => setSelected(other?.id ?? '')} className="flex flex-wrap items-center gap-2 text-left text-sm hover:underline"><StatusBadge tone={l.status === 'suggested' ? 'warn' : 'ok'}>{l.status === 'suggested' ? `${ASSISTANT_NAME}’s guess` : 'Linked'}</StatusBadge>{text}</button>
                {l.why && <span className="text-xs text-muted-foreground">{l.why}</span>}
                <div className="flex flex-wrap gap-1">{l.status === 'suggested' ? <><Button type="button" size="sm" variant="ghost" className="gap-1.5 px-2" onClick={() => accept(l)}><Check className="size-4" /> Accept</Button><Button type="button" size="sm" variant="ghost" className="gap-1.5 px-2" onClick={() => dismiss(l)}><X className="size-4" /> Dismiss</Button></> : <Button type="button" size="sm" variant="ghost" className="gap-1.5 px-2" onClick={() => void post({ action: 'remove', link: l.id }, 'Link removed')}><X className="size-4" /> Remove</Button>}</div>
              </div>) })}
          </Section>
        ) : (
          <Section statement={<>Links worth <em>a second look.</em></>} title="Links worth a look" description={`${ASSISTANT_NAME}’s guesses, at most three per story.`} action={<Sparkles className="size-4 text-primary" />}>
            {suggested.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">None waiting. When something changes, {ASSISTANT_NAME} looks for connections you haven’t made and offers the strongest here.</p>}
            {suggested.slice(0, 8).map((l) => (
              <div key={l.id} className="grid gap-1.5 border-b border-border px-5 py-3 last:border-b-0">
                <button type="button" onClick={() => setSelected(l.from)} className="text-left text-sm hover:underline"><span className="font-semibold">{node(l.from)?.title}</span> <span className="text-warning">{LINK_LABEL[l.kind as LinkKind]}</span> <span className="font-semibold">{node(l.to)?.title}</span></button>
                {l.why && <span className="text-xs text-muted-foreground">{l.why}</span>}
                <div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="ghost" className="gap-1.5 px-2" onClick={() => accept(l)}><Check className="size-4" /> Accept</Button><Button type="button" size="sm" variant="ghost" className="gap-1.5 px-2" onClick={() => dismiss(l)}><X className="size-4" /> Dismiss</Button></div>
              </div>
            ))}
            {data.unlinked.length > 0 && <p className="mx-5 my-4 flex gap-2 rounded-lg border border-dashed border-warning/40 p-3 text-sm text-warning"><Sparkles className="mt-0.5 size-4 shrink-0" /> {data.unlinked.length} {data.unlinked.length === 1 ? 'story has' : 'stories have'} no links yet (warm outline). Pick one to see it.</p>}
          </Section>
        )}
      </aside>
    </div>
  </div>
}
