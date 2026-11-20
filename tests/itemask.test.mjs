// Doug (Nov 20): every intake and every move brings in the right specialist and skill and asks what is missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itemAsk, missingDetail, skillFor, specialistFor } from "../src/lib/studio/itemAsk.ts";

test("a fixed rule picks the specialist for each stage", () => {
  assert.equal(specialistFor("said", "Gift wrap for orders").agent, "business-analyst");
  assert.equal(specialistFor("captured", "Export claims to the insurer's API").agent, "solution-architect");
  assert.equal(specialistFor("building", "anything").agent, "product-engineer");
  assert.equal(specialistFor("review", "anything").agent, "ux-component-mapper");
  assert.equal(specialistFor("done", "anything").agent, "use-case-validator");
});

test("a fixed rule picks the skill for each stage", () => {
  assert.equal(skillFor("said", "A gift note").skill, "studio-reimagine");
  assert.equal(skillFor("ready", "Remind the claimant automatically").skill, "studio-agentkit");
  assert.equal(skillFor("review", "A gift note").skill, "working-backwards-studio");
});

test("missing detail is pointed out, not invented", () => {
  assert.equal(missingDetail("Gift wrap").length, 3);
  assert.deepEqual(missingDetail("Adjusters must see overdue claims after 3 business days so that they chase them first"), []);
});

test("the prompt names the item, the specialist, the skill and the about ids", () => {
  const p = itemAsk({ node: "backlog:abc12345", extraNodes: ["move:def67890"], title: "Gift wrap", text: "", stage: "accepted", by: "Doug" });
  assert.match(p, /Item: backlog:abc12345 \(“Gift wrap”\)/);
  assert.match(p, /Specialist for this stage: business-analyst/);
  assert.match(p, /Skill for this stage: studio-reimagine/);
  assert.match(p, /about \["backlog:abc12345","move:def67890"\]/);
  assert.match(p, /Never pass over an item in silence/);
});

test("Socra's skill asks on every move, forward or back, and on captures from outside assistants", () => {
  const skill = readFileSync("studio-skills/studio-muse/SKILL.md", "utf8");
  assert.match(skill, /Every item gets its questions/);
  assert.match(skill, /A move is never "nothing to say"/);
  assert.match(skill, /outside assistant \(Muse, Claude, through the connector\)/);
  assert.doesNotMatch(skill, /talk about the pattern, not the thought/);
});

test("no fixed questions stand in for Socra's on the Board card", () => {
  const board = readFileSync("src/studio/board.tsx", "utf8");
  assert.doesNotMatch(board, /Who uses this, and at what moment\?<\/li>/);
});
