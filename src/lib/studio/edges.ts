// Session-scoped provenance (the design team's v6 rule): a trace edge is written only when something
// really happens in the Studio. The package's SPEC_TRACE.json is read from these, so a clean run holds
// only the edges of what the owner actually did; nothing is seeded. Pure, so tests load it directly.
import type { TraceStep } from "./spec.ts";

export const SESSION_EDGES = {
  ownerMessage: (text: string): [string, TraceStep[]] => [
    "prd-use-case",
    [
      { label: "Conversation", detail: text, type: "conversation" },
      { label: "Backlog", detail: clip58(text), type: "backlog" },
    ],
  ],
  capture: (text: string): [string, TraceStep[]] => ["prd-flows", [{ label: "Backlog", detail: text, type: "backlog" }]],
  recommendation: (title: string): [string, TraceStep[]] => [
    "prd-acceptance",
    [
      { label: "Recommendation", detail: title, type: "inference" },
      { label: "Backlog", detail: title, type: "backlog" },
    ],
  ],
  annotation: (shape: string, target: string, note: string): [string, TraceStep[]][] => [
    ["prd-flows", [{ label: "Annotation", detail: `${shape} on ${target}: ${note}`, type: "annotation" }]],
    ["trd-states", [{ label: "Package", detail: "Visual annotation attached to the generated artifact", type: "annotation" }]],
  ],
  packaged: (): [string, TraceStep[]] => ["trd-context", [{ label: "Execution", detail: "Claude Code ZIP generated from current Studio state", type: "execution" }]],
};

export const clip58 = (text: string) => (text.length > 58 ? `${text.slice(0, 58)}…` : text);

