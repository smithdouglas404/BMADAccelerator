// Who said what, for filtering the conversation (Doug, Nov 21): pick people and agents and see only their
// exchange, or see the conversation grouped into threads. Speakers come only from the messages themselves.

export type ConvoMsg = { id: string; role: string; label: string; replyTo?: string; addressed?: string; specialist?: string }
export type Speaker = { key: string; name: string; kind: 'person' | 'agent' | 'signal'; count: number }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The speaker of a message: a person by name, an agent by its specialist key (or its name), or the Studio's signals. */
export function speakerOf(m: ConvoMsg): Omit<Speaker, 'count'> {
  const name = m.label.split(' · ')[0].trim() || m.label
  if (m.role === 'user') return { key: `person:${slug(name)}`, name, kind: 'person' }
  if (m.role === 'signal') return { key: 'signal', name: 'Studio signals', kind: 'signal' }
  return { key: m.specialist || slug(name), name, kind: 'agent' }
}

/** Everyone who spoke: people first, then agents in the order they first spoke. */
export function speakers(list: ConvoMsg[]): Speaker[] {
  const seen = new Map<string, Speaker>()
  for (const m of list) {
    const s = speakerOf(m)
    const had = seen.get(s.key)
    if (had) had.count++
    else seen.set(s.key, { ...s, count: 1 })
  }
  const rank = { person: 0, agent: 1, signal: 2 }
  return [...seen.values()].sort((a, b) => rank[a.kind] - rank[b.kind])
}

/**
 * The exchange of the chosen speakers: what they said, what answered them, what they answered, and what a
 * person addressed to a chosen agent. Nothing chosen: everything.
 */
export function exchangeOf<T extends ConvoMsg>(list: T[], chosen: string[]): T[] {
  if (!chosen.length) return list
  const pick = new Set(chosen)
  const by = new Map(list.map((m) => [m.id, speakerOf(m).key]))
  const keep = new Set<string>()
  for (const m of list) {
    const who = by.get(m.id)!
    if (pick.has(who) || (m.addressed && pick.has(m.addressed))) keep.add(m.id)
    else if (m.replyTo && pick.has(by.get(m.replyTo) ?? '')) keep.add(m.id)
  }
  // What a chosen speaker answered.
  for (const m of list) if (keep.has(m.id) && pick.has(by.get(m.id)!) && m.replyTo) keep.add(m.replyTo)
  return list.filter((m) => keep.has(m.id))
}

/** The conversation as threads: each message under the one it answers, threads with the latest activity first. */
export function threadsOf<T extends ConvoMsg>(list: T[]): { root: T; replies: T[] }[] {
  const byId = new Map(list.map((m) => [m.id, m]))
  const rootOf = (m: T): T => {
    let cur = m
    for (let i = 0; i < 50 && cur.replyTo && byId.has(cur.replyTo); i++) cur = byId.get(cur.replyTo)!
    return cur
  }
  const groups = new Map<string, { root: T; replies: T[]; last: number }>()
  list.forEach((m, i) => {
    const r = rootOf(m)
    const g = groups.get(r.id) ?? { root: r, replies: [], last: i }
    if (m.id !== r.id) g.replies.push(m)
    g.last = Math.max(g.last, i)
    groups.set(r.id, g)
  })
  return [...groups.values()].sort((a, b) => b.last - a.last).map(({ root, replies }) => ({ root, replies }))
}
