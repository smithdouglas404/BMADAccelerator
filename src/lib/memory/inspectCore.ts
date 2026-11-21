/**
 * Settings > Agent memory (Doug, Nov 21): click an agent, see what Letta and Mem0 really hold for it,
 * and read a plain-language narrative of what it means. Pure functions only (no network, no key):
 * the agent references, the scopes the shared agent service writes under, the numbered records the
 * narrative is built from, and the check that every narrative sentence cites a real record.
 *
 * Nothing on the page is written in advance: every line comes from a Letta block, a Letta passage or a
 * Mem0 record, and the narrative is the document model's reading of exactly those records.
 */

/** Socra's own team keeps its working mind in Letta agents "bacc-<role>" and its facts in Mem0 agent "studio-<role>". */
export type AgentRef = { kind: "studio"; role: string } | { kind: "app"; useCaseId: string; key: string };

export function refString(r: AgentRef): string {
  return r.kind === "studio" ? `studio:${r.role}` : `app:${r.useCaseId}:${r.key}`;
}

export function parseRef(s: string): AgentRef | null {
  const p = (s ?? "").split(":");
  if (p[0] === "studio" && p.length === 2 && /^[a-z][a-z0-9_-]{0,40}$/.test(p[1])) return { kind: "studio", role: p[1] };
  if (p[0] === "app" && p.length === 3 && /^[A-Za-z0-9_-]{1,64}$/.test(p[1]) && /^[a-z][a-z0-9-]{1,47}$/.test(p[2])) return { kind: "app", useCaseId: p[1], key: p[2] };
  return null;
}

/**
 * The Mem0 user_id the shared agent service files an app agent's facts under: one space per customer
 * and use case. Must match memoryScope in agent-service/src/config.ts (tested in tests/memoryview.test.mjs).
 */
