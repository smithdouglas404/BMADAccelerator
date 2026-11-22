import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// core.ts has no imports: compile it on its own, like the other pure-module tests.
const src = readFileSync(new URL("../src/lib/nasiko/core.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const core = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const spec = { name: "studio-business-analyst", displayName: "Business analyst", description: "Pins down flows and rules.", skills: [{ id: "studio-business-analyst", name: "studio-business-analyst", description: "Questions", tags: ["specialist"] }], tags: ["team"], kind: "team", key: "business-analyst" };

test("names are lowercase, hyphenated and short enough", () => {
  assert.equal(core.slug("Claims Expert!"), "claims-expert");
  assert.equal(core.agentName("team", "business-analyst"), "studio-business-analyst");
  assert.equal(core.agentName("product", "Claims expert", "Claim Snap"), "studio-claim-snap-claims-expert");
  assert.ok(core.agentName("product", "x".repeat(200), "y".repeat(200)).length <= core.NAME_MAX);
});

test("the agent card follows A2A and points at the Studio's door", () => {
  const c = core.agentCard(spec, "http://host.docker.internal:3000/");
  assert.equal(c.supportedInterfaces[0].url, "http://host.docker.internal:3000/api/a2a/studio-business-analyst");
  assert.equal(c.supportedInterfaces[0].protocolBinding, "JSONRPC");
  assert.deepEqual(c.defaultInputModes, ["text/plain"]);
  assert.equal(c.skills[0].id, "studio-business-analyst");
});

test("the registration body is Nasiko's CreateAgent with the address, never a key", () => {
  const b = core.registrationBody(spec, "http://x:3000");
  assert.equal(b.url, "http://x:3000/api/a2a/studio-business-analyst");
  assert.equal(b.metadata.source, "working-backwards-studio");
  assert.ok(!JSON.stringify(b).match(/token|password|secret/i));
});

test("sign in again after 6 days or when never signed in", () => {
  const now = Date.now();
  assert.equal(core.needsLogin(null, now), true);
  assert.equal(core.needsLogin(new Date(now - 5 * 24 * 3600_000), now), false);
  assert.equal(core.needsLogin(new Date(now - 6 * 24 * 3600_000 - 1), now), true);
});

test("addresses must be plain http(s) with no credentials", () => {
  assert.equal(core.cleanUrl("http://host.docker.internal:8480/"), "http://host.docker.internal:8480");
  assert.equal(core.cleanUrl("https://user:pw@x.com"), null);
  assert.equal(core.cleanUrl("ftp://x.com"), null);
  assert.equal(core.cleanUrl("nonsense"), null);
});

test("the A2A door refuses the tunnel and public hosts", () => {
  const h = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
  assert.equal(core.a2aAllowed(h({ host: "host.docker.internal:3000" })), true);
  assert.equal(core.a2aAllowed(h({ host: "localhost:3000" })), true);
  assert.equal(core.a2aAllowed(h({ host: "localhost:3000", "cf-ray": "abc" })), false);
  assert.equal(core.a2aAllowed(h({ host: "studio.innume.com" })), false);
  assert.equal(core.a2aAllowed(h({ host: "app:3000", "x-forwarded-for": "172.18.0.1" })), true);
  assert.equal(core.a2aAllowed(h({ host: "localhost:3000", "x-forwarded-host": "studio.innume.com" })), false);
});

test("A2A messages: text parts only, JSON-RPC envelopes", () => {
  assert.equal(core.messageText({ parts: [{ text: "a" }, { file: 1 }, { text: "b" }] }), "a\nb");
  assert.equal(core.messageText(null), "");
  assert.equal(core.rpcErr(1, -32602, "x").error.code, -32602);
  const t = core.task("t1", "completed", "done");
  assert.equal(t.status.state, "completed");
  assert.equal(t.artifacts[0].parts[0].text, "done");
});

// ---- LLM usage: a resumed session is counted once ----
import { usageDelta, totalsOf, rollup } from "../src/lib/agent/usageCore.ts";
test("usage: a fresh session counts its whole total, a resumed one only what it added", () => {
  const t = (cost, input = 0, output = 0, cache = 0) => ({ cost, input, output, cache });
  assert.deepEqual(usageDelta(null, t(0.5, 100, 20, 5), false), { delta: t(0.5, 100, 20, 5), baseline: false });
  assert.deepEqual(usageDelta(t(0.5, 100, 20, 5), t(0.8, 160, 50, 5), true).delta, { cost: 0.8 - 0.5, input: 60, output: 30, cache: 0 });
  // first sight of a resumed session: its earlier cost is not ours
  assert.deepEqual(usageDelta(null, t(9, 1000, 100, 0), true), { delta: t(0), baseline: true });
  // a total that went down (session reset) never records a negative
  assert.equal(usageDelta(t(2, 10, 10, 0), t(1, 5, 5, 0), true).delta.cost, 0);
});
test("usage: totals come from Claude's per-model report and the main model is the one that wrote most", () => {
  const r = totalsOf({ total_cost_usd: 1.25, modelUsage: { a: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2, cacheCreationInputTokens: 3 }, b: { inputTokens: 1, outputTokens: 50 } } });
  assert.deepEqual(r, { totals: { cost: 1.25, input: 11, output: 55, cache: 5 }, model: "b" });
});
test("usage: the rollup groups per agent and per product and skips baselines", () => {
  const row = (agent, useCaseId, costUsd, baseline = false) => ({ agent, useCaseId, kind: "turn", model: "m", inputTokens: 10, outputTokens: 5, cacheTokens: 0, costUsd, baseline, at: "2026-11-22T00:00:00Z" });
  const r = rollup([row("Socra", "p1", 1), row("Socra", "p2", 2), row("Claude Code", "p1", 4), row("Socra", "p1", 99, true)]);
  assert.equal(r.runs, 3);
  assert.equal(r.totalUsd, 7);
  assert.deepEqual(r.byAgent.map((a) => [a.agent, a.usd]), [["Claude Code", 4], ["Socra", 3]]);
  assert.deepEqual(r.byProduct.map((p) => [p.useCaseId, p.usd]), [["p1", 5], ["p2", 2]]);
});
