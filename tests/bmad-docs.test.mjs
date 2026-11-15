import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDoc, docApproved, statusOf } from "../src/lib/bmadDocs.ts";

const I = "_bmad-output/initiative-hello-world-g187";

test("the files BMAD writes land in the right stage document", () => {
  const k = (p) => classifyDoc(p)?.key;
  assert.equal(k("bacc/intake.md"), "intake");
  assert.equal(k(`${I}/brief-hello-world/brief-hello-world.md`), "brief");
  assert.equal(k(`${I}/prd-hello-world/prd-hello-world.md`), "prd");
  assert.equal(k(`${I}/ux-hello-world/DESIGN.md`), "ux");
  assert.equal(k(`${I}/ux-hello-world/EXPERIENCE.md`), "ux");
  assert.equal(k(`${I}/architecture-hello-world/architecture-hello-world.md`), "architecture");
  assert.equal(k(`${I}/tickets/epic-shop/epic-shop.md`), "tickets");
  assert.equal(k(`${I}/tickets/epic-shop/story-1.2-plan.md`), "plans");
  assert.equal(k("bacc/design/concept.md"), "ux");
  assert.equal(k("bacc/advisor/agentic-map.md"), "architecture");
});

test("memory logs, templates, HTML and uploads are not shown", () => {
  for (const p of [`${I}/brief-x/.memlog.md`, `${I}/brief-x/brief-x.template.md`, `${I}/brief-x/brief-x.html`, "bacc/uploads/brand.md", `${I}/ux-x/imports/ref.md`, "README.md"]) {
    assert.equal(classifyDoc(p), null, p);
  }
});

test("reviews are kept apart from the document they review", () => {
  assert.equal(classifyDoc(`${I}/brief-x/review-edge-cases.md`)?.role, "review");
  assert.equal(classifyDoc(`${I}/architecture-x/reviews/adversarial.md`)?.role, "review");
  assert.equal(classifyDoc(`${I}/prd-x/prd-x.md`)?.role, "main");
});

test("approved only after the matching sign-off, otherwise draft or not started", () => {
  const signoffs = [
    { title: "Sign off: PRD validation", status: "approved" },
    { title: "Sign off: Architecture review", status: "open" },
  ];
  assert.equal(docApproved("prd", signoffs), true);
  assert.equal(docApproved("architecture", signoffs), false);
  assert.equal(docApproved("intake", signoffs), false);
  const files = [{ key: "prd", role: "main", status: "approved" }, { key: "ux", role: "main", status: "draft" }, { key: "brief", role: "review", status: "draft" }];
  assert.equal(statusOf("prd", files), "approved");
  assert.equal(statusOf("ux", files), "draft");
  assert.equal(statusOf("brief", files), "missing");
});
