import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { decide, list, clerkIssuer, verifySession } from "../src/lib/studioAuth.ts";

const base = { issuer: "https://x.clerk.accounts.dev", emails: ["me@example.com"], users: [], signedIn: true, userId: "user_1", email: "me@example.com" };

test("the allowed email gets in", () => assert.equal(decide(base).status, 204));
test("email match ignores case", () => assert.equal(decide({ ...base, email: "ME@Example.com" }).status, 204));
test("the allowed user id gets in without an email claim", () => assert.equal(decide({ ...base, emails: [], users: ["user_1"], email: "" }).status, 204));
test("a stranger is refused", () => assert.equal(decide({ ...base, email: "x@example.com" }).status, 403));
test("signed out goes to sign-in", () => assert.equal(decide({ ...base, signedIn: false }).status, 401));
test("no Clerk key fails closed", () => assert.equal(decide({ ...base, issuer: "" }).status, 503));
test("nobody allowed fails closed", () => assert.equal(decide({ ...base, emails: [], users: [] }).status, 503));
test("list parsing", () => assert.deepEqual(list(" A@x.com, b@y.com;"), ["a@x.com", "b@y.com"]));
test("issuer comes from the publishable key", () => assert.equal(clerkIssuer("pk_test_dXNlZnVsLWJpcmQtNjU4OC5jbGVyay5hY2NvdW50cy5kZXYk"), "https://useful-bird-6588.clerk.accounts.dev"));
test("a bad key gives no issuer", () => assert.equal(clerkIssuer("nope"), ""));

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "ins_t", alg: "RS256", use: "sig" };
const jwks = JSON.stringify({ keys: [jwk] });
const ISS = "https://x.clerk.accounts.dev";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function mint(over = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", typ: "JWT", kid: "ins_t" });
  const p = b64({ iss: ISS, sub: "user_1", nbf: now - 5, exp: now + 60, ...over });
  return `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(key).toString("base64url")}`;
}
test("a genuine sign-in verifies", () => assert.equal(verifySession(mint(), jwks, ISS)?.sub, "user_1"));
test("a forged signature is refused", () => assert.equal(verifySession(mint({}, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey), jwks, ISS), null));
test("a tampered body is refused", () => { const [h, , s] = mint().split("."); assert.equal(verifySession(`${h}.${b64({ iss: ISS, sub: "user_2", exp: 9999999999 })}.${s}`, jwks, ISS), null); });
test("an expired sign-in is refused", () => assert.equal(verifySession(mint({ exp: 1000 }), jwks, ISS), null));
test("another issuer is refused", () => assert.equal(verifySession(mint({ iss: "https://evil.example" }), jwks, ISS), null));
test("an unsigned token is refused", () => assert.equal(verifySession(`${b64({ alg: "none", kid: "ins_t" })}.${b64({ iss: ISS, sub: "u", exp: 9999999999 })}.`, jwks, ISS), null));
