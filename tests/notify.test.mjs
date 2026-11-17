import { test } from "node:test";
import assert from "node:assert/strict";
import { asksSomething, questionOf, bodyFor, subjectFor } from "../src/lib/notifyFormat.ts";

// Doug (Nov 16): questions waiting on him are sent to him, with the options, so he can answer by number.
const ask = `Thanks, Doug. Overdue days will count Monday to Friday.

One part of the count is still open: should the clock pause while a claimant has asked for more time?
1. Yes, pause while they've asked for more time, and show "paused" (suggested)
2. No, count every business day from when the request was sent

A number is enough.`;

test("Socra's numbered question is recognised and pulled out with its options", () => {
  assert.ok(asksSomething(ask));
  const q = questionOf(ask);
  assert.match(q.question, /should the clock pause/);
  assert.deepEqual(q.options.map((o) => o.slice(0, 2)), ["1.", "2."]);
  assert.match(q.options[0], /\(suggested\)/);
});

test("a statement with no question is not sent", () => {
  assert.ok(!asksSomething("Version 3 is in the preview. The overdue badge now turns red after 3 days."));
  assert.ok(asksSomething("Who signs off a payout above the adjuster's limit?"));
});

test("one message carries every waiting item, its options and a link", () => {
  const items = [
    { key: "ask:1", useCase: "Acme Insurance · ClaimSnap", link: "https://studio.example.com/use-cases/a?view=conversation", kind: "question", text: "Should the clock pause?", options: ["1. Yes (suggested)", "2. No"], from: "Socra" },
    { key: "decision:2", useCase: "Northwind HVAC · On-Site", link: "https://studio.example.com/use-cases/b?view=conversation", kind: "checkpoint", text: "Add the Nudge writer agent", options: [], from: "Product engineer" },
  ];
  const body = bodyFor(items, "Socra");
  assert.match(body, /ClaimSnap[\s\S]*1\. Yes \(suggested\)[\s\S]*use-cases\/a/);
  assert.match(body, /Needs your Approve or Reject · Northwind/);
  assert.match(body, /A number is enough/);
  assert.equal(subjectFor(items), "2 things are waiting on you in the Studio");
  assert.match(subjectFor(items.slice(0, 1)), /^Acme Insurance · ClaimSnap: Should the clock pause/);
});
