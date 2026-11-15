// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPartners } from "../src/lib/shadcnPartners.ts";

const index = { "@shadcn": "s", "@magicui": "https://magicui.design/r/{name}.json", "@aceternity": "a", "@other": "o" };

test("default partners are the curated ones the index lists", () => {
  assert.deepEqual(Object.keys(pickPartners(index, "")).sort(), ["@aceternity", "@magicui"]);
});
test("all, off and a custom list", () => {
  assert.deepEqual(Object.keys(pickPartners(index, "all")).sort(), ["@aceternity", "@magicui", "@other"]);
  assert.deepEqual(pickPartners(index, "off"), {});
  assert.deepEqual(pickPartners(index, "@other, @missing"), { "@other": "o" });
});
