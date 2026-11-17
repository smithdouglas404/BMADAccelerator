// Git and Linear are projections of the Studio; the Studio stays the source of truth.
// Same rules as the design team's scripts/mock_sync.py: stable ids from the Studio id, a branch and
// package path per record for Git, capability projects and epic / story / spec-change issues for Linear,
// and a repeatable, non-destructive sync (a second run updates records instead of duplicating them).
// Backlog items and specification diffs (PRD.md, TRD.md, SPEC_TRACE.json) both project.
import { createHash } from "node:crypto";

export type ProjectableItem = { id: string; title?: string; group?: string; kind?: string; note?: string };
export type SpecDiffRecord = { id: string; file: "PRD.md" | "TRD.md" | "SPEC_TRACE.json"; summary: string; from: string; to: string; trace?: string };
export type GitRecord = { sourceId: string; branch: string; packagePath: string; title: string; trace: string };
export type LinearRecord = {
  sourceId: string;
  project: string;
  issueType: "epic" | "story" | "spec-change";
  title: string;
  trace: string;
  file?: string;
  from?: string;
  to?: string;
};
export type ProjectionState = { git: Record<string, GitRecord>; linear: Record<string, LinearRecord> };

export const stableId = (prefix: string, sourceId: string) => `${prefix}_${createHash("sha1").update(sourceId).digest("hex").slice(0, 10)}`;

export function project(backlog: ProjectableItem[], previous: ProjectionState = { git: {}, linear: {} }, specDiffs: SpecDiffRecord[] = []) {
  const git = { ...previous.git };
  const linear = { ...previous.linear };
  let created = 0;
  let updated = 0;
  const count = (gitId: string, linId: string) => (git[gitId] || linear[linId] ? updated++ : created++);
  for (const item of backlog) {
    const title = item.title || "Untitled signal";
    const capability = item.group || "Unsorted signal";
    const gitId = stableId("git", item.id);
    const linId = stableId("lin", item.id);
    count(gitId, linId);
    git[gitId] = { sourceId: item.id, branch: `studio/${item.id}`, packagePath: `prototype/backlog/${item.id}.json`, title, trace: `Studio backlog → ${capability}` };
    linear[linId] = { sourceId: item.id, project: capability, issueType: item.kind === "epic" ? "epic" : "story", title, trace: `Studio item ${item.id} → ${capability}` };
  }
  for (const d of specDiffs) {
    const gitId = stableId("git", d.id);
    const linId = stableId("lin", d.id);
    count(gitId, linId);
    git[gitId] = { sourceId: d.id, branch: `studio/spec/${d.id}`, packagePath: `prototype/spec/${d.file}`, title: d.summary, trace: d.trace || `Studio spec → ${d.file}` };
    linear[linId] = { sourceId: d.id, project: "Living specification", issueType: "spec-change", title: d.summary, file: d.file, from: d.from, to: d.to, trace: d.trace || `Studio spec ${d.id} → ${d.file}` };
  }
  const state: ProjectionState = { git, linear };
  return {
    state,
    created,
    updated,
    studioItems: backlog.length,
    specDiffs: specDiffs.length,
    gitRecords: Object.keys(git).length,
    linearRecords: Object.keys(linear).length,
    idempotent: created === 0 && JSON.stringify(previous) === JSON.stringify(state),
  };
}

type SpecRow = { key: string; ref?: string; tab: string; title: string; content: string; status: string; basis: string; review?: string; trace?: unknown };

const STATUS: Record<string, string> = {
  draft: "Draft", exploring: "Exploring", "evidence-backed": "Evidence-backed", "owner-approved": "Owner approved", "engineer-reviewed": "Engineer reviewed",
  "ready-prototype": "Ready for prototype", "ready-pilot": "Ready for pilot", "production-ready": "Production-ready",
};
const BASIS: Record<string, string> = { confirmed: "Confirmed", recommended: "Recommended", inferred: "Inferred", open: "Open decision", "not-researched": "Not researched" };
const edges = (rows: SpecRow[]) => rows.reduce((n, r) => n + (Array.isArray(r.trace) ? r.trace.length : 0), 0);
const stateOf = (r: SpecRow | undefined) => (!r || !r.content ? "Not researched" : r.review === "remove" ? "Removed" : r.basis === "not-researched" ? STATUS[r.status] ?? r.status : `${STATUS[r.status] ?? r.status} · ${BASIS[r.basis] ?? r.basis}`);

/**
 * The specification changes since the last sync, as projection records: one per changed PRD or TRD
 * section (id spec-<section key>, e.g. spec-prd-flows) and one for the trace edges (spec-trace-edges).
 */
export function specChanges(previous: SpecRow[], current: SpecRow[]): SpecDiffRecord[] {
  const before = new Map(previous.map((r) => [r.key, r]));
  const out: SpecDiffRecord[] = [];
  for (const r of current) {
    const p = before.get(r.key);
    const same = p && p.content === r.content && p.status === r.status && p.basis === r.basis && (p.review ?? "") === (r.review ?? "");
    if (same || (!p && !r.content)) continue;
    const from = stateOf(p);
    const to = stateOf(r);
    const what = !p?.content ? "added" : r.review === "remove" ? "removed by the owner" : p.content !== r.content ? "changed" : "moved on";
    out.push({ id: `spec-${r.key}`, file: r.tab === "trd" ? "TRD.md" : "PRD.md", summary: `${r.ref ? `${r.ref} ` : ""}${r.title} ${what}`, from, to, trace: `Studio spec → ${r.ref || r.key}` });
  }
  const e0 = edges(previous);
  const e1 = edges(current);
  if (e1 !== e0) out.push({ id: "spec-trace-edges", file: "SPEC_TRACE.json", summary: "Provenance edges from conversation, evidence and annotations to the spec", from: e0 ? `${e0} edges` : "No edge", to: `${e1} edges`, trace: "Studio spec → SPEC_TRACE.json" });
  return out;
}