export function serviceMemoryScope(useCase: string, customer = "") {
  const c = customer.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${c || "workspace"}:${useCase}`;
}

/** The prefix of the Letta agents the service keeps for one app agent, one per person (lettaName in its config). */
export function serviceLettaPrefix(useCase: string, key: string) {
  return `svc-${useCase}-${key}-`;
}

/** The person a service Letta agent remembers, from its name. */
export function personFromLettaName(name: string, useCase: string, key: string) {
  const p = serviceLettaPrefix(useCase, key);
  return name.startsWith(p) ? name.slice(p.length) : name;
}

export type Block = { id?: string; label: string; value: string; description?: string | null; limit?: number | null; updated_at?: string | null; read_only?: boolean | null };
export type Passage = { id: string; text: string; created_at?: string | null };
export type Fact = {
  id: string;
  memory: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  user_id?: string | null;
  agent_id?: string | null;
  run_id?: string | null;
};

/** Mem0's list answer comes as {results: [...]} or as a bare list depending on the server version. */
export function factRows(r: unknown): Fact[] {
  const rows = Array.isArray(r) ? r : ((r as { results?: unknown[] } | null)?.results ?? []);
  return (rows as Fact[]).filter((f) => f && typeof f.id === "string" && typeof f.memory === "string");
}

const md = (f: Fact) => (f.metadata ?? {}) as Record<string, unknown>;
const customerKey = (c: unknown) => String(c ?? "").trim().toLowerCase();

/**
 * The Studio team's Mem0 records span every product, so the page keeps customers apart: with a use case
 * chosen only that use case's records show; with a customer chosen only that customer's.
 */
export function filterFacts(facts: Fact[], opts: { useCaseId?: string; customer?: string; q?: string }): Fact[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return facts
    .filter((f) => !opts.useCaseId || md(f).use_case === opts.useCaseId)
    .filter((f) => opts.customer === undefined || opts.customer === "" || customerKey(md(f).customer) === customerKey(opts.customer))
    .filter((f) => !q || f.memory.toLowerCase().includes(q) || JSON.stringify(md(f)).toLowerCase().includes(q))
    .sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")));
}

/** What a fact is, where it came from and which product, from the labels the Studio writes (contract.ts). */
export function factLabels(f: Fact) {
  const m = md(f);
  return {
    kind: typeof m.kind === "string" ? m.kind : "",
    source: typeof m.source === "string" ? m.source : typeof m.app_id === "string" ? m.app_id : "",
    useCase: typeof m.use_case_title === "string" ? m.use_case_title : "",
    useCaseId: typeof m.use_case === "string" ? m.use_case : "",
    customer: typeof m.customer === "string" ? m.customer : "",
    confidence: typeof m.confidence === "number" ? m.confidence : null,
    run: typeof m.run === "string" ? m.run : "",
  };
}

/** One numbered record the narrative may cite: B = a Letta block, P = a Letta passage, F = a Mem0 fact. */
export type SourceRecord = { cite: string; kind: "block" | "passage" | "fact"; id: string; title: string; text: string; when: string };

export type MemorySnapshot = {
  agentName: string;
  agentTitle: string;
  scopeNote: string;
  letta: { person: string; blocks: Block[]; passages: Passage[] }[];
  facts: Fact[];
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Numbers every record once, in page order, so a narrative sentence can point at it. */
export function sourceRecords(s: MemorySnapshot): SourceRecord[] {
  const out: SourceRecord[] = [];
  let b = 0, p = 0, f = 0;
  for (const mind of s.letta) {
    for (const bl of mind.blocks) {
      b++;
      out.push({ cite: `B${b}`, kind: "block", id: bl.id ?? `${mind.person}:${bl.label}`, title: `Letta block "${bl.label}"${mind.person ? ` (memory of ${mind.person})` : ""}`, text: bl.value ?? "", when: bl.updated_at ?? "" });
    }
    for (const ps of mind.passages) {
      p++;
      out.push({ cite: `P${p}`, kind: "passage", id: ps.id, title: `Letta archival passage${mind.person ? ` (${mind.person})` : ""}`, text: ps.text ?? "", when: ps.created_at ?? "" });
    }
  }
  for (const x of s.facts) {
    f++;
    const l = factLabels(x);
    out.push({ cite: `F${f}`, kind: "fact", id: x.id, title: `Mem0 ${l.kind || "memory"}${l.useCase ? ` from "${l.useCase}"` : ""}${l.source ? ` (${l.source})` : ""}`, text: x.memory, when: x.updated_at ?? x.created_at ?? "" });
  }
  return out;
}

/** The narrative reads at most this many records; the page says so when there were more. */
export const NARRATIVE_MAX_RECORDS = 80;

/** The prompt for the document model. It sees only the records, and must cite one for every sentence. */
export function narrativePrompt(s: MemorySnapshot, records: SourceRecord[]): string {
  const shown = records.slice(0, NARRATIVE_MAX_RECORDS);
  const body = shown.map((r) => `[${r.cite}] ${r.title}${r.when ? `, ${r.when}` : ""}\n${clip(r.text.trim(), 1500)}`).join("\n\n");
  return `You explain an AI agent's memory to the product owner who runs it, in plain language.

The agent: ${s.agentName}${s.agentTitle ? ` (${s.agentTitle})` : ""}. ${s.scopeNote}

Below are ALL the records its memory holds right now, each with a citation id. Letta blocks are the agent's persona and working memory, read on every turn; Letta passages are its archival notes; Mem0 records are its long-term facts, recalled when relevant.

Write:
- headline: one plain sentence on what this agent knows overall.
- sentences: four to ten short sentences, each one point a non-technical owner would care about: who the agent thinks it is, what it has learned, what it remembers about people or products, what decisions it is carrying, and how that will shape its next answers. Every sentence must cite one or more ids from the list in "cites". Say only what the records show; never invent a name, figure, date or decision. If records conflict or look stale, say so and cite both.
- gaps: up to three things the memory does NOT hold that the owner might expect (one sentence each, no cites), or an empty list.
${records.length > shown.length ? `\nThere are ${records.length} records; you see the newest ${shown.length}.\n` : ""}
<records>
${body || "(none: this agent has no memory yet)"}
</records>`;
}

export type NarrativeSentence = { text: string; cites: string[] };
export type Narrative = { headline: string; sentences: NarrativeSentence[]; gaps: string[] };

/** Keeps only sentences that cite at least one real record; unknown citations are dropped. */
export function checkNarrative(n: Narrative, records: SourceRecord[]): { narrative: Narrative; dropped: number } {
  const known = new Set(records.map((r) => r.cite));
  let dropped = 0;
  const sentences: NarrativeSentence[] = [];
  for (const s of n.sentences ?? []) {
    const cites = [...new Set((s.cites ?? []).map((c) => c.trim().toUpperCase()).filter((c) => known.has(c)))];
    if (!s.text?.trim() || !cites.length) {
      dropped++;
      continue;
    }
    sentences.push({ text: s.text.trim(), cites });
  }
  return { narrative: { headline: (n.headline ?? "").trim(), sentences, gaps: (n.gaps ?? []).map((g) => g.trim()).filter(Boolean).slice(0, 3) }, dropped };
}

/** A fingerprint of the records, so the page can say when memory changed after the narrative was written. */
export function recordsFingerprint(records: SourceRecord[]): string {
  let h = 2166136261;
  for (const r of records) for (const ch of `${r.cite}|${r.id}|${r.when}|${r.text}\n`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `${records.length}-${h.toString(16)}`;
}
