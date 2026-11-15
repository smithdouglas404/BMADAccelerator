// Run: node --test tests/  (Node 22 strips the TypeScript types itself.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { stageGateBlock, signoffReviewProblem, adviceFileName, adviceMarkdown, mustReview, catalogueItems, catalogueProblems, resolvePicks, picksMarkdown } from "../src/lib/agent/advisorGates.ts";

test("handover to a BMAD agent needs advice first", () => {
  assert.match(stageGateBlock({ agent: "pm", advised: false, conceptExists: false }), /mcp__bacc__advise for "pm"/);
  assert.equal(stageGateBlock({ agent: "pm", advised: true, conceptExists: false }), "");
});

test("Sally needs advice and the design concept", () => {
  const both = stageGateBlock({ agent: "ux", advised: false, conceptExists: false });
  assert.match(both, /advise/);
  assert.match(both, /concept\.md/);
  assert.match(stageGateBlock({ agent: "ux", advised: true, conceptExists: false }), /concept\.md/);
  assert.match(stageGateBlock({ agent: "ux", advised: true, conceptExists: true, optionsExists: false }), /options\.md/);
  assert.equal(stageGateBlock({ agent: "ux", advised: true, conceptExists: true, optionsExists: true }), "");
});

test("Winston needs the agentic map", () => {
  const block = stageGateBlock({ agent: "architect", advised: true, conceptExists: true, agenticMapExists: false });
  assert.match(block, /agentic-map\.md/);
  assert.match(block, /AgentKit/);
  assert.equal(stageGateBlock({ agent: "architect", advised: true, conceptExists: false, agenticMapExists: true }), "");
  assert.equal(stageGateBlock({ agent: "pm", advised: true, conceptExists: false, agenticMapExists: false }), "");
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

test("concept, component list and agentic map always need the client's approval", () => {
  for (const p of ["bacc/design/concept.md", "./bacc/design/components.md", "bacc/advisor/agentic-map.md"]) assert.equal(mustReview(p), true, p);
  assert.equal(mustReview("bacc/advisor/app-review-v5.md"), false);
});

const rows = (n, from = 1) => Array.from({ length: n }, (_, i) => `| ${from + i} | Option ${from + i} | what | where | link |`).join("\n");
const CAT = `# Options\n\n## Buttons\n| Code | Option | What you'd see | Where | Look |\n|---|---|---|---|---|\n${rows(12)}\n`;

test("the options catalogue goes to the client and reads its code numbers", () => {
  assert.equal(mustReview("bacc/design/options.md"), true);
  const items = catalogueItems(CAT);
  assert.equal(items.length, 12);
  assert.deepEqual(items[5], { code: 6, name: "Option 6", retired: false });
  assert.equal(catalogueProblems(CAT), "");
  assert.match(catalogueProblems("| 1 | Only one | a | b | c |"), /at least 10/);
  assert.match(catalogueProblems(CAT + "| 3 | Again | a | b | c |\n"), /code 3 is used twice/);
});

test("code numbers never change meaning", () => {
  const renamed = CAT.replace("| 6 | Option 6 |", "| 6 | Something else |");
  assert.match(catalogueProblems(renamed, CAT), /code 6 was "Option 6"/);
  const dropped = CAT.replace(/\| 7 \| Option 7 .*\n/, "");
  assert.match(catalogueProblems(dropped, CAT), /code 7 .*disappeared/);
  const retired = CAT.replace("| 7 | Option 7 |", "| 7 | Option 7 (retired) |");
  assert.equal(catalogueProblems(retired + rows(1, 13) + "\n", CAT), "");
});

test("picks resolve to options; unknown and retired numbers are refused", () => {
  const cat = CAT.replace("| 7 | Option 7 |", "| 7 | Option 7 (retired) |");
  const { picked, unknown } = resolvePicks([6, 5, 6, 7, 99], cat);
  assert.deepEqual(picked.map((p) => p.code), [6, 5]);
  assert.deepEqual(unknown, [7, 99]);
  assert.match(picksMarkdown(picked, "I like 6 and 5", new Date("2026-11-15T13:00:00Z")), /- 6: Option 6/);
});

import { conceptProblems } from "../src/lib/agent/advisorGates.ts";

test("a design concept names its category, three leading products and its fonts", () => {
  assert.match(conceptProblems("# Concept\nPlanets everywhere."), /category/);
  const good = `# Design concept
0. **What kind of product this is:** an online shop selling candy.
Leading shops: https://a.example, https://b.example, https://c.example
Fonts: Fraunces for display, Inter for body.
## Client references
Brand guidelines: none given. Sites they like: none given.`;
  assert.equal(conceptProblems(good), "");
  assert.match(conceptProblems(good.replace("https://c.example", "")), /found 2 links/);
});

import { gapsProblem } from "../src/lib/agent/advisorGates.ts";

test("advice for a BMAD agent must say what is missing", () => {
  const q = (n) => Array.from({ length: n }, (_, i) => ({ question: `Question number ${i}?`, why: "It matters for a shop." }));
  assert.match(gapsProblem("pm", q(1), ""), /at least three questions/);
  assert.equal(gapsProblem("pm", q(3), ""), "");
  assert.equal(gapsProblem("pm", [], "Compared with the online-shop checklist; every item is answered in the PRD."), "");
  assert.match(gapsProblem("pm", [], "nothing"), /at least three/);
  assert.equal(gapsProblem("generator", [], ""), "");
});

test("a design concept records the client's references", () => {
  const md = "0. What kind of product: an online shop. https://a.x https://b.x https://c.x Fonts: Inter.";
  assert.match(conceptProblems(md), /Client references/);
});
