import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// The pure parts of the usage ledger: prices, estimates, runs per message, and the Nasiko mapping.
const load = async (file) => {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
};
const core = await load("../src/lib/llm/ledgerCore.ts");
const nasiko = await load("../src/lib/nasiko/core.ts");
const usage = await load("../src/lib/agent/usageCore.ts");
const svc = await load("../agent-service/src/usage.ts");

test("prices come from the model name, and an override wins", () => {
  assert.equal(core.priceFor("claude-haiku-5-5").input, 1);
  assert.equal(core.priceFor("gpt-4.1-mini").output, 1.6);
  assert.equal(core.priceFor("text-embedding-3-small").output, 0);
  assert.equal(core.priceFor("some-new-model"), null);
  assert.equal(core.priceFor("claude-haiku-5-5", '{"haiku":{"input":9,"output":9}}').input, 9);
  assert.equal(core.priceFor("claude-haiku-5-5", "not json").input, 1);
});

test("cost is tokens times price; an unpriced model costs 0 and says estimated", () => {
  assert.equal(core.estimateCost("gpt-4.1-mini", { input: 1_000_000, output: 1_000_000 }), 2);
  assert.equal(core.estimateCost("unknown", { input: 5, output: 5 }), null);
  const base = { agent: "x", kind: "document", provider: "anthropic", model: "claude-haiku-5-5", input: 1_000_000, output: 0 };
  assert.deepEqual(core.costOf({ ...base, reportedUsd: 0.42 }, false), { usd: 0.42, source: "reported" });
  assert.deepEqual(core.costOf({ ...base, reportedUsd: 0.42 }, true), { usd: 1, source: "estimated" });
  assert.deepEqual(core.costOf(base, false), { usd: 1, source: "estimated" });
  assert.deepEqual(core.costOf({ ...base, model: "unknown" }, false), { usd: 0, source: "estimated" });
});

test("tokens from text length are about a quarter of the characters", () => {
  assert.equal(core.estimateTokens("abcdefgh"), 2);
  assert.equal(core.estimateTokens(""), 0);
});

const row = (o) => ({ id: Math.random().toString(36), useCaseId: "u", turnId: "t1", agent: "Socra", kind: "turn", ok: true, attempt: 1, causes: "msg:m1", costUsd: 0.1, at: "2026-11-22T10:00:00Z", ...o });

test("runs per message: 4 messages and 14 runs shows which are retries", () => {
  const rows = [];
  // four messages; m1 needed 5 runs (a failed one, a resume fallback, a plan limit), the others fewer
  const plan = { m1: 5, m2: 4, m3: 3, m4: 2 };
  let t = 0;
  for (const [m, n] of Object.entries(plan))
    for (let i = 0; i < n; i++) rows.push(row({ causes: `msg:${m}`, turnId: `${m}-${i < 2 ? "a" : "b"}`, attempt: (i % 2) + 1, ok: !(m === "m1" && i === 0), at: new Date(Date.UTC(2026, 10, 22, 10, t++)).toISOString() }));
  rows.push(row({ kind: "build", causes: "" }), row({ kind: "document", causes: "" }));
  const per = core.runsPerMessage(rows);
  assert.equal(per.reduce((n, m) => n + m.runs, 0), 14);
  const m1 = per.find((m) => m.message === "m1");
  assert.equal(m1.runs, 5);
  assert.equal(m1.retries, 4);
  assert.equal(m1.failed, 1);
  assert.equal(per[0].message, "m1");
  assert.equal(per.find((m) => m.message === "m4").retries, 1);
});

test("a run with no message, a build and a baseline are not counted as answers", () => {
  const per = core.runsPerMessage([row({ causes: "" }), row({ kind: "build" }), row({ baseline: true }), row({ causes: "backlog:x" })]);
  assert.deepEqual(per, []);
});

test("one turn answering two messages counts for each, and a single clean run is no retry", () => {
  const per = core.runsPerMessage([row({ causes: "msg:a msg:b backlog:z" })]);
  assert.equal(per.length, 2);
  assert.ok(per.every((m) => m.runs === 1 && m.retries === 0 && m.failed === 0));
  assert.deepEqual(core.messagesOf("msg:a msg:a prfaq"), ["a"]);
  assert.equal(core.nextAttempt(0), 1);
  assert.equal(core.nextAttempt(2), 3);
});

