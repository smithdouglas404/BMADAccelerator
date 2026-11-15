// Run: npm test  (Node 22 strips the TypeScript types itself.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ROLES, providerOf, lettaHandle, modelProblem, encryptWith, decryptWith } from "../src/lib/settingsCatalog.ts";

const role = (env) => ROLES.find((r) => r.env === env);

test("a model's provider comes from its name", () => {
  assert.equal(providerOf("claude-sonnet-5-5"), "anthropic");
  assert.equal(providerOf("anthropic/claude-haiku-5-5"), "anthropic");
  assert.equal(providerOf("gpt-5-mini"), "openai");
  assert.equal(providerOf("gemini-2.5-flash"), "gemini");
  assert.equal(providerOf("google_ai/gemini-2.5-pro"), "gemini");
  assert.equal(providerOf("llama-3"), null);
});

test("Letta gets provider/model handles", () => {
  assert.equal(lettaHandle("claude-haiku-5-5"), "anthropic/claude-haiku-5-5");
  assert.equal(lettaHandle("gemini-2.5-flash"), "google_ai/gemini-2.5-flash");
  assert.equal(lettaHandle("openai/gpt-5"), "openai/gpt-5");
});

test("a model always needs its provider's key", () => {
  const none = () => false;
  const all = () => true;
  assert.match(modelProblem(role("BACC_APP_MODEL"), "gemini-2.5-flash", none, false), /Add the Google Gemini key first/);
  assert.equal(modelProblem(role("BACC_APP_MODEL"), "gemini-2.5-flash", all, false), "");
  assert.equal(modelProblem(role("BACC_APP_MODEL"), "off", none, false), "");
  // The Claude plan covers the Claude-only jobs without a key.
  assert.equal(modelProblem(role("BACC_MODEL"), "claude-haiku-5-5", none, true), "");
  assert.match(modelProblem(role("BACC_MODEL"), "claude-haiku-5-5", none, false), /Anthropic/);
});

test("Claude-only jobs refuse other providers", () => {
  assert.match(modelProblem(role("BACC_MODEL"), "gpt-5", () => true, true), /Claude\) models only/);
  assert.match(modelProblem(role("BACC_IMAGE_MODEL"), "claude-sonnet-5-5", () => true, true), /OpenAI models only/);
});

test("keys round-trip through encryption and fail with the wrong secret", () => {
  const secret = randomBytes(32);
  const c = encryptWith(secret, "sk-test-123456789");
  assert.ok(!c.includes("sk-test"));
  assert.equal(decryptWith(secret, c), "sk-test-123456789");
  assert.throws(() => decryptWith(randomBytes(32), c));
});
