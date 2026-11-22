// Run: npm test. The archive closeout rules (Doug, Nov 22).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCloseout, closeoutSummary, canArchive } from "../src/lib/studio/archive.ts";

test("the form needs a production decision", () => {
  const r = checkCloseout({ outcome: "", comments: "", cost: "", benefits: "" }, true);
  assert.equal(r.ok, false);
});

test("a rejection needs its comments; an approval does not", () => {
  assert.equal(checkCloseout({ outcome: "rejected", comments: "  " }, true).ok, false);
  assert.equal(checkCloseout({ outcome: "rejected", comments: "Too costly" }, true).ok, true);
  assert.equal(checkCloseout({ outcome: "approved" }, true).ok, true);
});

test("an unknown outcome is refused, even when no closeout is required", () => {
  assert.equal(checkCloseout({ outcome: "maybe" }, false).ok, false);
});

test("the connector may archive with no closeout; blanks are said to be blank, never invented", () => {
  const r = checkCloseout({}, false);
  assert.equal(r.ok, true);
  const s = closeoutSummary(r.closeout);
  assert.equal(s.decision, "No decision recorded");
  assert.equal(s.cost, "No estimate recorded");
});

test("the three items are trimmed, kept and summarised", () => {
  const r = checkCloseout({ outcome: "approved", comments: " ok ", cost: " $100k ", benefits: " 20% faster; track cycle time " }, true);
  assert.ok(r.ok);
  assert.deepEqual(r.closeout, { outcome: "approved", comments: "ok", cost: "$100k", benefits: "20% faster; track cycle time" });
  assert.equal(closeoutSummary(r.closeout).decision, "Approved for production");
});

test("for now anyone may archive (RBAC later narrows canArchive to the author)", () => {
  assert.equal(canArchive("Dana", { createdBy: "Someone else" }), true);
});
