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

/** The conversations: what a person said and everything the team said after it, until the person spoke again. */
function roundsOf<T extends ConvoMsg>(list: T[]): T[][] {
  const rounds: T[][] = []
  for (const m of list) {
    if (m.role === 'user' || !rounds.length) rounds.push([])
    rounds[rounds.length - 1].push(m)
  }
  return rounds
}

/** Who took part in a conversation: who spoke, who was addressed, and whose statement was replied to. */
function takingPart<T extends ConvoMsg>(round: T[], by: Map<string, string>): Set<string> {
  const who = new Set<string>()
  for (const m of round) {
    who.add(by.get(m.id)!)
    if (m.addressed) who.add(m.addressed)
    if (m.replyTo && by.has(m.replyTo)) who.add(by.get(m.replyTo)!)
  }
  return who
}

/**
 * Everyone who spoke, people first, then agents as they first spoke. Each one's count is exactly the number of
 * messages picking them shows (Doug, Nov 21: the chip said 1 and a whole list appeared under it), so the number
 * on a chip, the "x of N" line and the list always agree.
 */
export function speakers(list: ConvoMsg[]): Speaker[] {
  const seen = new Map<string, Speaker>()
  for (const m of list) {
    const s = speakerOf(m)
    if (!seen.has(s.key)) seen.set(s.key, { ...s, count: 0 })
  }
  for (const s of seen.values()) s.count = exchangeOf(list, [s.key]).length
  const rank = { person: 0, agent: 1, signal: 2 }
  return [...seen.values()].sort((a, b) => rank[a.kind] - rank[b.kind])
}

/**
 * Every conversation the chosen speakers took part in (Doug, Nov 21), read whole: a conversation is what a person
 * said and everything the team said after it until the person spoke again (Socra and the specialists talking to
 * each other included). It is kept when a chosen speaker spoke in it, was addressed, or was replied to; the
 * statement a reply answers comes along too. Nothing chosen: everything.
 */
export function exchangeOf<T extends ConvoMsg>(list: T[], chosen: string[]): T[] {
  if (!chosen.length) return list
  const pick = new Set(chosen)
  const by = new Map(list.map((m) => [m.id, speakerOf(m).key]))
  const keep = new Set<string>()
  for (const r of roundsOf(list)) {
    if (![...takingPart(r, by)].some((k) => pick.has(k))) continue
    for (const m of r) {
      keep.add(m.id)
      if (m.replyTo && by.has(m.replyTo)) keep.add(m.replyTo)
    }
  }
  return list.filter((m) => keep.has(m.id))
}

/** What a filter shows, in words people can check against the list: messages, the conversations they make, and how many the chosen said. */
export function filterSummary(list: ConvoMsg[], chosen: string[]) {
  const shown = exchangeOf(list, chosen)
  const ids = new Set(shown.map((m) => m.id))
  const conversations = roundsOf(list).filter((r) => r.some((m) => ids.has(m.id))).length
  const own = shown.filter((m) => saidBy(m, chosen)).length
  return { messages: shown.length, conversations, own }
}

/** Whether a message was said by one of the chosen (the rest of a listed conversation is its context). */
export function saidBy(m: ConvoMsg, chosen: string[]): boolean {
  return !chosen.length || chosen.includes(speakerOf(m).key)
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
