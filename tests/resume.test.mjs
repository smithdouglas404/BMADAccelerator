import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeBrief, gapLabel, RESUME_AFTER_MS } from "../src/lib/studio/resume.ts";

// Doug: "If I go away 3 weeks and I come back, I need to make sure that the context is still there."
const day = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-20T15:00:00Z");
const at = (ms) => new Date(t0.getTime() + ms);
const conversation = [
  { role: "user", agent: "You", author: "Doug", content: "Customer: Acme Insurance\nWe want adjusters to stop chasing photos by email.", createdAt: at(0) },
  { role: "muse", agent: "Socra · Product physician", author: "", content: "How does your way differ from how other insurers handle missing photos today?", createdAt: at(60_000) },
  { role: "user", agent: "You", author: "Doug", content: "We call the claimant the same day, and nobody else does that.", createdAt: at(120_000) },
  { role: "agent", agent: "Claims expert", author: "", content: "Same-day contact is rare in the industry; most send a letter within 5 days.", createdAt: at(180_000) },
  { role: "muse", agent: "Socra · Product physician", author: "", content: "Should the claimant get a text with an upload link right after the call? I'd suggest yes.", createdAt: at(240_000) },
];
const base = {
  name: "ClaimTrail",
  customer: "Acme Insurance",
  businessArea: "Operations",
  openDecisions: [{ text: "Who approves a payout above the adjuster's limit?", createdAt: at(200_000) }],
  approved: [{ text: "Same-day call to every claimant" }],
  held: [{ title: "tenants should be able to send a photo of the leak" }],
  lastBuild: { version: 2, at: at(300_000) },
  remembered: ["Doug prefers short answers with one question at a time"],
};

test("after three weeks away, Socra gets the whole picture back, word for word", () => {
  const back = at(21 * day);
  const messages = [...conversation, { role: "user", agent: "You", author: "Doug", content: "ok where were we", createdAt: back }];
  const brief = resumeBrief({ ...base, now: back, messages, sessionLost: false });
  assert.match(brief, /away for 3 weeks/);
  assert.match(brief, /Never ask them to repeat/);
  // Every earlier message, verbatim, with who said it.
  for (const m of conversation) assert.ok(brief.includes(m.content), m.content);
  assert.match(brief, /Doug: We call the claimant the same day/);
  assert.match(brief, /Claims expert: Same-day contact is rare/);
  // What is waiting, what was decided, what is held, the last build, and long-term memory.
  assert.match(brief, /Waiting on them \(1\)[\s\S]*payout above the adjuster's limit/);
  assert.match(brief, /Same-day call to every claimant/);
  assert.match(brief, /send a photo of the leak/);
  assert.match(brief, /Last build: version 2/);
  assert.match(brief, /prefers short answers/);
  assert.match(brief, /Customer: Acme Insurance · Business area: Operations/);
  // The new message itself is the turn's prompt, not part of the record.
  assert.ok(!brief.includes("ok where were we"));
});

test("a session that can't be resumed still gets the conversation, even after a short gap", () => {
  const back = at(10 * 60_000);
  const messages = [...conversation, { role: "user", agent: "You", author: "Doug", content: "2", createdAt: back }];
  assert.equal(resumeBrief({ ...base, now: back, messages, sessionLost: false }), "");
  const brief = resumeBrief({ ...base, now: back, messages, sessionLost: true });
  assert.match(brief, /could not be resumed/);
  assert.ok(brief.includes(conversation[4].content));
});

test("gaps read in plain words", () => {
  assert.equal(gapLabel(21 * day), "3 weeks");
  assert.equal(gapLabel(2 * day), "2 days");
  assert.equal(gapLabel(RESUME_AFTER_MS), "12 hours");
});
