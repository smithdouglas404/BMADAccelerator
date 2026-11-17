import test from "node:test";
import assert from "node:assert/strict";
import { decide, allowedEmails } from "../src/lib/studioAuth.ts";

const base = { hasKeys: true, allowed: ["me@example.com"], signedIn: true, emails: ["me@example.com"] };

test("the allowed person gets in", () => assert.equal(decide(base).status, 204));
test("email match ignores case", () => assert.equal(decide({ ...base, emails: ["ME@Example.com"] }).status, 204));
test("a stranger is refused", () => assert.equal(decide({ ...base, emails: ["x@example.com"] }).status, 403));
test("signed out goes to sign-in", () => assert.equal(decide({ ...base, signedIn: false, emails: [] }).status, 401));
test("no keys fails closed", () => assert.equal(decide({ ...base, hasKeys: false }).status, 503));
test("no allowed emails fails closed", () => assert.equal(decide({ ...base, allowed: [] }).status, 503));
test("allowed list parsing", () => assert.deepEqual(allowedEmails(" A@x.com, b@y.com;junk "), ["a@x.com", "b@y.com"]));
