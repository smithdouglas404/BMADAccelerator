'use client'

// The conversation, filtered by who is talking or grouped into threads (Doug, Nov 21). The full list stays the
// default; every name on the filter comes from who actually spoke.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ListTree, Rows3, X } from 'lucide-react'
import { exchangeOf, speakers, threadsOf, type ConvoMsg } from '@/lib/studio/convoFilter'

type Layout = 'list' | 'threads'
const store = (k: string) => { try { return window.localStorage.getItem(k) } catch { return null } }
const save = (k: string, v: string) => { try { window.localStorage.setItem(k, v) } catch { /* private window */ } }

export function useConvoFilter(scope: string) {
  const [who, setWho] = useState<string[]>([])
  const [layout, setLayout] = useState<Layout>('list')
  useEffect(() => {
    const w = store(`studio-convo-who:${scope}`); const l = store('studio-convo-layout')
    if (w) setWho(w.split(',').filter(Boolean))
    if (l === 'threads' || l === 'list') setLayout(l)
  }, [scope])
  const pickWho = (next: string[]) => { setWho(next); save(`studio-convo-who:${scope}`, next.join(',')) }
  const pickLayout = (next: Layout) => { setLayout(next); save('studio-convo-layout', next) }
  return { who, setWho: pickWho, layout, setLayout: pickLayout }
}

export function ConvoFilterBar<T extends ConvoMsg>({ list, who, setWho, layout, setLayout, shown }: { list: T[]; who: string[]; setWho: (w: string[]) => void; layout?: Layout; setLayout?: (l: Layout) => void; shown: number }) {
  const people = useMemo(() => speakers(list), [list])
  if (people.length < 2) return null
  const toggle = (k: string) => setWho(who.includes(k) ? who.filter((x) => x !== k) : [...who, k])
  return <div className="studio-convo-filter" role="group" aria-label="Filter the conversation">
    <div className="studio-convo-chips">
      <button type="button" className={`studio-convo-chip ${who.length === 0 ? 'is-on' : ''}`} onClick={() => setWho([])} aria-pressed={who.length === 0}>Everyone <small>{list.length}</small></button>
      {people.map((p) => <button key={p.key} type="button" className={`studio-convo-chip ${p.kind} ${who.includes(p.key) ? 'is-on' : ''}`} onClick={() => toggle(p.key)} aria-pressed={who.includes(p.key)} title={`Every conversation ${p.name === 'You' ? 'you' : p.name} took part in (${p.count}), read whole: who else spoke, what was said to ${p.kind === 'person' ? 'them' : 'it'}, and the replies. Pick more than one to combine.`}>{p.name} <small>{p.count}</small></button>)}
    </div>
    <div className="studio-convo-tools">
      {who.length > 0 && <span className="studio-muted">{shown} of {list.length} <button type="button" className="text-button" onClick={() => setWho([])}><X size={12} /> Clear</button></span>}
      {setLayout && <span className="studio-convo-layout" role="group" aria-label="How to show it">
        <button type="button" className={layout === 'list' ? 'is-on' : ''} aria-pressed={layout === 'list'} onClick={() => setLayout('list')} title="Everything in the order it was said"><Rows3 size={13} /> In order</button>
        <button type="button" className={layout === 'threads' ? 'is-on' : ''} aria-pressed={layout === 'threads'} onClick={() => setLayout('threads')} title="Each statement with its replies under it, latest first"><ListTree size={13} /> By thread</button>
      </span>}
    </div>
  </div>
}

/** The conversation stream, filtered, as one list or as threads. */
export function ConversationStream<T extends ConvoMsg>({ messages, scope, render }: { messages: T[]; scope: string; render: (m: T, nested: boolean) => ReactNode }) {
  const f = useConvoFilter(scope)
  // A name that no longer speaks here (another product, or old settings) is dropped.
  const keys = useMemo(() => new Set(speakers(messages).map((s) => s.key)), [messages])
  const who = f.who.filter((k) => keys.has(k))
  const shown = useMemo(() => exchangeOf(messages, who), [messages, who])
  return <>
    <ConvoFilterBar list={messages} who={who} setWho={f.setWho} layout={f.layout} setLayout={f.setLayout} shown={shown.length} />
    {shown.length === 0 && <p className="studio-muted studio-convo-empty">Nothing from them yet.</p>}
    {f.layout === 'list'
      ? shown.map((m) => <Fragment key={m.id}>{render(m, false)}</Fragment>)
      : threadsOf(shown).map((t) => <div key={t.root.id} className="studio-convo-thread">
          {render(t.root, false)}
          {t.replies.length > 0 && <div className="studio-convo-replies">{t.replies.map((m) => <Fragment key={m.id}>{render(m, true)}</Fragment>)}</div>}
        </div>)}
  </>
}
