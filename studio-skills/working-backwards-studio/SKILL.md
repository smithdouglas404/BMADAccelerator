---
name: working-backwards-studio
description: Build, extend or run a use-case-centric product studio that turns conversation, evidence, recommendations, visual annotations, and human decisions into traceable prototype requirements and repeatable Claude Code packages. Use for UI-first product-management tools, vibe-driven requirements capture, backlog probing, visual annotation flows, Agent Kit orchestration, Claude Code generation, Git/Linear handoff, MCP data connectors, installable skills, and agent memory.
origin: Working Backwards Studio
---

# Agentic Working Backwards Studio (v2)

Use this skill when the user wants a product owner and product engineer to move from an unfinished idea to a validated use case, prototype, and production-minded iteration without forcing the user to understand use cases, epics, stories, or agent architecture. The Studio is a product in its own right, used by many teams; this skill is its rulebook, for the people who build it and for the agents that run inside it.

## When to Activate

- When building, extending or running the Studio itself.
- When an agent inside the Studio needs its rulebook: the living specification, provenance, the floor rule and the package contract.

## Core model

Treat the **use case** as the central object. Keep these artifacts attached to it:

- product promise and PRFAQ
- evidence from conversation, interviews, research, uploads, and connected data sources
- open questions and human-in-the-loop decisions
- hidden requirement classifications (capability, epic, story, task, workflow candidate)
- the capability floor: everything a leading product of this kind has, each item confirmed, assumed or out
- Muse recommendations and probing history
- UI/component suggestions
- visual annotations and captured frames
- AgentKit routes and technical interpretation
- traceable Kanban/execution state
- the living PRD (16 sections) and TRD (21 sections), each with completeness, confidence, basis, state, review and trace
- spec versions and diffs, one per package, restorable
- Claude Code package, generation iteration, Git branch, and optional Linear projection

Show product meaning first. Reveal technical interpretations progressively for Product Engineers.

## Required workflow

1. Read the user's verbatim source material before planning. Extract concrete behavior, not only themes. Preserve phrases such as "click, I want to use this use case," "circle or click on something," "ask questions after pulling it forward," "voice translated to text," "not linear," and "do not force them to know what is being created."
2. Inspect the existing project before changing it. Reuse its visual language and preserve concurrent changes.
3. Create or update a concise plan and TODO with explicit acceptance outcomes. Do not collapse the whole product into one generic dashboard item.
4. Build the UI-first loop on real state from the start: a real database, real agents, real builds. (v1 said "local demo state before backend integration"; owners test the whole product end to end, never a mock.) Include non-linear navigation between discovery, validation, evidence, product shape, readiness, prototype brief, execution, and connections.
5. Make recommendations actionable: when selected, add a recommendation to the backlog, mark it as ready for facilitation, and open a probing conversation. Never silently convert a suggestion into a requirement.
6. Keep voice first-class. Use the platform transcription path when available, browser speech recognition otherwise; retain typed fallback. Store original context alongside the transcript.
7. Make visual annotation a real context object. Support object selection, circle/region mode, full-screen capture, annotation text, voice commentary, and frame attachment. Persist the context in `VISUAL_ANNOTATIONS.json`.
8. Make generation repeatable. Each generation assembles a fresh package and increments an iteration counter. The package must include the validated use case, PRFAQ, PRD, TRD, spec trace, spec diff, evidence, technical requirements, component map, Agent Kit routing, human decisions, Kanban, conversation, backlog, visual annotations, and a Claude Code prompt.
9. Keep Claude Code constrained: preserve customer language, use the selected UI baseline, follow AgentKit routes for the prototype, keep human decisions explicit, and trace work to the curated capability/Kanban state. Constrained means traceable, not small: see "The floor rule".
10. Keep Git and Linear optional and non-destructive. Git is the durable implementation handoff; Linear is a projection of curated capabilities/epics/stories. Studio remains the conversational source of truth.
11. Validate both the source and the generated package. Use the bundled scripts when possible.
12. Checkpoint the implementation after the build passes and report what is real versus mocked.

## The living specification

The PRD and TRD are living documents, never forms. A Muse answer updates the sections it bears on and shows the inference trail. Each section carries:
- basis: Confirmed (the owner said so), Recommended, Inferred, Open decision, Not yet researched;
- state: draft, exploring, evidence-backed, owner-approved, engineer-reviewed, ready for prototype, ready for pilot, production-ready;
- review: Keep, Revise, Challenge or Remove. Keep confirms it; Revise and Challenge go back to the Muse; Remove keeps the evidence and the conversation and can be undone;
- a trace: conversation, evidence, annotation, inference, backlog and execution steps.
Every package snapshots the spec as a version with a diff; any version can be restored as a new one. A change to a decision or section shows its impact on PRD and TRD sections, backlog, agent workflows, build moves, generated artifacts and Linear records. Readiness is explainable: the overall number comes with the factors behind it. Pilot feedback (observations, metrics, interviews, "this felt wrong because…") flows back into the spec as evidence.

## Session-scoped provenance

