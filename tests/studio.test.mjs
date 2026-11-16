// Run: npm test. The Studio's pure parts: the living spec, the package and its provenance, projection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPEC_DEFS, PRD_SECTIONS, TRD_SECTIONS, cleanTrace, explainReadiness, specDiff, specMarkdown, tabCompleteness } from "../src/lib/studio/spec.ts";
import { SESSION_EDGES, clip58 } from "../src/lib/studio/edges.ts";
import { assemblePackage, inspectPackage, PACKAGE_FILES } from "../src/lib/studio/package.ts";
import { project, specChanges } from "../src/lib/studio/projection.ts";

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/export-v6/${f}`, import.meta.url), "utf8"));
const SAMPLE = "Let people save a voice note while walking, then have Muse transcribe it and ask one clarifying question before it becomes a backlog item.";

test("the living spec has 16 PRD and 21 TRD sections with stable refs", () => {
  assert.equal(PRD_SECTIONS.length, 16);
  assert.equal(TRD_SECTIONS.length, 21);
  assert.equal(SPEC_DEFS.find((d) => d.key === "prd-problem").ref, "PR-001");
  assert.equal(SPEC_DEFS.find((d) => d.key === "trd-hardening").ref, "TR-021");
  assert.equal(new Set(SPEC_DEFS.map((d) => d.key)).size, 37);
  // The design team's section names where the two overlap.
  for (const t of ["Validated use case", "Primary customer flow", "Acceptance criteria", "System context", "Data and state transitions"]) assert.ok(SPEC_DEFS.some((d) => d.title === t), t);
});

test("trace steps are cleaned and keep the newest", () => {
  const steps = Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, detail: "d", type: i % 2 ? "evidence" : "bogus" }));
  const out = cleanTrace(steps);
  assert.equal(out.length, 24);
  assert.equal(out.at(-1).label, "L29");
  assert.equal(out[0].type, "inference");
  assert.equal(out[1].type, "evidence");
});

const section = (key, over = {}) => {
  const d = SPEC_DEFS.find((x) => x.key === key);
  return { key, ref: d.ref, tab: d.tab, title: d.title, content: "", completeness: 0, confidence: "open", basis: "not-researched", status: "draft", review: "", capability: "", related: [], trace: [], ...over };
};
const spec = (over = {}) => SPEC_DEFS.map((d) => section(d.key, over[d.key] ?? {}));

function input(sp, annotations = []) {
  return {
    iteration: 1, productName: "Field Notes", statement: "", category: "", audience: "", customerQuote: "", useCase: "", readiness: 0, validationScore: 0,
    repositoryUrl: "", gitBranch: "", prfaq: "", capabilities: [], decisions: [], backlog: [], evidence: [], moves: [], routes: [],
    messages: [{ role: "user", agent: "You", content: SAMPLE, createdAt: "2026-11-15T00:00:00Z" }], annotations, components: [], technicalNotes: [],
    spec: sp, specVersion: 1, specDiff: "", truthGraph: { schema: {}, nodes: [], edges: [] }, vibeLoop: [],
  };
}
const withEdges = (pairs) => {
  const over = {};
  for (const [key, steps] of pairs) over[key] = { trace: [...(over[key]?.trace ?? []), ...steps] };
  return spec(over);
};

test("export test: a clean session holds exactly one conversation and one backlog edge", () => {
  const files = assemblePackage(input(withEdges([SESSION_EDGES.ownerMessage(SAMPLE)])));
  assert.deepEqual(Object.keys(files).sort(), [...PACKAGE_FILES].sort());
  const trace = JSON.parse(files["SPEC_TRACE.json"]);
  assert.deepEqual(trace, [
    { section: "Validated use case", label: "Conversation", detail: SAMPLE, type: "conversation" },
    { section: "Validated use case", label: "Backlog", detail: clip58(SAMPLE), type: "backlog" },
  ]);
  assert.deepEqual(JSON.parse(files["VISUAL_ANNOTATIONS.json"]), []);
  const r = inspectPackage(files);
  assert.ok(r.ok, JSON.stringify(r));
  assert.match(files["CLAUDE_CODE_PROMPT.md"], /## First move/);
  assert.match(files["CLAUDE_CODE_PROMPT.md"], /thin slice on a complete professional floor/);
  assert.ok(JSON.parse(files["CONVERSATION.json"]).some((m) => m.content === SAMPLE), "original wording kept");
});

test("export test: an annotation matches the design team's verified export exactly", () => {
  const note = "Make the voice capture feel immediate and private, not like a form.";
  const ann = SESSION_EDGES.annotation("object", "selected product surface", note);
  const files = assemblePackage(input(withEdges(ann), [{ target: "selected product surface", note, shape: "object" }]));
  assert.deepEqual(JSON.parse(files["SPEC_TRACE.json"]), fixture("SPEC_TRACE.json"));
  assert.deepEqual(JSON.parse(files["VISUAL_ANNOTATIONS.json"]), fixture("VISUAL_ANNOTATIONS.json"));
  assert.ok(inspectPackage(files).ok);
});

test("seeded provenance is refused: annotation edges with no annotation", () => {
  const files = assemblePackage(input(withEdges(SESSION_EDGES.annotation("object", "x", "y"))));
  const r = inspectPackage(files);
  assert.equal(r.ok, false);
  assert.ok(r.traceErrors.some((e) => e.includes("seeded")));
});

test("a removed section drops out of the trace export and the PRD says so", () => {
  const sp = withEdges([SESSION_EDGES.capture("hold it")]);
  sp.find((s) => s.key === "prd-flows").review = "remove";
  const files = assemblePackage(input(sp));
  assert.deepEqual(JSON.parse(files["SPEC_TRACE.json"]), []);
});

test("PRD markdown follows the team's section shape", () => {
  const md = specMarkdown(spec({ "prd-use-case": { content: "Turn a thought into a move.", completeness: 92, status: "evidence-backed", confidence: "high", basis: "confirmed" } }), "prd", "Field Notes");
  assert.match(md, /## Validated use case\n\nTurn a thought into a move\.\n\nCompleteness: 92% · evidence-backed · high confidence/);
});

test("spec diff and completeness", () => {
  const a = spec();
  const b = spec({ "prd-flows": { content: "Capture → reflect → decide", completeness: 60, status: "exploring", basis: "inferred" } });
  assert.match(specDiff(a, b), /Primary customer flow/);
  assert.ok(tabCompleteness(b, "prd") > tabCompleteness(a, "prd"));
});

test("readiness is explained by its factors", () => {
  const r = explainReadiness({ sections: spec(), evidenceCount: 0, decisions: [], validation: 0, capabilities: [], movesTotal: 0, movesDone: 0 });
  assert.ok(r.factors.length >= 5);
  assert.ok(r.factors.every((f) => typeof f.detail === "string" && f.value >= 0 && f.value <= 100));
  assert.ok(r.overall >= 0 && r.overall <= 100);
});

test("projection: backlog and spec diffs, idempotent on re-sync", () => {
  const backlog = [{ id: "b1", title: "Voice capture", group: "Capture", kind: "epic" }, { id: "b2", title: "Probe once", group: "Capture" }];
  const diffs = specChanges(spec(), spec({ "prd-flows": { content: "x", status: "exploring", basis: "inferred", trace: [{ label: "A", detail: "d", type: "annotation" }] } }));
  assert.deepEqual(diffs.map((d) => d.id), ["spec-prd-flows", "spec-trace-edges"]);
  const first = project(backlog, undefined, diffs);
  assert.equal(first.created, 4);
  const g = Object.values(first.state.git).find((r) => r.sourceId === "spec-prd-flows");
  assert.equal(g.branch, "studio/spec/spec-prd-flows");
  assert.equal(g.packagePath, "prototype/spec/PRD.md");
  assert.equal(Object.values(first.state.linear).find((r) => r.sourceId === "spec-prd-flows").issueType, "spec-change");
  const again = project(backlog, first.state, diffs);
  assert.equal(again.created, 0);
  assert.equal(again.updated, 4);
  assert.ok(again.idempotent);
  assert.equal(again.gitRecords, first.gitRecords);
});
