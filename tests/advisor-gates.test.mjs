// Run: node --test tests/  (Node 22 strips the TypeScript types itself.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { stageGateBlock, signoffReviewProblem, adviceFileName, adviceMarkdown } from "../src/lib/agent/advisorGates.ts";

test("handover to a BMAD agent needs advice first", () => {
  assert.match(stageGateBlock({ agent: "pm", advised: false, conceptExists: false }), /mcp__bacc__advise for "pm"/);
  assert.equal(stageGateBlock({ agent: "pm", advised: true, conceptExists: false }), "");
});

test("Sally needs advice and the design concept", () => {
  const both = stageGateBlock({ agent: "ux", advised: false, conceptExists: false });
  assert.match(both, /advise/);
  assert.match(both, /concept\.md/);
  assert.match(stageGateBlock({ agent: "ux", advised: true, conceptExists: false }), /concept\.md/);
  assert.equal(stageGateBlock({ agent: "ux", advised: true, conceptExists: true }), "");
});

test("concierge, BMad guide and Generate are never blocked", () => {
  for (const agent of ["concierge", "bmad", "generator"]) {
    assert.equal(stageGateBlock({ agent, advised: false, conceptExists: false }), "");
  }
});

test("sign-off needs a real advisor review", () => {
  assert.notEqual(signoffReviewProblem("Looks good."), "");
  assert.equal(signoffReviewProblem("Ready to sign. The PRD covers every intake goal; I'd only add a gift-message option, which candy boxes usually offer."), "");
});

test("advice is written as a dated file", () => {
  const when = new Date("2026-11-15T08:00:00Z");
  assert.equal(adviceFileName("ux", when), "ux-2026-11-15T08-00-00-000Z.md");
  assert.match(adviceMarkdown("ux", [{ idea: "Star map shop", why: "shoppers pick by planet", source: "intake" }], when), /Star map shop/);
});
