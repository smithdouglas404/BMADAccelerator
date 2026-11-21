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

test("picking an agent shows every conversation it took part in, whole", () => {
  // a, b open; c is Doug's reply to the analyst, then d and e follow it; f and g don't involve the analyst.
  assert.deepEqual(exchangeOf(list, ["business-analyst"]).map((m) => m.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(exchangeOf(list, ["solution-architect"]).map((m) => m.id), ["b", "c", "d", "e"]);
  assert.deepEqual(exchangeOf(list, []).length, list.length);
});

test("agents talking to each other after a person's message stay together", () => {
  const talk = [
    { id: "u1", role: "user", label: "You" },
    { id: "s1", role: "muse", label: "Socra · Product physician" },
    { id: "ux", role: "agent", label: "UX/UI designer · Specialist", specialist: "ux-designer" },
    { id: "ar", role: "agent", label: "Solution architect · Specialist", specialist: "solution-architect" },
    { id: "u2", role: "user", label: "You" },
    { id: "s2", role: "muse", label: "Socra · Product physician" },
    { id: "u3", role: "user", label: "You", addressed: "ux-designer" },
    { id: "ux2", role: "agent", label: "UX/UI designer · Specialist", specialist: "ux-designer" },
  ];
  assert.deepEqual(exchangeOf(talk, ["ux-designer"]).map((m) => m.id), ["u1", "s1", "ux", "ar", "u3", "ux2"]);
});

test("threads group replies under what they answer, latest first", () => {
  const t = threadsOf(list);
  assert.equal(t[0].root.id, "f");
  assert.deepEqual(t[0].replies.map((m) => m.id), ["g"]);
  const ba = t.find((x) => x.root.id === "b");
  assert.deepEqual(ba.replies.map((m) => m.id), ["c", "d"]);
});
