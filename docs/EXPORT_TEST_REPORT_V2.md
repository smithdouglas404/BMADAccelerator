# Claude Code export workflow test

## Sample feature request

> Let people save a voice note while walking, then have Socra transcribe it and ask one clarifying question before it becomes a backlog item.

The request was submitted through the real Socra conversation UI. The Studio responded with `Thought held for curation`, preserved the original language, added it to product truth, and increased the ambient backlog from 4 to 5 signals.

## Export result

The Prototype Brief generated and downloaded:

`kite-claude-code-prototype.zip`

The ZIP contains 16 files:

- `README.md`
- `PRFAQ.md`
- `VALIDATED_USE_CASE.md`
- `TECHNICAL_REQUIREMENTS.md`
- `COMPONENT_MAP.json`
- `AGENT_KIT_ROUTING.json`
- `KANBAN.json`
- `EVIDENCE.json`
- `VISUAL_ANNOTATIONS.json`
- `PRD.md`
- `TRD.md`
- `SPEC_TRACE.json`
- `CONVERSATION.json`
- `BACKLOG.json`
- `PACKAGE_MANIFEST.json`
- `CLAUDE_CODE_PROMPT.md`

The export advanced the UI from `Iteration 0 / draft` to `Iteration 1 / downloaded`.

## Prompt structure

`CLAUDE_CODE_PROMPT.md` contains:

1. Product and implementation-agent framing.
2. A scope guardrail: do not invent product scope outside the package.
3. Customer-language preservation from `PRFAQ.md`.
4. shadcn/ui guidance.
5. Agent Kit routing guidance.
6. Explicit and reversible human-in-the-loop decisions.
7. Traceability to `KANBAN.json`.
8. A preference for a thin vertical slice over broad scaffolding.
9. A `First move` section pointing to the first execution item: `Voice capture becomes a held thought`.

## SPEC_TRACE.json schema

Each provenance edge has four fields:

```json
{
  "section": "Primary customer flow",
  "label": "Annotation",
  "detail": "Circle region on Thought input: “Make this feel less like a form.”",
  "type": "annotation"
}
```

- `section` identifies the Living PRD or TRD section receiving the signal.
- `label` names the source step in human language.
- `detail` preserves the original statement, evidence, or inferred decision.
- `type` classifies the edge as `conversation`, `evidence`, `annotation`, `inference`, `backlog`, or `execution`.

## Provenance walkthrough

The voice and visual path is represented as a chain rather than a single opaque requirement:

```text
Voice / conversation
  → Socra inference
  → backlog signal
  → Living PRD section
  → TRD state transition
  → execution item
  → Claude Code first move
```

For the original seeded demo trace used to explain the schema (not the corrected session export):

| Source edge | Living section | Meaning |
|---|---|---|
| Conversation: “I want one clear next move.” | PRD / Validated use case | The owner’s own product language anchors the use case. |
| Evidence: context is lost between walk and desk | PRD / Validated use case | Interview evidence raises confidence. |
| Socra inference: held thought becomes a next move | PRD / Validated use case | The agent proposes meaning without silently approving it. |
| Backlog: Voice capture becomes a held thought | PRD / Validated use case | The feature is curated as a capability signal. |
| Annotation: Circle region on Thought input | PRD / Primary customer flow | Visual feedback changes the experience shape. |
| Socra inference: reduce context switching, ask one question | PRD / Primary customer flow | The annotation becomes a behavior hypothesis. |
| Conversation: Studio remains the source of truth | TRD / System context | The architectural boundary is derived from product intent. |
| Agent route: capture → probe → curate → generate | TRD / System context | AgentKit orchestration is documented as a technical implication. |
| Package: source context is preserved in BACKLOG and VISUAL_ANNOTATIONS | TRD / Data and state transitions | The technical model keeps provenance attached to generated artifacts. |
| Inference: a requirement can be inferred without approval | TRD / Data and state transitions | Human approval remains explicit. |

The first test export had an empty `VISUAL_ANNOTATIONS.json` because the sample run submitted the feature request but did not add a new visual annotation in that same session. That first export also exposed the seeded-trace mixing defect described below. The corrected exporter now excludes those demo edges and does not fabricate an annotation that did not occur.


## Provenance correction and real annotation pass

The first clean-session export exposed a defect: the app had been flattening seeded `specSections[].trace` into every package, which mixed demo provenance with the current session. The export now uses a `sessionTrace` collection populated only by actual conversation, backlog, recommendation, annotation, package, and execution actions.

A second clean-session export contained exactly two real edges for the feature request: the submitted conversation and the resulting backlog signal. It did not contain the seeded conversation, evidence, inference, annotation, or execution links.

A final real annotation pass added:

> Make the voice capture feel immediate and private, not like a form.

The final export contained one persisted `VISUAL_ANNOTATIONS.json` record plus these two trace edges:

```json
[
  {
    "section": "Primary customer flow",
    "label": "Annotation",
    "detail": "object on selected product surface: Make the voice capture feel immediate and private, not like a form.",
    "type": "annotation"
  },
  {
    "section": "Data and state transitions",
    "label": "Package",
    "detail": "Visual annotation attached to the generated artifact",
    "type": "annotation"
  }
]
```

This demonstrates the intended behavior: the visual annotation is persisted as an artifact, the PRD edge explains the experience implication, and the TRD edge explains the data/package implication. No seeded demo edge is added to the export.
