// Run: npm test. Every agent has the same memory (Letta persona + Mem0), a field's expert gets its own when
// the field is named, and "is it used" is counted from real events (Doug, Nov 21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, domainRole, fieldSlug, memAgentId, roleFor, specialistRoleKey } from "../src/lib/memory/lettaCore.ts";
import { usageFromEvents, usageFromRuns, verdictFor } from "../src/lib/memory/usageCore.ts";
import { SPECIALISTS } from "../src/lib/studio/core.ts";

test("every visible specialist has its own memory role", () => {
  for (const s of SPECIALISTS) {
    const key = specialistRoleKey(s.key);
    assert.ok(roleFor(key), `${s.name} has no memory role (${key})`);
  }
  for (const r of ROLES) {
    assert.equal(r.agentName, `bacc-${r.key}`);
    assert.equal(r.memAgentId, memAgentId(r.key));
    assert.ok(r.persona.length > 100, "every role starts with a persona");
  }
});

test("a field's expert gets the same memory as soon as its field is named", () => {
  assert.equal(fieldSlug("Claims expert"), "claims-expert");
  assert.equal(specialistRoleKey("domain", "Claims expert"), "domain-claims-expert");
  assert.equal(specialistRoleKey("domain", ""), "domain");
  const r = roleFor("domain-claims-expert");
  assert.equal(r.name, "Claims expert");
  assert.equal(r.agentName, "bacc-domain-claims-expert");
  assert.equal(r.memAgentId, "studio-domain-claims-expert");
  assert.match(r.persona, /claims expert/i);
  assert.equal(domainRole("domain-x"), undefined);
  assert.equal(roleFor("not a role"), undefined);
});

test("usage is counted from events and says write-only when it is write-only", () => {
  const at = (d) => `2026-11-${d}T10:00:00Z`;
  const none = usageFromEvents([]);
  assert.equal(verdictFor(none, { facts: 3, blocks: 2 }).level, "unused");
  const writes = usageFromEvents([{ kind: "write", store: "mem0", count: 1, source: "x", createdAt: at("20") }, { kind: "lesson", store: "mem0", count: 1, source: "x", createdAt: at("21") }]);
  assert.equal(writes.writes, 2);
  assert.equal(verdictFor(writes, { facts: 2, blocks: 0 }).level, "write-only");
  const both = usageFromEvents([...[{ kind: "recall", store: "mem0", count: 4, source: "turn", createdAt: at("22") }], { kind: "reflect", store: "letta", count: 1, source: "gate", createdAt: at("23") }]);
  assert.equal(both.reads, 1);
  assert.equal(both.recordsRead, 4);
  assert.equal(both.lastUsed, "2026-11-23T10:00:00.000Z");
  assert.equal(verdictFor(both, { facts: 1, blocks: 1 }).level, "used");
});

test("a product agent's use is counted from the service's run steps", () => {
  const runs = [
    { agent: "triage", created_at: "2026-11-20T09:00:00Z", steps: [{ kind: "persona", detail: "Letta persona and its memory of this person loaded" }, { kind: "memory", detail: "Recalled 3 facts from Mem0" }, { kind: "memory", detail: "Remembered: a rule" }] },
    { agent: "triage", created_at: "2026-11-21T09:00:00Z", steps: [{ kind: "persona", detail: "Letta is not connected here; using the configured persona" }] },
    { agent: "other", steps: [{ kind: "memory", detail: "Recalled 9 facts from Mem0" }] },
  ];
  const u = usageFromRuns(runs, "triage");
  assert.equal(u.runs, 2);
  assert.equal(u.withPersona, 1);
  assert.equal(u.recordsRead, 3);
  assert.equal(u.writes, 1);
});

import { appendPlaybookLine, customerSlug, customerTag, keepPassages, playbookLabel, gateMessage } from "../src/lib/memory/lettaCore.ts";

test("a customer's playbook keeps newest first, drops repeats and stays inside its limit", () => {
  let v = "none yet";
  v = appendPlaybookLine(v, "ClaimSnap: photo required");
  v = appendPlaybookLine(v, "ClaimSnap: supervisors approve payouts");
  v = appendPlaybookLine(v, "ClaimSnap: photo required");
  assert.deepEqual(v.split("\n"), ["ClaimSnap: photo required", "ClaimSnap: supervisors approve payouts"]);
  const big = appendPlaybookLine("a ".repeat(10), "x".repeat(300), 200);
  assert.ok(big.length <= 200);
  assert.equal(appendPlaybookLine("keep", "   "), "keep");
});

test("customers never share playbooks or archive notes", () => {
  assert.equal(customerSlug("Acme Insurance"), "acme-insurance");
  assert.equal(customerSlug(""), "workspace");
  assert.notEqual(playbookLabel("Acme"), playbookLabel("Globex"));
  const notes = [
    { text: "acme rule", tags: [customerTag("Acme")] },
    { text: "globex rule", tags: [customerTag("Globex")] },
    { text: "untagged", tags: [] },
    { text: "no tags at all" },
  ];
  assert.deepEqual(keepPassages(notes, "Acme").map((n) => n.text), ["acme rule"]);
  assert.deepEqual(keepPassages(notes, "Nobody"), []);
});

test("a gate message names who decided so the role can note how they decide", () => {
  assert.match(gateMessage("ClaimSnap", "Photo required", "x", "yes", "Dana"), /Decided by: Dana/);
  assert.doesNotMatch(gateMessage("ClaimSnap", "g", "x", "yes"), /Decided by/);
});
