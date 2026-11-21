// Doug (Nov 21): Generate PRFAQ from what you said. Only their words; every line linked; gaps marked; a second
// press can Reformat without changing or losing anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftMarkdown, prfaqFormat, prfaqGaps, prfaqMarkers, prfaqWithFootnotes, quoteIn, previousLines } from "../src/lib/studio/prfaqDraft.ts";

const skill = readFileSync("studio-skills/studio-prfaq/SKILL.md", "utf8");
const format = prfaqFormat(skill);
const talk = { id: "talk:r1", name: "Your talk", text: "So, um, field technicians waste an hour a day writing up visit reports by hand. I want them to just talk into their phone and the report is done before they leave the site." };
const doc = { id: "doc:d1", name: "pitch.pptx", text: "Pilot with 40 technicians in the northeast region starting in March." };

test("the format comes from the skill, in order", () => {
  assert.deepEqual(format.slice(0, 3).map((f) => f.key), ["headline", "subheading", "summary"]);
  assert.ok(format.some((f) => f.key === "customer-faq") && format.some((f) => f.key === "other"));
  assert.ok(format.every((f) => f.title && f.holds));
});

test("a quote must really be in their words", () => {
  assert.ok(quoteIn(talk.text, "waste an hour a day writing up visit reports"));
  assert.ok(quoteIn(talk.text, "Waste an hour, a day writing up visit reports!"));
  assert.ok(!quoteIn(talk.text, "save two hours a day"));
  assert.ok(!quoteIn(talk.text, "technicians"), "too short to prove anything");
});

test("generate keeps only grounded lines, links each one, and marks every gap as missing", () => {
  const draft = { sections: [
    { key: "headline", statements: [{ text: "Visit reports done before you leave the site", quote: "the report is done before they leave the site", from: "talk:r1" }], missing: [] },
    { key: "problem", statements: [
      { text: "Field technicians lose an hour every day writing visit reports by hand.", quote: "field technicians waste an hour a day writing up visit reports by hand", from: "talk:r1" },
      { text: "It costs the company $2M a year.", quote: "costs the company two million", from: "talk:r1" },
    ], missing: [] },
    { key: "internal-faq", statements: [{ question: "Where does the pilot start?", text: "With 40 technicians in the northeast region, from March.", quote: "Pilot with 40 technicians in the northeast region", from: "talk:r1" }], missing: [] },
    { key: "customer-quote", statements: [], missing: ["What has a technician said about writing reports today?"] },
  ] };
  const r = draftMarkdown(draft, format, [talk, doc]);
  assert.equal(r.kept, 3);
  assert.equal(r.dropped, 1, "the invented $2M line is dropped");
  assert.ok(!r.markdown.includes("$2M"));
  assert.match(r.markdown, /^# Visit reports done before you leave the site \[\^s1\]/);
  assert.equal(r.sources.s3.from, "doc:d1", "a quote found in the document links to the document, whatever the writer named");
  assert.match(r.markdown, /\*\*Q:\*\* Where does the pilot start\?\n\n\*\*A:\*\* With 40 technicians/);
  const gaps = prfaqGaps(r.markdown);
  assert.ok(gaps.includes("What has a technician said about writing reports today?"));
  assert.ok(gaps.length >= format.length - 4, "every section with nothing said is missing");
  assert.ok(!gaps.some((g) => /Lines from the earlier version/.test(g)), "Other notes is never missing");
  assert.deepEqual(prfaqMarkers(r.markdown), ["s1", "s2", "s3"]);
  assert.match(prfaqWithFootnotes(r.markdown, r.sources), /\[\^s3\]: pitch\.pptx: “Pilot with 40 technicians/);
});

test("reformat keeps every sentence and marker, adds nothing, and puts unplaced lines under Other notes", () => {
  const old = "# Reports before you leave [^s1]\n\nSome intro about reports that the owner wrote by hand. [^m:abcdefghij12]\n\n## Random heading\n\nTechnicians hate typing on tablets in the rain. [^s2]\n";
  const prf = { id: "prfaq", name: "PRFAQ", text: old };
  const draft = { sections: [
    { key: "headline", statements: [{ text: "Reports before you leave [^s1]", quote: "" }], missing: [] },
    { key: "problem", statements: [{ text: "Technicians hate typing on tablets in the rain. [^s2]", quote: "" }, { text: "A brand new claim the model made up.", quote: "" }], missing: [] },
  ] };
  const r = draftMarkdown(draft, format, [prf], "reformat", old);
  assert.equal(r.dropped, 1);
  assert.ok(!r.markdown.includes("brand new claim"));
  assert.match(r.markdown, /## The problem\nTechnicians hate typing on tablets in the rain\. \[\^s2\]/);
  assert.match(r.markdown, /## Other notes\nSome intro about reports that the owner wrote by hand\. \[\^m:abcdefghij12\]/);
  assert.deepEqual(prfaqMarkers(r.markdown).sort(), ["m:abcdefghij12", "s1", "s2"]);
  assert.deepEqual(Object.keys(r.sources), [], "reformat marks nothing new");
});

test("previousLines reads the content (questions too), not the scaffolding", () => {
  const lines = previousLines("# Title words here\n\n_For field teams who travel_ [^s2]\n\n> **Missing:** who is it for?\n\n**Q:** What is it?\n\n**A:** It writes your reports for you. [^s3]\n");
  assert.deepEqual(lines, ["Title words here", "For field teams who travel [^s2]", "What is it?", "It writes your reports for you. [^s3]"]);
});

test("update keeps everything already there and adds new lines only from the new material, numbered after the old", () => {
  const old = "# Reports before you leave [^s1]\n\n## The problem\nTechnicians hate typing on tablets in the rain. [^s2]\n\n> **Missing:** Who is the first customer?\n";
  const prf = { id: "prfaq", name: "The PRFAQ as it stood", text: old };
  const draft = { sections: [
    { key: "headline", statements: [{ text: "Reports before you leave [^s1]", quote: "", from: "prfaq" }], missing: [] },
    { key: "problem", statements: [{ text: "Technicians hate typing on tablets in the rain. [^s2]", quote: "", from: "prfaq" }], missing: [] },
    { key: "summary", statements: [
      { text: "A 40-technician pilot starts in March in the northeast.", quote: "Pilot with 40 technicians in the northeast region", from: "doc:d1" },
      { text: "It halves overtime.", quote: "halves overtime for everyone", from: "doc:d1" },
    ], missing: [] },
  ] };
  const r = draftMarkdown(draft, format, [doc, prf], "update", old);
  assert.equal(r.dropped, 1, "the line not in the new material is left out");
  assert.match(r.markdown, /A 40-technician pilot starts in March in the northeast\. \[\^s3\]/);
  assert.deepEqual(Object.keys(r.sources), ["s3"]);
  assert.match(r.markdown, /Technicians hate typing on tablets in the rain\. \[\^s2\]/);
  assert.match(r.markdown, /^# Reports before you leave \[\^s1\]/);
});

test("the explainer and the walkthrough come from the skill: every section has a question and a bar", async () => {
  const { prfaqWalkSteps, skillSection } = await import("../src/lib/studio/prfaqDraft.ts");
  assert.match(skillSection(skill, "What a PRFAQ is"), /as if the product is already out/);
  const steps = prfaqWalkSteps(skill);
  for (const f of format.filter((x) => x.key !== "other")) {
    const s = steps.find((x) => x.key === f.key);
    assert.ok(s && s.ask.endsWith("?") || s.ask.includes("?"), `${f.key} has a question`);
    assert.ok(s.bar.length > 20, `${f.key} has a bar`);
  }
});
