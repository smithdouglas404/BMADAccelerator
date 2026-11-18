// Run: npm test. Who someone is (Doug, Nov 18) decides how Socra talks to them; every role maps to one of four personas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, personaOf, personaVoice, PERSONA_VOICE } from "../src/lib/studio/core.ts";
import { journey, needsTriage } from "../src/lib/studio/journey.ts";

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
  const all = journey({ userMessages: 5, openDecisions: 0, approvedDecisions: 2, needsYou: 0, reviewedSections: 3, unreviewedSections: 1, detailedCards: 1, builds: 1, markups: 1, validationScore: 80 });
  assert.equal(all.percent, 100);
  assert.equal(all.next, null);
  assert.equal(needsTriage({ triage: "", state: "held", kind: "capture" }), true);
  assert.equal(needsTriage({ triage: "accepted", state: "held", kind: "capture" }), false);
  assert.equal(needsTriage({ triage: "", state: "built", kind: "capture" }), false);
});
