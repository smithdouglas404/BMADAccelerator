/**
 * Whether an agent's memory is really used (Doug, Nov 21). Pure functions over the real event records:
 * the Studio's MemoryEvent rows for Socra's team, and the shared agent service's run steps for a
 * product's agents. Nothing here is a guess: no events means "never used", and the page says so.
 */

export type EventRow = { kind: string; store: string; count: number; source: string; createdAt: Date | string };

export type Usage = {
  /** Times memory was read into a prompt or searched, and how many records or blocks came back. */
  reads: number;
  recordsRead: number;
  /** Facts or lessons saved to Mem0, and times the Letta persona reflected or was asked. */
  writes: number;
  reflections: number;
  asked: number;
  lastRead: string | null;
  lastWrite: string | null;
  lastUsed: string | null;
  since: string | null;
};

const iso = (d: Date | string) => new Date(d).toISOString();
const later = (a: string | null, b: string) => (a && a > b ? a : b);

export function usageFromEvents(rows: EventRow[]): Usage {
  const u: Usage = { reads: 0, recordsRead: 0, writes: 0, reflections: 0, asked: 0, lastRead: null, lastWrite: null, lastUsed: null, since: null };
  for (const r of rows) {
    const at = iso(r.createdAt);
    u.since = u.since && u.since < at ? u.since : at;
    u.lastUsed = later(u.lastUsed, at);
    if (r.kind === "recall") {
      u.reads++;
      u.recordsRead += r.count;
      u.lastRead = later(u.lastRead, at);
    } else if (r.kind === "write" || r.kind === "lesson") {
      u.writes += r.count;
      u.lastWrite = later(u.lastWrite, at);
    } else if (r.kind === "reflect") {
      u.reflections++;
      u.lastWrite = later(u.lastWrite, at);
    } else if (r.kind === "ask") u.asked++;
  }
  return u;
}

type RunLike = { agent: string; status?: string; created_at?: string; steps?: { kind: string; detail: string }[] };

/** A product agent's memory use, counted from the shared service's run history (its steps record each recall and save). */
export function usageFromRuns(runs: RunLike[], key: string): Usage & { runs: number; withPersona: number } {
  const mine = runs.filter((r) => r.agent === key);
  const u: Usage & { runs: number; withPersona: number } = { reads: 0, recordsRead: 0, writes: 0, reflections: 0, asked: 0, lastRead: null, lastWrite: null, lastUsed: null, since: null, runs: mine.length, withPersona: 0 };
  for (const r of mine) {
    const at = r.created_at ? iso(r.created_at) : null;
    if (at) {
      u.since = u.since && u.since < at ? u.since : at;
      u.lastUsed = later(u.lastUsed, at);
    }
    for (const s of r.steps ?? []) {
      if (s.kind === "persona" && /loaded/i.test(s.detail)) {
        u.withPersona++;
        u.reads++;
        if (at) u.lastRead = later(u.lastRead, at);
      }
      const rec = /^Recalled (\d+) fact/.exec(s.detail);
      if (s.kind === "memory" && rec) {
        u.reads++;
        u.recordsRead += Number(rec[1]);
        if (at) u.lastRead = later(u.lastRead, at);
      }
      if (s.kind === "memory" && /^Remembered:/.test(s.detail)) {
        u.writes++;
        if (at) u.lastWrite = later(u.lastWrite, at);
      }
    }
  }
  return u;
}

export type Verdict = { level: "used" | "write-only" | "read-only" | "unused"; text: string };

/** Plain words for what the counts mean. Rules only: it says write-only when it is write-only. */
export function verdictFor(u: Usage, held: { facts: number; blocks: number }): Verdict {
  const read = u.reads > 0;
  const wrote = u.writes > 0 || u.reflections > 0;
  if (read && wrote) return { level: "used", text: `Used both ways: read ${u.reads} time${u.reads === 1 ? "" : "s"} (${u.recordsRead} record${u.recordsRead === 1 ? "" : "s"} put in front of the agent) and written ${u.writes + u.reflections} time${u.writes + u.reflections === 1 ? "" : "s"}.` };
  if (wrote) return { level: "write-only", text: `It keeps writing (${u.writes + u.reflections} time${u.writes + u.reflections === 1 ? "" : "s"}) but nothing has read it back since counting began, so today it is write-only.` };
  if (read) return { level: "read-only", text: `It is read (${u.reads} time${u.reads === 1 ? "" : "s"}) but nothing new has been written to it since counting began.` };
  if (held.facts || held.blocks) return { level: "unused", text: "It holds memory, but no read or write has been counted since counting began. The memory is there and idle." };
  return { level: "unused", text: "It holds no memory and nothing has read or written it." };
}
