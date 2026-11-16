import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, TOOL_NAMES, gate, needsConfirm, inScope } from "../src/lib/connect/catalog.ts";

// Doug (Nov 16): the Studio as an MCP connector and a REST API, read-only by default, confirm before
// approving, building or deleting, scoped per customer, every call logged.
const yes = (t) => /^(yes|yep|ok|\d+)$/i.test(t.trim());

test("the twelve approved tools are there, plus a way to find a use case", () => {
  for (const t of ["whats_waiting", "brief", "why_changed", "capture", "add_evidence", "start_use_case", "answer", "decide", "change_item", "build", "read_spec", "agent_status", "list_use_cases"]) assert.ok(TOOL_NAMES.includes(t), t);
  assert.equal(TOOL_NAMES.length, 13);
});

test("read-only access and viewers can only look", () => {
  const read = { scope: "read", role: "Product owner" };
  for (const t of TOOL_NAMES) assert.equal(gate(t, read).ok, !TOOLS[t].write, t);
  assert.equal(gate("capture", { scope: "write", role: "Viewer" }).ok, false);
  assert.equal(gate("capture", { scope: "write", role: "Business analyst" }).ok, true);
});

test("approve, build, withdraw, reopen and send back wait for confirm; edits and captures don't", () => {
  assert.ok(needsConfirm("decide", { decision: "approve" }, yes));
  assert.ok(needsConfirm("build", {}, yes));
  assert.ok(needsConfirm("change_item", { action: "withdraw" }, yes));
  assert.ok(needsConfirm("change_item", { action: "reopen_decision" }, yes));
  assert.ok(needsConfirm("change_item", { action: "send_back_card" }, yes));
  assert.ok(!needsConfirm("change_item", { action: "edit" }, yes));
  assert.ok(!needsConfirm("capture", { text: "yes" }, yes));
  assert.ok(!needsConfirm("decide", { decision: "approve", confirm: true }, yes));
  // A bare yes or a number to Socra is an approval, so it is confirmed first; anything else goes straight.
  assert.ok(needsConfirm("answer", { text: "yes" }, yes));
  assert.ok(needsConfirm("answer", { text: "2" }, yes));
  assert.ok(!needsConfirm("answer", { text: "Adjusters work from their phones in the field" }, yes));
});

test("access for one customer sees only that customer", () => {
  assert.ok(inScope("", "Acme Insurance"));
  assert.ok(inScope("acme insurance", "Acme Insurance"));
  assert.ok(!inScope("Acme Insurance", "Globex"));
});

test("inputs are checked before anything runs", () => {
  assert.equal(TOOLS.decide.input.safeParse({ use_case_id: "cmwikwlvn00007d5vxggknu7r", decision_id: "x", decision: "approve" }).success, false);
  assert.equal(TOOLS.read_spec.input.safeParse({ use_case_id: "cmwikwlvn00007d5vxggknu7r", part: "prd" }).success, true);
});
