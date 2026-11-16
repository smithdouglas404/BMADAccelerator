// The Story map (Doug, Nov 16): stories and Socra's recommendations laid out like a PERT chart, read
// left to right by what depends on what, with no durations (we don't estimate time). Links are a
// person's (confirmed) or Socra's guesses (suggested, at most 3 per story, never one that was dismissed).
// Pure: no database, so tests load it directly.

export const LINK_KINDS = ["depends_on", "split_from", "related"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LINK_LABEL: Record<LinkKind, string> = { depends_on: "depends on", split_from: "split from", related: "related to" };

export type LinkStatus = "confirmed" | "suggested" | "dismissed";
export type StoryLinkRow = { id: string; from: string; to: string; kind: string; status: string; why: string; by: string; createdAt?: string | Date };

export type StoryState = "idea" | "backlog" | "shaping" | "building" | "review" | "done";
export type StoryNode = {
  id: string; // move:<id> or backlog:<id>
  title: string;
  capability: string;
  state: StoryState;
  /** A recommendation Socra made that nobody has taken on yet: drawn dashed, like a suggested link. */
  suggested: boolean;
  kind: string; // story | epic | task | workflow | recommendation
  note: string;
};

export const MAX_SUGGESTED_PER_STORY = 3;

const MOVE_STATE: Record<string, StoryState> = { queued: "backlog", ready: "shaping", building: "building", review: "review", done: "done" };

/** Board cards become stories; Socra's open recommendations become dashed idea nodes. */
export function storyNodes(
  moves: { id: string; title: string; capability: string; status: string; hidden: string; prompt?: string; decision?: string }[],
  backlog: { id: string; title: string; note: string; group: string; recKind: string; state: string; kind: string }[],
): StoryNode[] {
  const stories: StoryNode[] = moves.map((m) => ({ id: `move:${m.id}`, title: m.title, capability: m.capability, state: MOVE_STATE[m.status] ?? "backlog", suggested: false, kind: m.hidden || "story", note: m.decision || m.prompt || "" }));
  const ideas: StoryNode[] = backlog
    .filter((b) => b.recKind && b.kind !== "distraction" && !["built", "parked", "rejected", "withdrawn"].includes(b.state))
    .map((b) => ({ id: `backlog:${b.id}`, title: b.title, capability: b.group, state: "idea" as const, suggested: b.state === "suggested", kind: "recommendation", note: b.note }));
  return [...stories, ...ideas];
}

/** Links that count on the map: confirmed and suggested ones between nodes that still exist. */
export function liveLinks(links: StoryLinkRow[], nodes: { id: string }[]) {
  const ids = new Set(nodes.map((n) => n.id));
  return links.filter((l) => l.status !== "dismissed" && ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
}

/**
 * Whether Socra may suggest this link: not a self-link, not one that exists in any state (a dismissed
 * one is never offered again, in either direction for "related"), and neither end already carries the
 * maximum number of suggestions.
 */
export function maySuggest(all: StoryLinkRow[], from: string, to: string, kind: LinkKind): { ok: true } | { ok: false; why: string } {
  if (from === to) return { ok: false, why: "A story can't link to itself." };
  const same = (l: StoryLinkRow) => l.kind === kind && ((l.from === from && l.to === to) || (kind === "related" && l.from === to && l.to === from));
  const prior = all.find(same);
  if (prior?.status === "dismissed") return { ok: false, why: "A person dismissed this link before; don't offer it again." };
  if (prior) return { ok: false, why: prior.status === "confirmed" ? "That link is already confirmed." : "That link is already suggested." };
  const count = (id: string) => all.filter((l) => l.status === "suggested" && (l.from === id || l.to === id)).length;
  if (count(from) >= MAX_SUGGESTED_PER_STORY || count(to) >= MAX_SUGGESTED_PER_STORY) return { ok: false, why: `Each story carries at most ${MAX_SUGGESTED_PER_STORY} suggested links; offer only the strongest.` };
  return { ok: true };
}

/**
 * PERT-style columns: a story sits one column right of everything it depends on, and one right of the
 * story it was split from. Related links don't move anything. Cycles are broken by ignoring the link
 * that closes them, so the layout always finishes.
 */
export function columns(nodes: { id: string }[], links: StoryLinkRow[]): Map<string, number> {
  const before = new Map<string, string[]>(); // id -> ids that must sit left of it
  for (const n of nodes) before.set(n.id, []);
  for (const l of links) {
    if (l.kind === "depends_on" && before.has(l.from) && before.has(l.to)) before.get(l.from)!.push(l.to);
    if (l.kind === "split_from" && before.has(l.from) && before.has(l.to)) before.get(l.from)!.push(l.to);
  }
  const col = new Map<string, number>();
  const visiting = new Set<string>();
  const place = (id: string): number => {
    if (col.has(id)) return col.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const c = Math.max(-1, ...before.get(id)!.map(place)) + 1;
    visiting.delete(id);
    col.set(id, c);
    return c;
  };
  for (const n of nodes) place(n.id);
  return col;
}

/** Stories with no link at all: the gaps worth a look. Ideas aren't counted; they are loose on purpose. */
export function unlinked(nodes: StoryNode[], links: StoryLinkRow[]) {
  const touched = new Set(links.flatMap((l) => [l.from, l.to]));
  return nodes.filter((n) => !n.id.startsWith("backlog:") && !touched.has(n.id)).map((n) => n.id);
}

/** Focus mode: one story and everything one link away. */
export function neighbourhood(id: string, links: StoryLinkRow[]) {
  const keep = new Set([id]);
  for (const l of links) {
    if (l.from === id) keep.add(l.to);
    if (l.to === id) keep.add(l.from);
  }
  return keep;
}

/** What a person says to Socra when they connect two stories, so it firms up the link with questions. */
export function connectPrompt(a: string, b: string, kind: LinkKind) {
  return `I think “${a}” and “${b}” are linked: “${a}” ${LINK_LABEL[kind]} “${b}”. Ask me two or three short questions to firm up how they connect (what one needs from the other, what happens at the hand-off, and anything that would break if one changes), one at a time, and turn my answers into requirements.`;
}

/** What a person says when they ask Socra to look for links now (Socra otherwise looks only when something changes). */
export function suggestPrompt() {
  return `Look across the stories on the Story map and suggest the links you are most sure of with link_stories: what depends on what, what was split from what, what is related. At most ${MAX_SUGGESTED_PER_STORY} per story, each with a one-line why, never one a person dismissed. Then tell me in a sentence or two which gaps stand out.`;
}
