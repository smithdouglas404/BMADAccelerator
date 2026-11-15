import { test } from "node:test";
import assert from "node:assert/strict";
import { floorItems, floorProblems, stageGateBlock } from "../src/lib/agent/advisorGates.ts";

const areas = ["Catalogue", "Product page", "Basket and checkout", "Delivery and returns", "Trust and support", "Account", "Legal"];
const scaffold = areas.map((a) => `### ${a}\n${Array.from({ length: 5 }, (_, i) => `- [${i === 4 ? "out" : i % 2 ? "confirmed" : "assumed"}] ${a} item ${i}`).join("\n")}`).join("\n\n");
const good = `# Product floor: Hello Earth
## Category
Online shop, confectionery
## Leading products
- Sugarfina: gift boxes
- Lolli and Pops: in-store feel online
- Dylan's Candy Bar: range and gifting
## Scaffold
${scaffold}
## Gap questions
1. Delivery area? Why: costs. Suggested: national.
2. Gift notes? Why: gifting. Suggested: yes.
3. Heat-safe shipping? Why: summer. Suggested: ice packs.
4. Subscriptions? Why: repeat orders. Suggested: later.
5. Allergen labels? Why: law. Suggested: per candy.
## Ideas
- A taste quiz that builds the box.
`;

test("a complete floor passes", () => {
  assert.equal(floorProblems(good), "");
  const items = floorItems(good);
  assert.equal(items.length, 35);
  assert.equal(items.filter((i) => i.state === "out").length, 7);
  assert.equal(items[0].area, "Catalogue");
});

test("a thin floor says what's missing", () => {
  const p = floorProblems("# Floor\n## Category\nShop\n### Catalogue\n- [assumed] Grid\n");
  assert.match(p, /three real leading products/);
  assert.match(p, /six/);
  assert.match(p, /at least 30/);
  assert.match(p, /Gap questions/);
  assert.match(p, /Ideas/);
});

test("no BMAD agent starts before the floor exists", () => {
  assert.match(stageGateBlock({ agent: "analyst", advised: true, conceptExists: false, floorExists: false }), /bacc\/floor\.md/);
  assert.equal(stageGateBlock({ agent: "analyst", advised: true, conceptExists: false, floorExists: true }), "");
  assert.equal(stageGateBlock({ agent: "concierge", advised: false, conceptExists: false, floorExists: false }), "");
});
