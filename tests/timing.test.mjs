import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseOf, buildTimer } from "../src/lib/buildTiming.ts";

test("build time is sorted into plain phases", () => {
  assert.equal(phaseOf("Bash", { command: "cd app && npx shadcn@latest add button card" }), "Setup and installs");
  assert.equal(phaseOf("Bash", { command: "npm install" }), "Setup and installs");
  assert.equal(phaseOf("Bash", { command: "node /x/shot.mjs http://127.0.0.1:4999 shots /" }), "Screenshot checks");
  assert.equal(phaseOf("Read", { file_path: "/w/studio/shots/home-phone.png" }), "Screenshot checks");
  assert.equal(phaseOf("Write", { file_path: "/w/app/src/App.tsx" }), "Writing the app");
  assert.equal(phaseOf("mcp__studio__make_image", {}), "Design and images");
  const t = buildTimer(0);
  t.tool("Read", { file_path: "/w/studio/package/PRD.md" }, 60000);
  t.tool("Bash", { command: "npm install" }, 120000);
  t.tool("Write", { file_path: "/w/app/src/App.tsx" }, 300000);
  const r = t.report(600000);
  assert.equal(r.minutes, 10);
  assert.equal(r.phases[0].phase, "Writing the app");
  assert.equal(r.phases[0].minutes, 5);
});
