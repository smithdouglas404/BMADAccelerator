import { test } from "node:test";
import assert from "node:assert/strict";
import { speakers, exchangeOf, threadsOf } from "../src/lib/studio/convoFilter.ts";

// Doug (Nov 21): filter the long conversation by who is talking, and see it as threads.
const list = [
  { id: "a", role: "muse", label: "Socra · Product physician" },
  { id: "b", role: "agent", label: "Business analyst · Specialist", specialist: "business-analyst" },
  { id: "c", role: "user", label: "You", replyTo: "b", addressed: "business-analyst" },
  { id: "d", role: "agent", label: "Business analyst · Specialist", specialist: "business-analyst", replyTo: "c" },
  { id: "e", role: "agent", label: "Solution architect · Specialist", specialist: "solution-architect" },
  { id: "f", role: "user", label: "You" },
  { id: "g", role: "muse", label: "Socra · Product physician", replyTo: "f" },
];

test("speakers come from the messages, people first", () => {
  const s = speakers(list);
  assert.deepEqual(s.map((x) => x.name), ["You", "Socra", "Business analyst", "Solution architect"]);
  assert.equal(s.find((x) => x.name === "Business analyst").count, 2);
});

test("picking an agent shows its exchange with people, both ways", () => {
  assert.deepEqual(exchangeOf(list, ["business-analyst"]).map((m) => m.id), ["b", "c", "d"]);
  assert.deepEqual(exchangeOf(list, []).length, list.length);
});

test("threads group replies under what they answer, latest first", () => {
  const t = threadsOf(list);
  assert.equal(t[0].root.id, "f");
  assert.deepEqual(t[0].replies.map((m) => m.id), ["g"]);
  const ba = t.find((x) => x.root.id === "b");
  assert.deepEqual(ba.replies.map((m) => m.id), ["c", "d"]);
});