`SPEC_TRACE.json` in a real export contains only edges of events that really happened for that product. Never flatten seeded, sample or demo traces into a package, and never write a trace step for something that did not happen. The Studio writes these edges as the events happen:
- an owner message: `Validated use case` / Conversation (their words) and `Validated use case` / Backlog (the held title);
- an ambient capture: `Primary customer flow` / Backlog;
- a recommendation pulled forward: `Acceptance criteria` / Recommendation (inference) and `Acceptance criteria` / Backlog;
- a visual annotation: `Primary customer flow` / Annotation (`<shape> on <target>: <note>`) and `Data and state transitions` / Package ("Visual annotation attached to the generated artifact");
- a generated package: `System context` / Execution ("Claude Code ZIP generated from current Studio state"), recorded once and visible from the next package.
The agents add their own edges (evidence, inference) only for real sources and real reasoning. `VISUAL_ANNOTATIONS.json` stays `[]` until the owner makes an annotation; once they do, the record carries the target, the note in their words, the shape, and the frame when one was captured.

## Implicit approvals

Every time the owner talks is requirements. A plain "yes" (or "love it", "do it", "that's right"), with no hedge, is an approval: record it as an approved decision of what was last proposed, show "Decision captured", and move the capability's readiness forward. Never ask "do you want to approve this?". Anything else the owner says is held in the backlog in their own words and curated: grouped into a capability, kept as a new thought, or parked as a distraction.

## The floor rule

The owner can only give part of the floor. The Studio fills in the rest: it names the category of whatever the owner describes (a claims tool is claims processing, an analytics product is a SaaS dashboard), and every capability starts with everything the leading products in that category have, marked [assumed]. The documents and the conversation are the floor, never the ceiling. Silence never removes anything; only the owner's explicit "no" makes an item [out]. A pilot limit changes behaviour, not presence. The Claude Code prompt keeps the words "thinnest production-minded pilot" and "working vertical slice" and adds: a thin slice on a complete professional floor. The floor (the capability floor, the PRD and TRD, and what the category's leading products all have) is in scope; the pilot is the complete product a leading company in its category would ship, and every screen it adds works end to end.

## MCP adapters (connected data)

Teams plug data sources and tools into the Studio as MCP servers (HTTP, SSE or stdio), switched on for every product or only the products that pick them. Headers and environment values are secrets: stored encrypted, never shown again, never sent to the browser. The Muse, its helpers and Claude Code get the connectors for the product beside the Studio's own tools. What an agent takes from a connector is evidence: quote it with its source. Connector names are short, lower-case, and never `studio` or `shadcn` (reserved).

## Installable skills

Skills use the Agent Skills format: a folder with a `SKILL.md` (front matter `name` and `description`, then instructions), optional `references/` and `scripts/`, uploaded as a `.skill` or `.zip`. The Studio checks the shape before a skill can be switched on, installs switched-on skills into every product workspace's `.claude/skills/`, and the agents use a skill when its description fits. This skill ships as the default skill in every workspace.

## Agent memory

The Studio remembers across products with self-hosted, open-source Mem0 (the long-term archive: decisions, answers, annotations, builds, lessons) and Letta (one working mind per Studio role: Muse, Use Case Validator, UX / Component Mapper, Product Engineer, each with its top lessons). Before each agent turn, recall what earlier products taught; after decisions and builds, save general lessons. One owner's details are private to their product: lessons are general ("claims tools: ask about payout limits early"), never another owner's names, prices or plans.

## Many teams, one product

The Studio is sold to many teams. Keep each product's data, workspace, memory run and package separate; keys and connector secrets are per installation and encrypted; generated apps never receive the Studio's keys (only a model key for their own AgentKit agents, when the owner chose one). Nothing in the Studio names a specific customer, method vendor or internal project.

## Package contract

Read `references/package-contract.md` before changing generated artifacts. The contract defines the required files and the current shapes of `VISUAL_ANNOTATIONS.json` and `CLAUDE_CODE_PROMPT.md`. A `frameFile` (path to the saved picture) may stand in for `frame` when the image is kept beside the package.

## Mock synchronization

Use `scripts/mock_sync.py` to verify backlog and spec projection without credentials. It accepts a backlog JSON array (and, with `--spec-diffs`, the spec diffs) and produces deterministic Git and Linear mock states. Spec diffs project to Git as `studio/spec/<id>` with the file under `prototype/spec/`, and to Linear as `spec-change` records. The mock must show:

- Studio backlog items remain the source records.
- Git receives a branch/package projection with item IDs and trace links.
- Linear receives capabilities/epics/stories as a projection, preserving the Studio item ID and source trace.
- Sync is repeatable and non-destructive; a second run reports updates rather than duplicating records.

Use `scripts/inspect_package.py` to inspect a generated ZIP, validate required files, parse `VISUAL_ANNOTATIONS.json` and `SPEC_TRACE.json`, check that annotation edges appear exactly when a real annotation was made, and check that the Claude Code prompt contains its guardrails and first-move section.

## Delivery expectations

Report the checkpoint or saved version, the build result, the generated ZIP path when requested, and any integration boundaries. Do not claim that external Claude Code execution, Git pushes, Linear writes, or AgentKit runtime orchestration are live unless real credentials and backend execution have been configured.
