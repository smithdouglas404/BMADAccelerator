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