test("the rollup totals every kind of call and shows the estimated part and the failures", () => {
  const base = { useCaseId: "u", model: "m", inputTokens: 10, outputTokens: 5, cacheTokens: 0, baseline: false, at: "2026-11-22T10:00:00Z" };
  const r = usage.rollup([
    { ...base, agent: "Socra", kind: "turn", costUsd: 1, costSource: "reported", ok: true },
    { ...base, agent: "Mem0 · muse", kind: "memory", costUsd: 0.01, costSource: "estimated", ok: true },
    { ...base, agent: "Document reader", kind: "document", costUsd: 0, costSource: "estimated", ok: false },
    { ...base, agent: "Socra", kind: "turn", costUsd: 5, costSource: "reported", ok: true, baseline: true },
  ]);
  assert.equal(r.runs, 3);
  assert.equal(r.failed, 1);
  assert.equal(r.totalUsd, 1.01);
  assert.equal(r.estimatedUsd, 0.01);
  assert.equal(r.byAgent[0].agent, "Socra");
  assert.deepEqual(r.byKind.map((k) => k.kind).sort(), ["document", "memory", "turn"]);
});

test("the rollup splits tokens in, out and cached, and gives each agent per product", () => {
  const row = (agent, useCaseId, costUsd) => ({ useCaseId, agent, kind: "turn", model: "m", inputTokens: 10, outputTokens: 5, cacheTokens: 2, costUsd, baseline: false, at: "2026-11-22T10:00:00Z" });
  const r = usage.rollup([row("Socra", "p1", 1), row("Socra", "p2", 2), row("Document reader", "p1", 0.5)]);
  const socra = r.byAgent.find((a) => a.agent === "Socra");
  assert.deepEqual([socra.inputTokens, socra.outputTokens, socra.cacheTokens], [20, 10, 4]);
  const x = r.byAgentProduct.find((g) => g.agent === "Socra" && g.useCaseId === "p2");
  assert.equal(x.runs, 1);
  assert.equal(x.usd, 2);
  assert.equal(r.byAgentProduct.length, 3);
});

test("Nasiko gets the right provider, model, agent and session for every kind of call", () => {
  assert.deepEqual(nasiko.llmIdentity("letta", "anthropic/claude-haiku-5-5"), { provider: "anthropic", model: "claude-haiku-5-5" });
  assert.deepEqual(nasiko.llmIdentity("openai", "text-embedding-3-small"), { provider: "openai", model: "text-embedding-3-small" });
  assert.equal(nasiko.llmIdentity("letta", "gpt-4.1-mini").provider, "openai");
  assert.equal(nasiko.usageAgentName("Claude Code", "build"), "studio-claude-code");
  assert.equal(nasiko.usageAgentName("Socra", "turn"), "studio-socra");
  assert.equal(nasiko.usageAgentName("Mem0 · recall", "memory"), "studio-mem0-recall");
  assert.equal(nasiko.usageAgentName("Document reader", "document"), "studio-document-reader");
  const run = { id: "r1", useCaseId: "", productName: "", agent: "Mem0 · recall", kind: "memory", model: "text-embedding-3-small", provider: "openai", inputTokens: 40, outputTokens: 0, cacheTokens: 0, at: new Date("2026-11-22T10:00:00Z"), ms: 12 };
  const ev = nasiko.usageEvent(run, "id1", "studio-mem0-recall");
  assert.match(ev.event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(ev.source.agent_id, "id1");
  assert.equal(ev.session.id, "id1:mem0-recall:system");
  assert.equal(ev.session.title, undefined);
  assert.equal(ev.turn.llm_calls[0].provider, "openai");
  assert.equal(ev.turn.llm_calls[0].model, "text-embedding-3-small");
  assert.equal(ev.turn.llm_calls[0].input_tokens, 40);
});

test("the agent service reads tokens from Anthropic, OpenAI and Gemini answers, and says so when there are none", () => {
  assert.deepEqual(svc.tokensFromRaw('{"model":"claude-haiku-5-5","usage":{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":2}}'), { input: 7, output: 3, cache: 2, model: "claude-haiku-5-5" });
  assert.deepEqual(svc.tokensFromRaw('{"model":"gpt-5-mini","usage":{"prompt_tokens":9,"completion_tokens":4}}'), { input: 9, output: 4, cache: 0, model: "gpt-5-mini" });
  assert.deepEqual(svc.tokensFromRaw('{"modelVersion":"gemini-2.5-flash","usageMetadata":{"promptTokenCount":11,"candidatesTokenCount":6}}'), { input: 11, output: 6, cache: 0, model: "gemini-2.5-flash" });
  assert.equal(svc.tokensFromRaw('{"id":"x"}'), null);
  assert.equal(svc.tokensFromRaw("nope"), null);
  assert.equal(svc.tokensFromRaw(undefined), null);
});
