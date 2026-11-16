import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";

// The shared agent service. Runs only where its packages are installed (agent-service/node_modules)
// and a database is given (AGENT_SERVICE_TEST_DB); the config rules run everywhere.
const installed = existsSync(new URL("../agent-service/node_modules/@inngest/agent-kit", import.meta.url));
const db = process.env.AGENT_SERVICE_TEST_DB;

test("an agent gets a Letta persona by default; memory is scoped per customer and use case", { skip: !installed }, async () => {
  const { parseAgent, memoryScope, systemPrompt, lettaName } = await import("../agent-service/src/config.ts");
  const a = parseAgent({ key: "claim-triage", name: "Claim triage", purpose: "Sort new claims by urgency.", instructions: "Read the claim and suggest a priority with reasons." });
  assert.equal(a.persona.enabled, true);
  assert.match(a.persona.text, /Claim triage/);
  assert.equal(a.memory.facts, true);
  assert.equal(parseAgent({ ...a, persona: { enabled: false } }).persona.enabled, false);
  assert.notEqual(memoryScope("uc1", "Acme Insurance"), memoryScope("uc1", "Beta Mutual"));
  assert.equal(memoryScope("uc1", "Acme Insurance"), "acme-insurance:uc1");
  assert.match(systemPrompt(a, { human: "Prefers short answers", facts: ["Storm season starts in June"] }), /Prefers short answers[\s\S]*Storm season/);
  assert.equal(lettaName("uc1", "claim-triage", "Dana Lee"), "svc-uc1-claim-triage-dana-lee");
  assert.throws(() => parseAgent({ key: "Bad Key", name: "x", purpose: "y", instructions: "z" }));
});

test("register, run, approve, history: a demo run waits for a person and finishes on Approve", { skip: !installed || !db }, async () => {
  const { Store } = await import("../agent-service/src/store.ts");
  const { createService } = await import("../agent-service/src/server.ts");
  const { Mem0, Letta } = await import("../agent-service/src/memory.ts");
  const store = new Store(db);
  await store.init();
  await store.pool.query("truncate use_cases cascade");
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; // demo mode: no model key
  const { handler } = createService({ store, adminKey: "admin-test", mem0: new Mem0(""), letta: new Letta(""), pollMs: 50 });
  const server = http.createServer((q, s) => void handler(q, s));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (p, init = {}, auth = {}) => fetch(base + p, { ...init, headers: { "Content-Type": "application/json", ...auth } }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    const admin = { "X-Admin-Key": "admin-test" };
    assert.equal((await call("/v1/admin/use-cases/uc-claims-1", { method: "PUT", body: "{}" })).status, 401);
    const reg = await call("/v1/admin/use-cases/uc-claims-1", { method: "PUT", body: JSON.stringify({ customer: "Acme", name: "Claims" }) }, admin);
    assert.match(reg.body.token, /^ast_/);
    assert.ok(reg.body.callbackSecret);
    const other = await call("/v1/admin/use-cases/uc-other-2", { method: "PUT", body: JSON.stringify({ customer: "Beta", name: "Other" }) }, admin);
    const put = await call(
      "/v1/admin/use-cases/uc-claims-1/agents/claim-reply",
      { method: "PUT", body: JSON.stringify({ name: "Claim reply", purpose: "Draft the reply to a claimant.", instructions: "Draft a short, kind reply.", approvals: { output: true } }) },
      admin,
    );
    assert.equal(put.body.persona.enabled, true);
    const app = { Authorization: `Bearer ${reg.body.token}` };
    const agents = await call("/v1/agents", {}, app);
    assert.deepEqual(agents.body.map((a) => a.key), ["claim-reply"]);
    assert.deepEqual((await call("/v1/agents", {}, { Authorization: `Bearer ${other.body.token}` })).body, []);

    const started = await call("/v1/agents/claim-reply/runs", { method: "POST", body: JSON.stringify({ input: "Where is my claim?", person: "Dana" }) }, app);
    assert.equal(started.status, 202);
    let pending = [];
    for (let i = 0; i < 60 && !pending.length; i++) {
      await new Promise((r) => setTimeout(r, 50));
      pending = (await call("/v1/approvals?status=pending", {}, app)).body;
    }
    assert.equal(pending.length, 1);
    assert.equal(pending[0].kind, "output");
    assert.match(pending[0].detail, /\[Demo/);
    // Another app can't decide it.
    assert.equal((await call(`/v1/approvals/${pending[0].id}`, { method: "POST", body: JSON.stringify({ decision: "approve" }) }, { Authorization: `Bearer ${other.body.token}` })).status, 404);
    assert.equal((await call(`/v1/approvals/${pending[0].id}`, { method: "POST", body: JSON.stringify({ decision: "approve", comment: "Fine", by: "Dana" }) }, app)).status, 200);
    assert.equal((await call(`/v1/approvals/${pending[0].id}`, { method: "POST", body: JSON.stringify({ decision: "reject" }) }, app)).status, 409);
    let run;
    for (let i = 0; i < 60; i++) {
      run = (await call(`/v1/runs/${started.body.runId}`, {}, app)).body;
      if (run.status === "done") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(run.status, "done");
    assert.equal(run.demo, true);
    assert.ok(run.steps.some((s) => /Approved/.test(s.detail)));
    const view = await call("/v1/admin/use-cases/uc-claims-1", {}, admin);
    assert.equal(view.body.runs.length, 1);
    assert.equal(view.body.approvals[0].decided_by, "Dana");
  } finally {
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    server.close();
    await store.close();
  }
});
