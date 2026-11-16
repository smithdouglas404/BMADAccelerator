// Run: npm test. The conversation's pure rules: numbered picks, spoken clean-up, working names, specialists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, SPECIALISTS, numberedOptions, pickedNumbers, tidySpeech, workingName, isAffirmative, proposalFrom, suggestedOption } from "../src/lib/studio/core.ts";

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

test("only a bare yes approves; a yes that goes on to say something new is a thought", () => {
  for (const t of ["yes", "Yeah.", "yes please", "sounds good", "yeah, let's do that", "Yes, go ahead", "ok do it", "perfect, ship it"]) assert.ok(isAffirmative(t), t);
  for (const t of [
    "yeah and tenants should be able to send a photo of the leak",
    "yes but only for admins",
    "yes, the adjuster sees it first",
    "sure, if the owner signs off",
    "Yes we have three adjusters",
  ])
    assert.equal(isAffirmative(t), false, t);
});

test("a yes approves only a proposal the Muse actually made", () => {
  assert.equal(proposalFrom("Got it. Should claimants upload photos with the first notice?"), "claimants upload photos with the first notice");
  assert.equal(proposalFrom("I'd suggest a calm status page first. Want me to add it?"), "add it");
  assert.equal(proposalFrom("That helps. How does your way differ from how others handle claims today?"), "");
  assert.equal(proposalFrom("Should sign-in be by email link or by password?"), "");
  assert.equal(proposalFrom("Noted, the architect will look at sign-in."), "");
  assert.equal(proposalFrom("Which matters most? I'd suggest photo upload first."), "photo upload first");
  assert.equal(proposalFrom("Do your adjusters work in the field?"), "");
});

test("a yes to numbered options picks only the marked suggestion", () => {
  assert.equal(suggestedOption("Where next?\n1. Intake\n2. Triage (suggested)\n3. Not sure or not ready"), 2);
  assert.equal(suggestedOption("Where next?\n1. Intake\n2. Triage\n\nI'd suggest 1."), 1);
  assert.equal(suggestedOption("Where next?\n1. Intake\n2. Triage\n3. Not sure or not ready"), null);
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

test("the Muse's core skills load on every turn: reimagine first, then the conversation", async () => {
  const { coreInstructions, CORE_SKILLS } = await import("../src/lib/agent/instructions.ts");
  assert.deepEqual([...CORE_SKILLS], ["studio-reimagine", "studio-muse"]);
  const text = await coreInstructions();
  assert.ok(text.indexOf('<core_skill name="studio-reimagine">') < text.indexOf('<core_skill name="studio-muse">'));
  for (const s of ["Reimagine", "Rethink", "Reinvent", "Accelerate", "Their way wins", "When nothing like it exists", "Ideation rounds", "One sharp question", "why us"]) assert.ok(text.includes(s), s);
  await assert.rejects(() => coreInstructions("/nonexistent"), /core skill studio-reimagine is missing/);
});

test("every specialist is told to read the reimagine skill", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/lib/agent/team.ts", import.meta.url), "utf8");
  assert.equal((src.match(/studio-reimagine\/SKILL\.md/g) || []).length, 2);
});

test("the reimagine skill facilitates first: ask how theirs differs, listen, suggest only when they can't say", async () => {
  const fs = await import("fs/promises");
  const md = await fs.readFile("studio-skills/studio-reimagine/SKILL.md", "utf8");
  assert.ok(md.indexOf("## 1. Facilitate first") > 0 && md.indexOf("## 1. Facilitate first") < md.indexOf("## 3. When they say"));
  assert.match(md, /how is this different from what others do\?/);
  assert.match(md, /Offer what others do only when they can't say, or ask/);
  const muse = await fs.readFile("studio-skills/studio-muse/SKILL.md", "utf8");
  assert.match(muse, /Facilitate first \(studio-reimagine section 1/);
});

test("the Muse asks one question with a suggestion, keeps a why us, and never shows the machinery", async () => {
  const fs = await import("fs/promises");
  const muse = await fs.readFile("studio-skills/studio-muse/SKILL.md", "utf8");
  assert.match(muse, /One question per reply, never more, and never without your suggestion/);
  assert.match(muse, /"\(suggested\)"/);
  assert.match(muse, /Never show the machinery/);
  assert.match(muse, /short "Why us" section/);
  assert.match(muse, /exactly one question, about what makes theirs different/);
  const team = await fs.readFile("src/lib/agent/team.ts", "utf8");
  assert.match(team, /At the opening never ask/);
  const { framed } = await import("../src/lib/agent/runner.ts").catch(() => ({ framed: null }));
  if (framed) {
    assert.equal(framed({ kind: "user", prompt: "hi" }), "hi");
    assert.match(framed({ kind: "build", prompt: "done" }), /^\[Studio update, not a message from anyone/);
  }
});
