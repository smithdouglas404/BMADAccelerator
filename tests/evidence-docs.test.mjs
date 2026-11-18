// Run: npm test. Evidence cards point at the stored document they came from: the recorded id, else a path
// or file name in the source line. Nothing is matched when no stored file fits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { documentFor, withDocuments } from "../src/lib/studio/evidenceDocs.ts";

const W = "/data/workspaces/hello-world-g187";
const docs = [
  { id: "d-map", fileName: "Agentic map", storagePath: `${W}/bacc/advisor/agentic-map.md`, textPath: `${W}/bacc/advisor/agentic-map.md`, origin: "bmad", createdAt: "2026-11-16T10:00:00Z" },
  { id: "d-v6", fileName: "App review: version 6", storagePath: `${W}/bacc/advisor/app-review-v6.md`, origin: "bmad", createdAt: "2026-11-16T11:00:00Z" },
  { id: "d-bc-old", fileName: "hello-earth-business-case.docx", storagePath: `${W}/bacc/uploads/a-hello-earth-business-case.docx`, origin: "upload", createdAt: "2026-11-15T09:00:00Z" },
  { id: "d-bc", fileName: "hello-earth-business-case.docx", storagePath: `${W}/bacc/uploads/b-hello-earth-business-case.docx`, textPath: `${W}/bacc/uploads/b-hello-earth-business-case.docx.md`, origin: "upload", createdAt: "2026-11-15T10:00:00Z" },
];
const ev = (source, documentId = "") => ({ id: "e", source, documentId });

test("a recorded document id wins", () => {
  assert.equal(documentFor(ev("anything", "d-v6"), docs)?.id, "d-v6");
});
test("a workspace path named in the source finds the file", () => {
  assert.equal(documentFor(ev("Agentic map (bacc/advisor/agentic-map.md); client decision OQ-4"), docs)?.id, "d-map");
  assert.equal(documentFor(ev("Version 6 app review (bacc/advisor/app-review-v6.md)"), docs)?.id, "d-v6");
});
test("a file named in words finds the readable upload", () => {
  assert.equal(documentFor(ev("Hello Earth business case (uploaded .docx)"), docs)?.id, "d-bc");
});
test("conversation and research with no stored file match nothing", () => {
  assert.equal(documentFor(ev("Owner intake, Acme Insurance, Operations"), docs), undefined);
  assert.equal(documentFor(ev("NAIC Model 902 and state variations"), docs), undefined);
  assert.deepEqual(withDocuments([ev("Owner's words")], docs).map((e) => e.documentId), [""]);
});
