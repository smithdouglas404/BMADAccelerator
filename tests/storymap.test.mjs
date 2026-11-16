// Run: npm test. The Story map: Socra's suggested links are capped and never re-offered once dismissed;
// the PERT layout puts a story right of what it depends on and always finishes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { maySuggest, columns, unlinked, liveLinks, storyNodes, neighbourhood, MAX_SUGGESTED_PER_STORY } from "../src/lib/studio/storymap.ts";

let n = 0;
const link = (from, to, kind = "depends_on", status = "suggested") => ({ id: `l${++n}`, from, to, kind, status, why: "", by: "Socra" });

test("Socra can't suggest a self-link, a duplicate, or a dismissed link", () => {
  assert.equal(maySuggest([], "move:a", "move:a", "related").ok, false);
  assert.equal(maySuggest([link("move:a", "move:b")], "move:a", "move:b", "depends_on").ok, false);
  const dismissed = [link("move:a", "move:b", "related", "dismissed")];
  assert.equal(maySuggest(dismissed, "move:a", "move:b", "related").ok, false);
  assert.equal(maySuggest(dismissed, "move:b", "move:a", "related").ok, false, "related is the same link either way round");
  assert.equal(maySuggest(dismissed, "move:a", "move:b", "depends_on").ok, true, "another kind is a different link");
});

test("at most three suggested links per story", () => {
  const all = Array.from({ length: MAX_SUGGESTED_PER_STORY }, (_, i) => link("move:a", `move:x${i}`));
  assert.equal(maySuggest(all, "move:a", "move:z", "related").ok, false);
  assert.equal(maySuggest(all, "move:z", "move:a", "related").ok, false);
  const confirmed = Array.from({ length: 5 }, (_, i) => link("move:a", `move:x${i}`, "depends_on", "confirmed"));
  assert.equal(maySuggest(confirmed, "move:a", "move:z", "related").ok, true, "confirmed links don't count toward the cap");
});

test("PERT columns: right of what it depends on or was split from; related doesn't move; cycles finish", () => {
  const nodes = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const col = columns(nodes, [link("b", "a"), link("c", "b"), link("d", "a", "split_from"), link("e", "c", "related")]);
  assert.deepEqual(["a", "b", "c", "d", "e"].map((id) => col.get(id)), [0, 1, 2, 1, 0]);
  const loop = columns([{ id: "x" }, { id: "y" }], [link("x", "y"), link("y", "x")]);
  assert.equal(loop.size, 2);
});

test("stories with no links are the gaps; ideas aren't counted", () => {
  const nodes = storyNodes(
    [{ id: "a", title: "A", capability: "Intake", status: "done", hidden: "story" }, { id: "b", title: "B", capability: "Intake", status: "queued", hidden: "" }, { id: "c", title: "C", capability: "", status: "building", hidden: "task" }],
    [{ id: "r", title: "Idea", note: "", group: "Intake", recKind: "feature", state: "suggested", kind: "capture" }, { id: "p", title: "Parked", note: "", group: "", recKind: "feature", state: "parked", kind: "capture" }],
  );
  assert.deepEqual(nodes.map((x) => x.id), ["move:a", "move:b", "move:c", "backlog:r"]);
  assert.equal(nodes[3].suggested, true);
  const links = liveLinks([link("move:a", "move:b"), link("move:a", "move:gone"), link("move:c", "move:a", "related", "dismissed")], nodes);
  assert.equal(links.length, 1);
  assert.deepEqual(unlinked(nodes, links), ["move:c"]);
  assert.deepEqual([...neighbourhood("move:a", links)].sort(), ["move:a", "move:b"]);
});
