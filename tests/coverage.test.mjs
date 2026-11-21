// Doug (Nov 21): every agent is an agent plus a skill of questions; every agent listens to every
// conversation and joins in when the words touch its part; ask enough to call it complete, not everything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { parseAreas, coverageOf, coverageLine, teamListens } from "../src/lib/studio/coverageCore.ts";
import { SPECIALISTS } from "../src/lib/studio/core.ts";

const SKILLS = path.join(process.cwd(), "studio-skills");

test("every specialist has its own skill in the Studio's format", async () => {
  for (const s of SPECIALISTS) {
    const md = await fs.readFile(path.join(SKILLS, s.skill, "SKILL.md"), "utf8");
    assert.match(md, new RegExp(`^---\\nname: ${s.skill}\\n`), s.skill);
    assert.match(md, /^origin: Working Backwards Studio$/m, s.skill);
    assert.match(md, /^## When to Activate$/m, s.skill);
    assert.match(md, /record_coverage/, s.skill);
    assert.match(md, /share_finding/, s.skill);
  }
});

test("the four role skills list their question areas with what enough means; the domain expert derives its own", async () => {
  for (const s of SPECIALISTS) {
    const areas = parseAreas(await fs.readFile(path.join(SKILLS, s.skill, "SKILL.md"), "utf8"));
    if (s.key === "domain") assert.equal(areas.length, 0);
    else {
      assert.ok(areas.length >= 5, `${s.skill} has ${areas.length} areas`);
      for (const a of areas) assert.match(a.enough, /^Enough when /, `${s.skill}:${a.key}`);
    }
  }
  const ba = parseAreas(await fs.readFile(path.join(SKILLS, "studio-business-analyst", "SKILL.md"), "utf8"));
  assert.ok(ba.some((a) => a.key === "rules"), "the business analyst asks about business rules");
});

const team = [
  { key: "business-analyst", name: "Business analyst", skill: "studio-business-analyst", areas: [{ key: "rules", label: "Business rules", enough: "Enough when x" }, { key: "flow", label: "The main path", enough: "Enough when y" }] },
  { key: "domain", name: "Domain expert", skill: "studio-domain-expert", areas: [] },
];

test("coverage comes only from what was recorded; a specialist is complete when every area is answered or assumed", () => {
  let c = coverageOf(team, []);
  assert.equal(c[0].done, 0);
  assert.equal(c[0].complete, false);
  assert.equal(c[1].total, 0);
  assert.match(coverageLine(c[1]), /works out this field's areas/);
  c = coverageOf(team, [
    { specialist: "business-analyst", area: "rules", label: "", status: "covered", note: "Doug: refunds over $500 need a manager" },
    { specialist: "business-analyst", area: "flow", label: "", status: "partly", note: "" },
    { specialist: "domain", area: "deadlines", label: "Statutory deadlines", status: "open", note: "Enough when ..." },
  ]);
  assert.equal(c[0].done, 1);
  assert.match(coverageLine(c[0]), /1 of 2 areas answered; still open: The main path \(partly\)/);
  assert.equal(c[1].total, 1, "the domain expert's own areas count once it records them");
  c = coverageOf(team, [
    { specialist: "business-analyst", area: "rules", label: "", status: "covered", note: "" },
    { specialist: "business-analyst", area: "flow", label: "", status: "assumed", note: "Default: one reviewer" },
  ]);
  assert.equal(c[0].complete, true);
});

test("Socra's prompt makes every specialist listen, and says when it is enough", () => {
  const agentOf = (k) => SPECIALISTS.find((s) => s.key === k)?.agent ?? k;
  const open = teamListens(coverageOf(team, []), { agentOf, about: ["backlog:abc12345"], msg: "msg:m1" });
  assert.match(open, /Your team listens to every conversation/);
  assert.match(open, /business-analyst .*send `business-analyst`/);
  assert.match(open, /every specialist whose open areas they touch/);
  assert.match(open, /about \["backlog:abc12345"\]/);
  assert.match(open, /that's enough questions/);
  const full = coverageOf([team[0]], [
    { specialist: "business-analyst", area: "rules", label: "", status: "covered", note: "" },
    { specialist: "business-analyst", area: "flow", label: "", status: "covered", note: "" },
  ]);
  assert.match(teamListens(full, { agentOf }), /clear enough to build and suggest Build/);
});
