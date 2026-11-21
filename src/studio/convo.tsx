'use client'

// The conversation, filtered by who is talking or grouped into threads (Doug, Nov 21). The full list stays the
// default; every name on the filter comes from who actually spoke.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ListTree, Rows3, X } from 'lucide-react'
import { exchangeOf, filterSummary, saidBy, speakers, threadsOf, type ConvoMsg } from '@/lib/studio/convoFilter'

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** "9 messages in 1 conversation; 1 of them from the Product engineer": the list below has exactly this. */
function summaryLine(list: ConvoMsg[], who: string[], people: { key: string; name: string }[]) {
  const s = filterSummary(list, who)
  const names = who.map((k) => people.find((p) => p.key === k)?.name ?? k)
  const from = names.length === 1 ? (names[0] === 'You' ? 'you' : names[0]) : names.join(' and ')
  return `${plural(s.messages, 'message')} in ${plural(s.conversations, 'conversation')}; ${s.own} of them from ${from}, the rest is the conversation around ${s.own === 1 ? 'it' : 'them'}.`
}

export function ConvoFilterBar<T extends ConvoMsg>({ list, who, setWho, layout, setLayout, shown }: { list: T[]; who: string[]; setWho: (w: string[]) => void; layout?: Layout; setLayout?: (l: Layout) => void; shown: number }) {
  const people = useMemo(() => speakers(list), [list])
  if (people.length < 2) return null
  const toggle = (k: string) => setWho(who.includes(k) ? who.filter((x) => x !== k) : [...who, k])
  return <div className="studio-convo-filter" role="group" aria-label="Filter the conversation">
    <div className="studio-convo-chips">
      <button type="button" className={`studio-convo-chip ${who.length === 0 ? 'is-on' : ''}`} onClick={() => setWho([])} aria-pressed={who.length === 0}>Everyone <small>{list.length}</small></button>
      {people.map((p) => <button key={p.key} type="button" className={`studio-convo-chip ${p.kind} ${who.includes(p.key) ? 'is-on' : ''}`} onClick={() => toggle(p.key)} aria-pressed={who.includes(p.key)} title={`${p.count} message${p.count === 1 ? '' : 's'}: every conversation ${p.name === 'You' ? 'you' : p.name} took part in, read whole (who else spoke, what was said to ${p.kind === 'person' ? 'them' : 'it'}, and the replies). ${p.name === 'You' ? 'Yours are' : 'Theirs are'} marked; the rest is the conversation around them. Pick more than one to combine.`}>{p.name} <small>{p.count}</small></button>)}
    </div>
    <div className="studio-convo-tools">
      {who.length > 0 && <span className="studio-muted">{summaryLine(list, who, people)} <button type="button" className="text-button" onClick={() => setWho([])}><X size={12} /> Clear</button></span>}
      {setLayout && <span className="studio-convo-layout" role="group" aria-label="How to show it">
        <button type="button" className={layout === 'list' ? 'is-on' : ''} aria-pressed={layout === 'list'} onClick={() => setLayout('list')} title="Everything in the order it was said"><Rows3 size={13} /> In order</button>
        <button type="button" className={layout === 'threads' ? 'is-on' : ''} aria-pressed={layout === 'threads'} onClick={() => setLayout('threads')} title="Each statement with its replies under it, latest first"><ListTree size={13} /> By thread</button>
      </span>}
    </div>
  </div>
}

/** With a filter on, the chosen speakers' own messages are marked and the conversation around them is quieter. */
function Said({ on, mine, children }: { on: boolean; mine: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>
  return <div className={mine ? 'studio-convo-said' : 'studio-convo-context'}>{children}</div>
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
      ? shown.map((m) => <Said key={m.id} on={who.length > 0} mine={saidBy(m, who)}>{render(m, false)}</Said>)
      : threadsOf(shown).map((t) => <div key={t.root.id} className="studio-convo-thread">
          <Said on={who.length > 0} mine={saidBy(t.root, who)}>{render(t.root, false)}</Said>
          {t.replies.length > 0 && <div className="studio-convo-replies">{t.replies.map((m) => <Said key={m.id} on={who.length > 0} mine={saidBy(m, who)}>{render(m, true)}</Said>)}</div>}
        </div>)}
  </>
}
