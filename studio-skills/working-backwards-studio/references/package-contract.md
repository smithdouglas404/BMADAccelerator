# Generated package contract

A Claude Code package is a ZIP of product truth plus implementation guardrails. The minimum files are:

- `README.md`
- `PRFAQ.md`
- `VALIDATED_USE_CASE.md`
- `TECHNICAL_REQUIREMENTS.md`
- `COMPONENT_MAP.json`
- `AGENT_KIT_ROUTING.json`
- `KANBAN.json`
- `EVIDENCE.json`
- `VISUAL_ANNOTATIONS.json`
- `CONVERSATION.json`
- `BACKLOG.json`
- `PACKAGE_MANIFEST.json`
- `CLAUDE_CODE_PROMPT.md`
- `PRD.md`
- `TRD.md`
- `SPEC_TRACE.json`
- `SPEC_DIFF.md`

## VISUAL_ANNOTATIONS.json

Store an array of objects. Each object has:

```json
{
  "target": "Thought input",
  "note": "Make the first interaction feel less like a form.",
  "shape": "object | circle | full-screen",
  "frame": "data:image/png;base64,..."
}
```

`frame` may be omitted when capture is unavailable. Keep the selected target and the user’s words even when no image exists.

## CLAUDE_CODE_PROMPT.md

The prompt must:

1. identify the product and validated use case;
2. instruct Claude Code to build the thinnest production-minded pilot;
3. preserve customer language from `PRFAQ.md`;
4. use the selected shadcn/ui baseline;
5. use the AgentKit route definitions as the prototype orchestration baseline;
6. keep human-in-the-loop decisions explicit and reversible;
7. trace implementation to `KANBAN.json`;
8. prefer a working vertical slice over broad scaffolding;
9. point to the first move from the building/ready execution item.

## v2 additions

- A `VISUAL_ANNOTATIONS.json` entry may carry `frameFile` (the saved picture's path in the product workspace) instead of `frame`, so a package written beside its pictures stays small. The downloaded ZIP carries `frame` as a data URL.
- `CLAUDE_CODE_PROMPT.md` keeps every v1 phrase and adds the floor rule: the pilot is the complete product a leading company in its category would ship; the capability floor in `TECHNICAL_REQUIREMENTS.md` is the minimum; only an [out] item or the owner's explicit "no" removes anything.
- `TECHNICAL_REQUIREMENTS.md` lists the capability floor (items with ids F1, F2... and their state), approved decisions, assumptions to confirm, and open human decisions.
- `KANBAN.json` entries carry `capability`, `decision`, `owner`, `type`, `shadcnComponents`, `agentKitRoutes` and `claudeCodePrompt`.

## Living spec files (v2)

- `PRD.md` and `TRD.md`: one `## Title` per section, its content, then `Completeness: N% · state · confidence confidence · Basis · ref` (PR-001..016, TR-001..021).
- `SPEC_DIFF.md`: what changed in the spec since the previous package (version N).
- `SPEC_TRACE.json`: a flat array of provenance edges, exactly:

```json
[
  { "section": "Primary customer flow", "label": "Annotation", "detail": "object on selected product surface: Make the voice capture feel immediate and private, not like a form.", "type": "annotation" },
  { "section": "Data and state transitions", "label": "Package", "detail": "Visual annotation attached to the generated artifact", "type": "annotation" }
]
```

`type` is one of conversation, evidence, annotation, inference, backlog, execution.

## Provenance rule (no seeded traces)

A real export holds only edges of events that happened for that product. Seeded, sample or demo traces never reach a package. A clean session with one owner request exports one conversation edge and one backlog edge. Annotation edges appear exactly when `VISUAL_ANNOTATIONS.json` has a record, and an annotation adds two: the PRD experience edge (Primary customer flow / Annotation) and the TRD data edge (Data and state transitions / Package). `scripts/inspect_package.py` checks this.

## Prompt scope

`CLAUDE_CODE_PROMPT.md` also says: a thin slice on a complete professional floor. The capability floor, the PRD and TRD sections, and what the category's leading products all have are in scope; nothing beyond the package and that floor is invented.
