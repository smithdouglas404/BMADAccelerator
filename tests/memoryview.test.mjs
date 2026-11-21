// Run: npm test. Settings > Agent memory (Doug, Nov 21): agents are read from real Letta and Mem0 records,
// customers stay apart, and the narrative keeps only sentences that cite a real record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNarrative, factRows, filterFacts, narrativePrompt, parseRef, personFromLettaName, recordsFingerprint, refString, serviceLettaPrefix, serviceMemoryScope, sourceRecords } from "../src/lib/memory/inspectCore.ts";

test("agent references round-trip and reject anything else", () => {
  for (const r of [{ kind: "studio", role: "muse" }, { kind: "app", useCaseId: "cmabc123", key: "claim-triage" }]) assert.deepEqual(parseRef(refString(r)), r);
  for (const bad of ["", "studio", "app:x", "app:../x:key", "app:uc:Bad Key", "other:muse"]) assert.equal(parseRef(bad), null, bad);
});

test("app agent scopes match the shared agent service's own naming", () => {
  assert.equal(serviceMemoryScope("uc1", "Acme Insurance"), "acme-insurance:uc1");
  assert.equal(serviceMemoryScope("uc1", ""), "workspace:uc1");
  assert.equal(serviceLettaPrefix("uc1", "triage"), "svc-uc1-triage-");
  assert.equal(personFromLettaName("svc-uc1-triage-dana", "uc1", "triage"), "dana");
});

test("the agent service's config uses the same scope rules", async (t) => {
  let cfg;
  try { cfg = await import("../agent-service/src/config.ts"); } catch { return t.skip("agent-service packages not installed"); }
  for (const [uc, c] of [["uc1", "Acme Insurance"], ["uc2", ""], ["uc3", "  ACME--co "]]) assert.equal(cfg.memoryScope(uc, c), serviceMemoryScope(uc, c));
  assert.ok(cfg.lettaName("uc1", "triage", "Dana").startsWith(serviceLettaPrefix("uc1", "triage")));
});

const facts = factRows({ results: [
  { id: "f1", memory: "Owners asked about payment provider early", created_at: "2026-11-01T00:00:00Z", metadata: { kind: "lesson", use_case: "uc1", customer: "acme" } },
  { id: "f2", memory: "Claims clock pauses while waiting", created_at: "2026-11-03T00:00:00Z", metadata: { kind: "decision", use_case: "uc2", customer: "globex" } },
  { id: "f3", memory: "no metadata", created_at: "2026-11-02T00:00:00Z" },
  { nope: true },
] });

test("Mem0 records are filtered per use case and customer, newest first", () => {
  assert.equal(facts.length, 3);
  assert.deepEqual(filterFacts(facts, {}).map((f) => f.id), ["f2", "f3", "f1"]);
  assert.deepEqual(filterFacts(facts, { useCaseId: "uc1" }).map((f) => f.id), ["f1"]);
  assert.deepEqual(filterFacts(facts, { customer: "GLOBEX" }).map((f) => f.id), ["f2"]);
  assert.deepEqual(filterFacts(facts, { q: "payment" }).map((f) => f.id), ["f1"]);
  assert.deepEqual(factRows([{ id: "a", memory: "x" }]).map((f) => f.id), ["a"]);
});

test("the narrative cites only real records; uncited or invented sentences are dropped", () => {
  const snap = { agentName: "Socra", agentTitle: "Product physician", scopeNote: "", letta: [{ person: "", blocks: [{ id: "b1", label: "persona", value: "You are..." }], passages: [{ id: "p1", text: "note" }] }], facts: filterFacts(facts, {}) };
  const recs = sourceRecords(snap);
  assert.deepEqual(recs.map((r) => r.cite), ["B1", "P1", "F1", "F2", "F3"]);
  const prompt = narrativePrompt(snap, recs);
  assert.match(prompt, /\[F1\] Mem0 decision/);
  assert.match(prompt, /never invent/);
  const { narrative, dropped } = checkNarrative({ headline: " h ", sentences: [{ text: "ok", cites: ["b1", "F9"] }, { text: "made up", cites: [] }, { text: "ghost", cites: ["X1"] }], gaps: ["a", "", "b", "c", "d"] }, recs);
  assert.deepEqual(narrative.sentences, [{ text: "ok", cites: ["B1"] }]);
  assert.equal(dropped, 2);
  assert.equal(narrative.gaps.length, 3);
  assert.equal(narrative.headline, "h");
  assert.match(narrativePrompt({ ...snap, letta: [], facts: [] }, []), /none: this agent has no memory yet/);
});

test("the fingerprint changes when memory changes", () => {
  const a = [{ cite: "F1", kind: "fact", id: "x", title: "", text: "one", when: "" }];
  assert.equal(recordsFingerprint(a), recordsFingerprint([...a]));
  assert.notEqual(recordsFingerprint(a), recordsFingerprint([{ ...a[0], text: "two" }]));
});
