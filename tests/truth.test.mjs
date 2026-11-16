// Run: npm test. The Product Truth Graph is built only from real records: one node per record, every
// statement labelled, edges from explicit links and logged causes, confidence calculated from the graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTruthGraph, explainChanges, interpretText, caseConfidence } from "../src/lib/studio/truth.ts";
import { assemblePackage, inspectPackage } from "../src/lib/studio/package.ts";
import { ownerBacklogState, OWNER_BACKLOG_STATES } from "../src/lib/studio/core.ts";

const t = (m) => new Date(Date.UTC(2026, 10, 16, 0, m)).toISOString();
const empty = () => ({
  id: "uc1", name: "Claimwise", statement: "", validatedUseCase: "", audience: "", createdAt: t(0), validation: {},
  messages: [], evidence: [], documents: [], decisions: [], capabilities: [], backlog: [], spec: [], feedback: [], moves: [], revisions: [], changes: [],
});
const spec = (key, tab, over = {}) => ({ id: `s-${key}`, key, ref: key, tab, title: key, content: "", completeness: 0, confidence: "open", basis: "not-researched", status: "draft", review: "", capability: "", related: [], trace: [], updatedBy: "", updatedAt: t(1), ...over });

test("an empty product has only its use case: no placeholder nodes or edges", () => {
  const g = empty();
  g.spec = [spec("prd-problem", "prd"), spec("trd-data", "trd")];
  const { nodes, edges } = buildTruthGraph(g);
  assert.deepEqual(nodes.map((n) => n.id), ["usecase"]);
  assert.equal(edges.length, 0);
  const c = caseConfidence(g, nodes, edges);
  assert.equal(c.overall, 0);
  assert.equal(c.factors.find((f) => f.key === "pilot").value, 0, "no prototype means no pilot readiness");
});

test("one node per real record, every statement labelled", () => {
  const g = empty();
  g.messages = [
    { id: "m1", role: "user", agent: "You", content: "Adjusters must approve payouts over 10k", author: "Dana", authorRole: "Product owner", addressed: "", ref: "", createdAt: t(1) },
    { id: "m2", role: "muse", agent: "Muse · Product physician", content: "Who approves today?\n\n1. A manager\n2. A second adjuster", author: "", authorRole: "", addressed: "", ref: "", createdAt: t(2) },
    { id: "m3", role: "user", agent: "You", content: "2", author: "Dana", authorRole: "Product owner", addressed: "", ref: "", createdAt: t(3) },
    { id: "m4", role: "signal", agent: "Decision captured", content: "Chosen", author: "", authorRole: "", addressed: "", ref: "d1", createdAt: t(3) },
  ];
  g.decisions = [
    { id: "d1", text: "2. A second adjuster", status: "approved", capability: "", words: "2", agent: "Dana", answer: "", createdAt: t(3) },
    { id: "d2", text: "Fraud flags go to a person", status: "open", capability: "", words: "", agent: "Business analyst", answer: "", createdAt: t(4) },
    { id: "d3", text: "Pilot calls no outside systems", status: "assumed", capability: "", words: "", agent: "Muse", answer: "", createdAt: t(4) },
    { id: "d4", text: "Auto-approve everything", status: "rejected", capability: "", words: "", agent: "Muse", answer: "No", createdAt: t(5) },
  ];
  g.evidence = [{ id: "e1", source: "Interview", type: "interview", insight: "Payout delays come from missing documents", confidence: "high", trace: "", documentId: "", createdAt: t(2) }];
  g.backlog = [
    { id: "b1", title: "Missing-document chaser", note: "notify the claimant", kind: "epic", group: "", source: "Muse recommendation", recKind: "workflow", state: "suggested", annotationId: "", createdAt: t(2) },
    { id: "b2", title: "Gamified badges", note: "", kind: "distraction", group: "", source: "Working session", recKind: "", state: "held", annotationId: "", createdAt: t(2) },
  ];
  g.spec = [spec("prd-problem", "prd", { content: "Payouts stall", basis: "inferred", completeness: 60, related: ["e1"] }), spec("trd-hitl", "trd", { content: "Second approver", basis: "confirmed", status: "owner-approved", completeness: 80, related: ["d1"] })];
  g.feedback = [{ id: "f1", comment: "Make the status clearer", target: "Status timeline", shape: "circle", status: "new", interpretation: { behaviour: "Show where the claim is", acceptance: ["Status visible"], prd: ["prd-problem"], trd: [] }, createdAt: t(6) }];
  g.revisions = [{ version: 1, reason: "Package iteration 1", createdAt: t(7) }];
  const { nodes, edges } = buildTruthGraph(g);
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.equal(by["msg:m1"].statement, "fact");
  assert.equal(by["msg:m2"].statement, "open");
  assert.equal(by["decision:d1"].statement, "decision");
  assert.equal(by["decision:d2"].statement, "open");
  assert.equal(by["decision:d3"].statement, "inference");
  assert.equal(by["decision:d4"].statement, "rejected");
  assert.equal(by["evidence:e1"].statement, "evidence");
  assert.equal(by["backlog:b1"].statement, "recommendation");
  assert.equal(by["backlog:b2"].statement, "rejected");
  assert.equal(by["spec:prd-problem"].statement, "inference");
  assert.equal(by["spec:trd-hitl"].statement, "decision");
  assert.equal(by["ann:f1"].type, "prototype");
  assert.equal(by["version:1"].statement, "generated");
  // Every record is there, not just the first of each kind.
  assert.equal(nodes.filter((n) => n.id.startsWith("decision:")).length, 4);
  const has = (from, to) => edges.some((e) => e.from === from && e.to === to);
  assert.ok(has("msg:m3", "decision:d1"), "the yes approved the decision");
  assert.ok(has("evidence:e1", "spec:prd-problem"), "evidence supports the section");
  assert.ok(has("decision:d1", "spec:trd-hitl"));
  assert.ok(has("ann:f1", "spec:prd-problem"), "the mark changes the section it was read into");
  assert.ok(edges.every((e) => by[e.from] && by[e.to]), "no dangling edges");
});

