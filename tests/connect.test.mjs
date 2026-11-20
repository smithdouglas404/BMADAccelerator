import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, TOOL_NAMES, gate, needsConfirm, inScope, effectiveLevel, roleMax, isWrite, ROLE_RULES } from "../src/lib/connect/catalog.ts";

// Doug (Nov 16): the Studio as an MCP connector and a REST API, read-only by default, confirm before
// approving, building or deleting, scoped per customer, every call logged.
const yes = (t) => /^(yes|yep|ok|\d+)$/i.test(t.trim());

test("the twelve approved tools are there, plus a way to find a use case", () => {
  for (const t of ["whats_waiting", "brief", "why_changed", "capture", "add_evidence", "start_use_case", "answer", "decide", "change_item", "build", "read_spec", "agent_status", "list_use_cases"]) assert.ok(TOOL_NAMES.includes(t), t);
  for (const t of ["my_access", "open_use_case", "read_card", "update_use_case", "board_card", "review_spec", "restore_spec", "story_map", "people", "agent_control", "preview", "mark_up", "retry_socra", "sync", "archive_use_case", "delete_use_case", "call_log", "item_trace"]) assert.ok(TOOL_NAMES.includes(t), t);
  assert.equal(TOOL_NAMES.length, 31);
});

test("read-only access and viewers can only look", () => {
  const read = { scope: "read", role: "Product owner" };
  for (const t of TOOL_NAMES) assert.equal(gate(t, read).ok, !isWrite(t), t);
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

// Doug (Nov 16 19:28Z): as admin, do through an assistant everything the screens can; others by role.
test("admin reaches every tool; change access reaches everything but admin tools", () => {
  const admin = { scope: "admin", role: "Admin" };
  for (const t of TOOL_NAMES) assert.ok(gate(t, admin).ok, t);
  const owner = { scope: "write", role: "Product owner" };
  for (const t of TOOL_NAMES) assert.equal(gate(t, owner).ok, TOOLS[t].need !== "admin", t);
  assert.equal(TOOLS.delete_use_case.need, "admin");
  assert.equal(TOOLS.archive_use_case.need, "admin");
});

test("a token never does more than its role allows", () => {
  assert.equal(effectiveLevel({ scope: "admin", role: "Product owner" }), "write");
  assert.equal(effectiveLevel({ scope: "admin", role: "Viewer" }), "read");
  assert.equal(effectiveLevel({ scope: "read", role: "Admin" }), "read");
  assert.equal(effectiveLevel({ scope: "admin", role: "Agent: operator" }), "admin");
  assert.equal(effectiveLevel({ scope: "admin", role: "Agent: watcher" }), "read");
  assert.equal(roleMax("someone new"), "write");
  assert.ok(ROLE_RULES.some((r) => r.kind === "agent"));
  assert.equal(gate("delete_use_case", { scope: "write", role: "Admin" }).ok, false);
});

test("deleting needs confirm and the use case's name; archiving and other undo-hard steps confirm first", () => {
  assert.ok(needsConfirm("delete_use_case", {}, yes));
  assert.ok(needsConfirm("delete_use_case", { confirm: true }, yes));
  assert.ok(needsConfirm("delete_use_case", { confirm: true, confirm_name: "  " }, yes));
  assert.ok(!needsConfirm("delete_use_case", { confirm: true, confirm_name: "Claims intake" }, yes));
  assert.ok(needsConfirm("archive_use_case", { action: "archive" }, yes));
  assert.ok(!needsConfirm("archive_use_case", { action: "restore" }, yes));
  assert.ok(needsConfirm("board_card", { action: "move", column: "done" }, yes));
  assert.ok(!needsConfirm("board_card", { action: "move", column: "ready" }, yes));
  assert.ok(needsConfirm("sync", { to: "git" }, yes));
  assert.ok(needsConfirm("people", { action: "remove" }, yes));
  assert.ok(!needsConfirm("people", { action: "add" }, yes));
  assert.ok(needsConfirm("change_item", { action: "undo_approval" }, yes));
  assert.ok(needsConfirm("review_spec", { review: "remove" }, yes));
  assert.ok(needsConfirm("agent_control", { action: "approve" }, yes));
  assert.ok(!needsConfirm("agent_control", { action: "switch" }, yes));
});

test("every tool explains itself for assistants that discover tools from the spec", () => {
  for (const t of TOOL_NAMES) assert.ok(TOOLS[t].description.length > 40, t);
});

test("Meta Muse keeps its name when old Socra names are renamed", async () => {
  const { brand } = await import("../src/lib/brand.ts");
  assert.equal(brand("Doug (via Meta Muse) moved it"), "Doug (via Meta Muse) moved it");
  assert.equal(brand("Muse suggests 2"), "Socra suggests 2");
});

test("the old name with an article becomes the new name", async () => {
  const { brand } = await import("../src/lib/brand.ts");
  assert.equal(brand("Ask the Muse"), "Ask Socra");
});
