// Run: npm test. The conversation's pure rules: numbered picks, spoken clean-up, working names, specialists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, SPECIALISTS, numberedOptions, pickedNumbers, tidySpeech, workingName, isAffirmative } from "../src/lib/studio/core.ts";

test("numbered options are read from a Muse message, in order", () => {
  const text = "Who decides a claim today?\n\n1. Missing documents slow it most\n2) Waiting for an adjuster\n**3.** Back-and-forth on the decision";
  assert.deepEqual(numberedOptions(text), [
    { n: 1, label: "Missing documents slow it most" },
    { n: 2, label: "Waiting for an adjuster" },
    { n: 3, label: "Back-and-forth on the decision" },
  ]);
  assert.deepEqual(numberedOptions("No choices here."), []);
});

test("a number, several numbers or a tapped chip is a pick; ordinary words are not", () => {
  assert.deepEqual(pickedNumbers("2"), [2]);
  assert.deepEqual(pickedNumbers("2 and 5"), [2, 5]);
  assert.deepEqual(pickedNumbers("1, 3"), [1, 3]);
  assert.deepEqual(pickedNumbers("option 4"), [4]);
  assert.deepEqual(pickedNumbers("2. Waiting for an adjuster"), [2]);
  assert.equal(pickedNumbers("We have 2 adjusters and 5 clerks"), null);
  assert.equal(pickedNumbers("the second one feels right"), null);
});

test("a spoken yes is a yes", () => {
  assert.ok(isAffirmative(tidySpeech("um yes yes that's right")));
});

test("speech is tidied without changing what was said", () => {
  assert.equal(tidySpeech("um so the the claimant uploads photos uh and then i get a notification"), "So the claimant uploads photos and then I get a notification.");
  assert.equal(tidySpeech("yes"), "Yes.");
  assert.equal(tidySpeech("what about appeals? they matter"), "What about appeals? They matter.");
});

test("a working name comes from the first words until the Muse names the product", () => {
  assert.equal(workingName("An insurance claims tool: people file a claim with photos"), "Insurance Claims");
  assert.equal(workingName(""), "New product");
});

test("the Muse has five visible specialists and the product has roles", () => {
  assert.deepEqual(SPECIALISTS.map((s) => s.key), ["business-analyst", "architect", "engineer", "ux", "domain"]);
  for (const r of ["Product owner", "Business analyst", "Product engineer"]) assert.ok(ROLES.includes(r));
});