test("plain-language inferences, with the technical reading kept aside", () => {
  const i = interpretText("A manager has to approve it and the claimant gets a notification");
  assert.ok(i.some((x) => x.plain === "Someone should be able to review this before it becomes permanent." && /Human-in-the-loop/.test(x.technical)));
  assert.ok(i.some((x) => /hear about this/.test(x.plain)));
  assert.ok(i.every((x) => !/human-in-the-loop|orchestration/i.test(x.plain)), "no jargon in the owner's words");
});

test("why did this change: the chain of causes goes back through the graph", () => {
  const g = empty();
  g.messages = [{ id: "m1", role: "user", agent: "You", content: "People lose thoughts while walking", author: "Dana", authorRole: "Product owner", addressed: "", ref: "", createdAt: t(1) }];
  g.feedback = [{ id: "f1", comment: "Voice capture should keep unfinished recordings", target: "Voice button", shape: "object", status: "new", interpretation: {}, createdAt: t(3) }];
  g.spec = [spec("prd-flows", "prd", { content: "Capture keeps drafts", basis: "inferred", completeness: 50 })];
  g.changes = [
    { id: "c1", node: "ann:f1", kind: "added", summary: "Pointed at the voice button", before: "", after: "", causes: ["msg:m1"], by: "Dana", createdAt: t(3) },
    { id: "c2", node: "spec:prd-flows", kind: "changed", summary: "The Muse carried the mark into the flow", before: "", after: "Capture keeps drafts", causes: ["ann:f1"], by: "Muse", createdAt: t(4) },
  ];
  const { nodes, edges } = buildTruthGraph(g);
  const [latest] = explainChanges(g.changes, nodes, edges);
  assert.equal(latest.node, "spec:prd-flows");
  assert.deepEqual(latest.because.map((b) => b.id), ["ann:f1", "msg:m1"], "the section changed because of the mark, which came from the conversation");
});

test("confidence comes only from connected facts, evidence, decisions and sections", () => {
  const g = empty();
  g.spec = [spec("prd-problem", "prd", { content: "x", basis: "confirmed", completeness: 100, related: ["e1"] }), spec("prd-jobs", "prd", { content: "y", basis: "inferred", completeness: 100 })];
  g.evidence = [{ id: "e1", source: "Interview", type: "interview", insight: "z", confidence: "high", trace: "", documentId: "", createdAt: t(1) }];
  g.validation = { problem: { state: "confirmed" } };
  const { nodes, edges } = buildTruthGraph(g);
  const c = caseConfidence(g, nodes, edges);
  const problem = c.factors.find((f) => f.key === "problem");
  // sections: (1*1 + 1*0.5)/2 = .75 → 37.5; support 1/3 → 10; signal 1 → 20
  assert.equal(problem.value, 68);
  assert.equal(c.factors.find((f) => f.key === "user").value, 0);
  assert.ok(problem.because.length >= 2);
});

test("the package's TRUTH_GRAPH.json passes only with real Studio records", () => {
  const base = { iteration: 1, productName: "P", statement: "", category: "", audience: "", customerQuote: "", useCase: "", readiness: 0, validationScore: 0, repositoryUrl: "", gitBranch: "studio", prfaq: "", capabilities: [], decisions: [], backlog: [], evidence: [], moves: [], routes: [], messages: [], annotations: [], components: [], technicalNotes: [], spec: [], specVersion: 1, specDiff: "", vibeLoop: [] };
  const good = inspectPackage(assemblePackage({ ...base, truthGraph: { schema: {}, nodes: [{ id: "usecase" }, { id: "msg:a" }], edges: [{ id: "e1", from: "msg:a", to: "usecase" }] } }));
  assert.deepEqual(good.graphErrors, []);
  const seeded = inspectPackage(assemblePackage({ ...base, truthGraph: { schema: {}, nodes: [{ id: "thought-walking" }, { id: "studio-evidence" }], edges: [{ id: "e1", from: "thought-walking", to: "nowhere" }] } }));
  assert.equal(seeded.ok, false);
  assert.ok(seeded.graphErrors.some((e) => /thought-walking/.test(e)));
  assert.ok(seeded.graphErrors.some((e) => /outside the graph/.test(e)));
});

test("owners see five backlog states; the finer ones stay underneath", () => {
  assert.deepEqual([...OWNER_BACKLOG_STATES], ["Captured", "Needs context", "Shaping", "Ready to prototype", "Parked"]);
  assert.equal(ownerBacklogState({ kind: "capture", state: "held" }), "Captured");
  assert.equal(ownerBacklogState({ kind: "epic", state: "suggested", recKind: "workflow" }), "Needs context");
  assert.equal(ownerBacklogState({ kind: "epic", state: "probing", recKind: "hitl" }), "Shaping");
  assert.equal(ownerBacklogState({ kind: "epic", state: "held" }), "Shaping");
  assert.equal(ownerBacklogState({ kind: "capture", state: "ready" }), "Ready to prototype");
  assert.equal(ownerBacklogState({ kind: "capture", state: "built" }), "Ready to prototype");
  assert.equal(ownerBacklogState({ kind: "distraction", state: "held" }), "Parked");
});
