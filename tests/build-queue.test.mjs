import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingForBuild, decisionsForPrompt, buildSummary, defaultInclude, isBuildDecision } from "../src/lib/buildQueue.ts";

const item = (o) => ({ kind: "question", title: "Show prices in the quiz?", detail: "", source: "John, Product Manager", status: "answered", answer: "Yes", includeInBuild: true, builtInVersion: 0, ...o });

test("only ticked, unbuilt decisions go into the build", () => {
  const items = [
    item({}),
    item({ title: "held back", includeInBuild: false }),
    item({ title: "already built", builtInVersion: 5 }),
    item({ title: "put off", status: "dismissed" }),
    item({ title: "card move", kind: "move" }),
    item({ title: "a document", kind: "document" }),
    item({ title: "open but ticked", status: "open", answer: "" }),
  ];
  assert.deepEqual(pendingForBuild(items).map((r) => r.title), ["Show prices in the quiz?", "open but ticked"]);
});

test("the prompt says what the client decided, and what a refinement replaced", () => {
  const text = decisionsForPrompt([item({ refinedAt: new Date(), previousAnswer: "No", answer: "Yes, on every box" }), item({ title: "Open one", status: "open", answer: "" })]);
  assert.match(text, /The client said: "Yes, on every box"/);
  assert.match(text, /earlier they said "No"/);
  assert.match(text, /Still open/);
});

test("the Generate button's sentence", () => {
  assert.equal(buildSummary(3, 1, 7), "3 decisions and 1 mark-up go into version 7.");
  assert.equal(buildSummary(1, 0, 2), "1 decision goes into version 2.");
  assert.match(buildSummary(0, 0, 4), /Nothing new/);
});

test("defaults: decisions go in, put-off items and housekeeping don't", () => {
  assert.equal(defaultInclude("approved"), true);
  assert.equal(defaultInclude("dismissed"), false);
  assert.equal(defaultInclude("open"), false);
  assert.equal(isBuildDecision("move"), false);
  assert.equal(isBuildDecision("signoff"), true);
});
