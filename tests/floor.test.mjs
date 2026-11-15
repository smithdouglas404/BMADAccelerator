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

import { numberFloor, setFloorItem, addFloorItem, floorCoverage, coverageProblem, parseFloor } from "../src/lib/agent/advisorGates.ts";

test("every item gets an id that never changes", () => {
  const n = numberFloor(good);
  const items = floorItems(n);
  assert.ok(items.every((i) => /^F\d+$/.test(i.id)));
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.equal(numberFloor(n), n);
  const added = addFloorItem(n, "Catalogue", "Gift finder", "assumed");
  assert.equal(added.id, "F36");
  const again = floorItems(numberFloor(added.md));
  assert.equal(again.find((i) => i.text === "Gift finder")?.id, "F36");
  assert.equal(again.find((i) => i.text === "Catalogue item 0")?.id, "F1");
});

test("the client can keep, change or remove an item", () => {
  const n = numberFloor(good);
  const out = setFloorItem(n, "F1", "out", "not for the pilot");
  const it = floorItems(out).find((i) => i.id === "F1");
  assert.equal(it.state, "out");
  assert.match(it.text, /client: not for the pilot/);
  const back = setFloorItem(out, "F1", "confirmed", "yes after all");
  assert.equal(floorItems(back).find((i) => i.id === "F1").text, "Catalogue item 0 (client: yes after all)");
});

test("a new area is added before the gap questions", () => {
  const { md } = addFloorItem(numberFloor(good), "Loyalty", "Points on every order");
  const p = parseFloor(md);
  assert.equal(p.areas.at(-1).name, "Loyalty");
  assert.equal(p.gaps.length, 5);
  assert.equal(p.leaders.length, 3);
});

test("a BMAD document that drops floor items can't be signed off", () => {
  const n = numberFloor(good);
  const live = floorItems(n).filter((i) => i.state !== "out");
  const all = live.map((i) => `- ${i.text} (${i.id})`).join("\n");
  assert.equal(coverageProblem(n, all), "");
  const short = live.slice(1).map((i) => `${i.id}`).join(" ");
  assert.equal(floorCoverage(n, short).missing.length, 1);
  assert.match(coverageProblem(n, short), /leaves out 1 of the 28/);
  // Items the client said no to don't have to appear.
  assert.equal(coverageProblem(setFloorItem(n, live[0].id, "out", "no"), short), "");
});
