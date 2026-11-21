import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRich, humanKey } from "../src/lib/studio/richText.ts";

test("a run-on dash note becomes a bullet list, no words lost", () => {
  const b = parseRich("- When showing numbers, say where they came from. - Ask the owner before guessing - Keep it short");
  assert.equal(b.length, 1);
  assert.equal(b[0].kind, "list");
  assert.deepEqual(b[0].items, ["When showing numbers, say where they came from.", "Ask the owner before guessing", "Keep it short"]);
});
test("numbered lines are an ordered list; paragraphs split on blank lines", () => {
  const b = parseRich("First thing.\n\n1. one\n2. two");
  assert.equal(b[0].kind, "paragraph");
  assert.equal(b[1].kind, "list");
  assert.equal(b[1].ordered, true);
});
test("hyphenated words stay prose", () => {
  const b = parseRich("A well-known, long-term plan - which we keep.");
  assert.equal(b.length, 1);
  assert.equal(b[0].kind, "paragraph");
});
test("key: value lines become rows; one lone line stays a sentence", () => {
  assert.equal(parseRich("Owner: Dana\nStatus: open")[0].kind, "pairs");
  assert.equal(parseRich("Note: this is a sentence")[0].kind, "paragraph");
});
test("JSON becomes rows or code", () => {
  const r = parseRich('{"lastReadAt":"today","count":3}')[0];
  assert.equal(r.kind, "pairs");
  assert.equal(r.rows[0].key, "Last read at");
  assert.equal(parseRich('{"a":{"b":1}}')[0].kind, "code");
});
test("humanKey", () => { assert.equal(humanKey("last_read_at"), "Last read at"); });
test("a run-on on a line that already starts with a dash is split too", () => {
  const b = parseRich("- One thing. - Two things. - Three things\n\nAfter.");
  assert.equal(b[0].items.length, 3);
});
