// Run: npm test. Who someone is (Doug, Nov 18) decides how Socra talks to them; every role maps to one of four personas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, personaOf, personaVoice, PERSONA_VOICE } from "../src/lib/studio/core.ts";
import { deferredUntil, journey, needsTriage, questionTally } from "../src/lib/studio/journey.ts";

test("every role maps to a persona with its own voice", () => {
  for (const r of ROLES) assert.ok(PERSONA_VOICE[personaOf(r)], r);
  assert.equal(personaOf("First-time creator"), "first");
  assert.equal(personaOf("Business analyst"), "ba");
  assert.equal(personaOf("Tech lead"), "tech");
  assert.equal(personaOf("Product owner"), "owner");
  assert.equal(personaOf("anything else"), "owner");
  assert.match(personaVoice("First-time creator"), /no jargon/);
  assert.match(personaVoice("Tech lead"), /TRD/);
});

test("progress adds up to 100 and names the next step", () => {
  const none = journey({ userMessages: 0, openDecisions: 0, approvedDecisions: 0, needsYou: 0, reviewedSections: 0, unreviewedSections: 5, detailedCards: 0, builds: 0, markups: 0, validationScore: 0 });
  assert.equal(none.steps.reduce((n, s) => n + s.weight, 0), 100);
  assert.equal(none.next.key, "describe");
  const all = journey({ userMessages: 5, openDecisions: 0, approvedDecisions: 2, needsYou: 0, reviewedSections: 3, unreviewedSections: 1, detailedCards: 1, builds: 1, markups: 1, validationScore: 80, questionsAsked: 4, questionsAnswered: 4 });
  assert.equal(all.percent, 100);
  assert.equal(all.next, null);
  assert.equal(needsTriage({ triage: "", state: "held", kind: "capture" }), true);
  assert.equal(needsTriage({ triage: "accepted", state: "held", kind: "capture" }), false);
  assert.equal(needsTriage({ triage: "", state: "built", kind: "capture" }), false);
});

test("a step with questions is done only when every question is answered (Doug, Nov 21)", () => {
  const at = (n) => new Date(Date.UTC(2026, 10, 21, 12, 0, n)).toISOString();
  const talk = [
    { id: "a", role: "muse", content: "Who uses it first?", createdAt: at(1) },
    { id: "b", role: "user", content: "The adjusters", createdAt: at(2) },
    { id: "c", role: "muse", content: "What does done look like?", createdAt: at(3) },
    { id: "d", role: "agent", content: "Which rule applies?\n1. A\n2. B", createdAt: at(4) },
    { id: "e", role: "user", content: "Photos in, nothing missing", createdAt: at(5), replyTo: "c" },
  ];
  const q = questionTally(talk);
  assert.deepEqual(q, { asked: 3, answered: 2 });
  const j = journey({ userMessages: 2, openDecisions: 16, approvedDecisions: 4, needsYou: 0, reviewedSections: 0, unreviewedSections: 0, detailedCards: 0, builds: 0, markups: 0, validationScore: 0, questionsAsked: q.asked, questionsAnswered: q.answered, resolvedDecisions: 4 });
  const answer = j.steps.find((s) => s.key === "answer");
  const decide = j.steps.find((s) => s.key === "decide");
  assert.equal(answer.done, false);
  assert.deepEqual(answer.progress, { done: 2, total: 3, noun: "answered" });
  assert.equal(decide.done, false);
  assert.deepEqual(decide.progress, { done: 4, total: 20, noun: "decided" });
});

test("a deferred item keeps waiting until its day, then needs a person again (Doug, Nov 21)", () => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  assert.equal(needsTriage({ triage: "deferred", deferUntil: day(3), state: "held", kind: "capture" }), false);
  assert.ok(deferredUntil({ triage: "deferred", deferUntil: day(3) }));
  assert.equal(needsTriage({ triage: "deferred", deferUntil: day(-1), state: "held", kind: "capture" }), true);
  assert.equal(deferredUntil({ triage: "deferred", deferUntil: day(-1) }), null);
  assert.equal(needsTriage({ triage: "deferred", deferUntil: null, state: "held", kind: "capture" }), false);
});
