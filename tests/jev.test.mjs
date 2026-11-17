// Run: npm test. Jev (TypeSafe) judges, code decides: the truth tables that turn Jev's answers into what
// the Studio does, with the old method deciding whenever Jev is unsure, failing or off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { approvalVerdict, decideYes, markVerdict, pairVerdict, candidatePairs, jevCostUsd, APPROVAL_QUESTIONS, MARK_QUESTIONS } from "../src/lib/jev/core.ts";

const noul = (n) => ({ type: "noul", noul: n });

test("a yes needs clear agreement and nothing new; anything in between is left to the rules", () => {
  assert.equal(approvalVerdict({ agrees: noul(0.95), adds_new: noul(0.05) }), "yes");
  assert.equal(approvalVerdict({ agrees: noul(0.9), adds_new: noul(0.85) }), "no", "'yeah, and add video' is a new thought");
  assert.equal(approvalVerdict({ agrees: noul(0.1), adds_new: noul(0.1) }), "no");
  assert.equal(approvalVerdict({ agrees: noul(0.55), adds_new: noul(0.1) }), "unsettled");
  assert.equal(approvalVerdict({}), "unsettled", "missing answers are never a yes");
  assert.deepEqual(decideYes(false, "yes"), { yes: true, used: "jev" });
  assert.deepEqual(decideYes(true, "no"), { yes: false, used: "jev" });
  assert.deepEqual(decideYes(true, "unsettled"), { yes: true, used: "rules" });
  assert.deepEqual(decideYes(false, null), { yes: false, used: "rules" }, "Jev failing or off: the rules decide");
});

test("a mark is sorted only when it asks for something", () => {
  const kind = (choice, p) => ({ type: "choice", choice, probabilities: { [choice]: p } });
  assert.deepEqual(markVerdict({ kind: kind("bug_report", 0.9), asks_anything: noul(0.95) }), { kind: "bug_report", p: 0.9 });
  assert.equal(markVerdict({ kind: kind("change_request", 0.6), asks_anything: noul(0.1) }).kind, "", "praise asks for nothing");
  assert.equal(markVerdict({ kind: kind("something_else", 0.9), asks_anything: noul(0.9) }).kind, "");
});

test("story links: a clear dependency in its stronger direction, else a strong relation, else nothing", () => {
  const a = { id: "move:a", title: "Upload photos", capability: "Intake" };
  const b = { id: "move:b", title: "Claim form", capability: "Intake" };
  assert.deepEqual(pairVerdict(0, a, b, { p0_a_needs_b: noul(0.9), p0_b_needs_a: noul(0.2), p0_related: noul(0.9) }).from, "move:a");
  assert.equal(pairVerdict(0, a, b, { p0_a_needs_b: noul(0.3), p0_b_needs_a: noul(0.8), p0_related: noul(0.9) }).from, "move:b");
  assert.equal(pairVerdict(0, a, b, { p0_a_needs_b: noul(0.2), p0_b_needs_a: noul(0.2), p0_related: noul(0.85) }).kind, "related");
  assert.equal(pairVerdict(0, a, b, { p0_a_needs_b: noul(0.5), p0_b_needs_a: noul(0.5), p0_related: noul(0.5) }), null);
  const c = { id: "move:c", title: "Pay out", capability: "Payment" };
  assert.equal(candidatePairs([a, b, c], [{ from: "move:b", to: "move:a" }]).length, 2, "a pair linked in any state, either way round, is skipped");
});

test("questions stay plain and in one place, and the cost follows TypeSafe's price", async () => {
  for (const q of [...Object.values(APPROVAL_QUESTIONS), ...Object.values(MARK_QUESTIONS)]) assert.ok(q.instructions.endsWith("?"));
  assert.equal(jevCostUsd(1_000_000), 0.042);
  const actions = await fs.readFile(path.join(process.cwd(), "src/lib/studio/actions.ts"), "utf8");
  assert.match(actions, /judgeYes\(useCaseId, onTable, content, rulesYes\)/, "the yes goes through Jev with the rules as fallback");
  assert.match(actions, /jevOutcome\(`decision:\$\{d\.id\}`, "undone"\)/, "an undone approval is counted against Jev");
  const lib = await fs.readFile(path.join(process.cwd(), "src/lib/jev/index.ts"), "utf8");
  assert.match(lib, /return \{ yes: rulesYes, callId: null \};\n  \}\n\}/, "a failed call falls back to the rules, never a silent no");
});
