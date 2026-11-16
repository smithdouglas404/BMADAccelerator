'use client'
// The Story map (Doug, Nov 16): every story and Socra's open ideas, read left to right like a PERT chart
// by what depends on what, with no durations. Solid lines are links a person made or accepted; dashed
// ones are Socra's guesses to accept or dismiss. Stories with no link stand out. Pick two stories to
// connect them and Socra asks the questions that firm up the link. Built from the team's classes; the
// new ones are in studio-extras.css.
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Crosshair, GitBranch, Link2, Sparkles, X } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { LINK_LABEL, columns, neighbourhood, type LinkKind, type StoryLinkRow, type StoryNode } from '@/lib/studio/storymap'
import { api, type Live } from './live'
import type { Me, StudioView } from './flow'

type MapData = { nodes: StoryNode[]; links: StoryLinkRow[]; unlinked: string[]; dismissed: number }

const STATE_LABEL: Record<StoryNode['state'], string> = { idea: `${ASSISTANT_NAME}'s idea`, backlog: 'Backlog', shaping: 'Ready to shape', building: 'Being built', review: 'Human review', done: 'Done' }
const STATE_ORDER: StoryNode['state'][] = ['done', 'review', 'building', 'shaping', 'backlog', 'idea']
const W = 214, H = 88, GX = 86, GY = 16, PAD = 18
const MANY = 40

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
  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true)
    try { await api(`/api/use-cases/${live.id}/story-map`, { json: { ...body, author } }); setToast(ok); setTick((t) => t + 1) }
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

  if (!data) return <div className="page-wrap storymap-page"><div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Story map</p><h1>Drawing how the<br /><em>stories connect…</em></h1></div></div></div>

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

  return <div className="page-wrap storymap-page">
    <div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Story map · how the work fits together</p><h1>See how the stories<br /><em>connect.</em></h1><p>Read left to right: a story sits after the stories it depends on. Solid lines are links a person made; dashed ones are {ASSISTANT_NAME}’s guesses for you to accept or dismiss. A story with a warm outline has no links yet. Pick two stories to connect them and {ASSISTANT_NAME} asks what firms up the link.</p></div>
      <div className="intro-actions"><button className="button button-primary" type="button" onClick={() => { setConnecting(connecting ? null : []); setSelected('') }}><Link2 size={16} /> {connecting ? 'Cancel connecting' : 'Connect two stories'}</button>{!connecting && nodes.length > 1 && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void post({ action: 'suggest' }, `${ASSISTANT_NAME} is looking for links. Its guesses appear here dashed.`)}><Sparkles size={16} /> Ask {ASSISTANT_NAME} to suggest links</button>}<span>{nodes.filter((n) => n.state !== 'idea').length} stories · {links.filter((l) => l.status === 'confirmed').length} links · {suggested.length} suggested · {nodes.filter((n) => n.state === 'idea').length} ideas</span></div></div>

    <div className="storymap-layout">
      <section className="truth-graph-card storymap-card">
        <div className="truth-card-heading"><div><p className="eyebrow">{focus ? `Focus · ${node(focus)?.title ?? ''}` : area ? `Area · ${area}` : 'Every story'}</p><h2>{connecting ? (connecting.length === 0 ? 'Pick the first story' : connecting.length === 1 ? 'Now pick the second story' : 'How are they linked?') : 'The stories, left to right'}</h2></div>
          <div className="truth-filters">
            {focus && <button type="button" className="is-active" onClick={() => setFocus('')}><X size={11} /> Leave focus</button>}
            <button type="button" className={!area ? 'is-active' : ''} onClick={() => setArea('')}>All areas</button>
            {areas.slice(0, 8).map((a) => <button type="button" key={a} className={area === a ? 'is-active' : ''} onClick={() => { setArea(a); setFocus('') }}>{a}</button>)}
          </div></div>
        {visible.length > MANY && !focus && !area && <p className="storymap-hint"><Crosshair size={13} /> {visible.length} stories is a lot to read at once. Pick a story and press Focus, or choose an area above.</p>}
        {nodes.length === 0 ? <p className="studio-muted">No stories yet. They appear here as {ASSISTANT_NAME} and the team turn the conversation into board cards; nothing is made up.</p> :
          <div className="storymap-scroll"><div className="storymap-canvas" style={{ width: layout.width, height: layout.height }}>
            {layout.looseTop >= 0 && <p className="storymap-loose-label" style={{ top: layout.looseTop, left: PAD }}>Not linked yet · {layout.looseStories} {layout.looseStories === 1 ? 'story' : 'stories'}{layout.looseCount > layout.looseStories ? ` and ${layout.looseCount - layout.looseStories} of ${ASSISTANT_NAME}’s ideas` : ''}, grouped by area</p>}
            <svg width={layout.width} height={layout.height} className="storymap-lines" aria-hidden="true">
              <defs><marker id="sm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
              {shownLinks.map((l) => <path key={l.id} d={edgePath(l)} className={`sm-line is-${l.status} is-${l.kind} ${sel && (l.from === sel.id || l.to === sel.id) ? 'is-hot' : ''}`} markerEnd={l.kind === 'related' ? undefined : 'url(#sm-arrow)'} />)}
            </svg>
            {visible.map((n) => { const p = layout.pos.get(n.id)!; return (
              <button type="button" key={n.id} style={{ left: p.x, top: p.y, width: W, height: H }}
                className={`sm-node is-${n.state} ${n.suggested || n.state === 'idea' ? 'is-suggested' : ''} ${unlinked.has(n.id) ? 'is-unlinked' : ''} ${selected === n.id ? 'is-selected' : ''} ${connecting?.includes(n.id) ? 'is-picked' : ''}`}
                onClick={() => pick(n.id)} title={n.note || n.title}>
                <span className="sm-state">{STATE_LABEL[n.state]}{n.kind !== 'story' && n.kind !== 'recommendation' ? ` · ${n.kind}` : ''}</span>
                <strong>{n.title}</strong>
                <small>{n.capability || 'No area yet'}</small>
              </button>) })}
          </div></div>}
        <div className="truth-graph-footer storymap-legend"><span><i className="sm-key is-confirmed" /> linked by a person</span><span><i className="sm-key is-suggested" /> {ASSISTANT_NAME}’s guess</span><span><i className="sm-box is-unlinked" /> no links yet</span><span><i className="sm-box is-idea" /> {ASSISTANT_NAME}’s idea, not a story yet</span><span>{data.dismissed} dismissed (never offered again)</span></div>
      </section>

      <aside className="truth-detail-column">
        {pair && pair.length === 2 ? <section className="truth-detail-card"><div className="truth-card-heading"><div><p className="eyebrow">Connect two stories</p><h3>How are they linked?</h3></div><GitBranch size={15} /></div>
          <div className="sm-kinds">{(['depends_on', 'split_from', 'related'] as LinkKind[]).map((k) => <button type="button" key={k} className={kind === k ? 'is-active' : ''} onClick={() => setKind(k)}><strong>{pair[0].title}</strong> <em>{LINK_LABEL[k]}</em> <strong>{pair[1].title}</strong></button>)}</div>
          <button type="button" className="sm-swap text-button" onClick={() => setConnecting([connecting![1], connecting![0]])}>Swap the order <ArrowRight size={12} /></button>
          <label className="sm-ask"><input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} /> Ask {ASSISTANT_NAME} two or three questions to firm up the link</label>
          <div className="truth-detail-actions"><button className="button button-primary button-small" type="button" disabled={busy} onClick={() => void post({ action: 'connect', from: pair[0].id, to: pair[1].id, kind, ask }, ask ? `Linked. ${ASSISTANT_NAME} is asking what firms it up in the conversation.` : 'Linked.').then(() => { setConnecting(null); if (ask) changeView('conversation') })}><Check size={13} /> Connect</button><button className="button button-quiet button-small" type="button" onClick={() => setConnecting(null)}>Cancel</button></div>
        </section>
        : sel ? <section className="truth-detail-card"><div className="truth-card-heading"><div><p className="eyebrow">{STATE_LABEL[sel.state]}{sel.capability ? ` · ${sel.capability}` : ''}</p><h3>{sel.title}</h3></div></div>
          {sel.note && <p className="truth-detail-copy">{sel.note}</p>}
          {unlinked.has(sel.id) && <p className="sm-gap"><Sparkles size={13} /> No links yet. Is it really on its own, or does it need something, or feed something?</p>}
          <div className="truth-edge-list"><span className="eyebrow">Links · {selLinks.length}</span>
            {selLinks.map((l) => { const other = node(l.from === sel.id ? l.to : l.from); const text = l.from === sel.id ? `${LINK_LABEL[l.kind as LinkKind]} ${other?.title}` : `${other?.title} ${LINK_LABEL[l.kind as LinkKind]} this`; return (
              <div className={`sm-link is-${l.status}`} key={l.id}><button type="button" onClick={() => setSelected(other?.id ?? '')}><span className="truth-edge-relation">{l.status === 'suggested' ? `${ASSISTANT_NAME}’s guess` : 'linked'}</span><span>{text}</span></button>
                {l.why && <small>{l.why}</small>}
                <div>{l.status === 'suggested' ? <><button type="button" className="text-button" onClick={() => void post({ action: 'accept', link: l.id }, 'Link accepted')}><Check size={12} /> Accept</button><button type="button" className="text-button" onClick={() => void post({ action: 'dismiss', link: l.id }, `Dismissed. ${ASSISTANT_NAME} won't offer it again.`)}><X size={12} /> Dismiss</button></> : <button type="button" className="text-button" onClick={() => void post({ action: 'remove', link: l.id }, 'Link removed')}><X size={12} /> Remove</button>}</div>
              </div>) })}
            {selLinks.length === 0 && <small className="studio-muted">Nothing linked to this yet.</small>}
          </div>
          <div className="truth-detail-actions"><button className="button button-primary button-small" type="button" onClick={() => { setFocus(sel.id); setArea('') }}><Crosshair size={13} /> Focus on this</button><button className="button button-quiet button-small" type="button" onClick={() => { setConnecting([sel.id]); setSelected('') }}><Link2 size={13} /> Connect to…</button><button className="text-button" type="button" onClick={() => changeView(sel.id.startsWith('move:') ? 'pilot' : 'overview')}>Open on the {sel.id.startsWith('move:') ? 'Board' : 'backlog'} <ArrowRight size={12} /></button></div>
        </section>
        : <section className="truth-detail-card"><div className="truth-card-heading"><div><p className="eyebrow">{ASSISTANT_NAME}’s guesses</p><h3>Links worth a look</h3></div><Sparkles size={15} /></div>
          {suggested.length === 0 ? <p className="truth-detail-copy">None waiting. When something changes, {ASSISTANT_NAME} looks for connections you haven’t made and offers the strongest here, at most three per story.</p> :
            <div className="truth-edge-list">{suggested.slice(0, 8).map((l) => <div className="sm-link is-suggested" key={l.id}><button type="button" onClick={() => setSelected(l.from)}><span>{node(l.from)?.title} <em>{LINK_LABEL[l.kind as LinkKind]}</em> {node(l.to)?.title}</span></button>{l.why && <small>{l.why}</small>}<div><button type="button" className="text-button" onClick={() => void post({ action: 'accept', link: l.id }, 'Link accepted')}><Check size={12} /> Accept</button><button type="button" className="text-button" onClick={() => void post({ action: 'dismiss', link: l.id }, `Dismissed. ${ASSISTANT_NAME} won't offer it again.`)}><X size={12} /> Dismiss</button></div></div>)}</div>}
          {data.unlinked.length > 0 && <p className="sm-gap"><Sparkles size={13} /> {data.unlinked.length} {data.unlinked.length === 1 ? 'story has' : 'stories have'} no links yet (warm outline). Pick one to see it.</p>}
        </section>}
      </aside>
    </div>
  </div>
}
