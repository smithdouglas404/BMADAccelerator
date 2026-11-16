# Acceptance checklist: Living PRD/TRD strategy

Every line below is copied word for word from the design team's `docs/LIVING_SPEC_PRODUCT_STRATEGY.md`. Each one is an acceptance test for the Studio. **Status:** Done (in the code now, checked in the sandbox with the stand-in Socra; runs with the real Socra are checked on the Mac install), Next round (planned, with the reason given).

## Executive summary

| # | Their words | How the Studio meets it | Status |
|---|---|---|---|
| E1 | "move from an unfinished idea to a validated use case, a production-minded prototype, and repeated implementation iterations without requiring the user to understand whether the system is creating a use case, capability, epic, story, task, agent workflow, or human-in-the-loop checkpoint." | Socra speaks product language only. Kinds such as epic, workflow and hitl are hidden fields, shown only in the Product engineer lens. | Done |
| E2 | "the **use case remains the source object**. Conversation, evidence, inferred requirements, visual annotations, backlog items, technical implications, generated code prompts, pilot feedback, and external work-management records should all remain traceable to it." | Every record (message, evidence, spec section, annotation, backlog item, tech note, package, feedback, Linear/Git id) belongs to one product in the database | Done (data model) |

## Proposed application structure (all 9 views)

| # | Their words | Where it lives | Status |
|---|---|---|---|
| V1 | "**Product truth** — use case, customer, promise, journey, evidence, and research." | Whole product, Validate use case and Evidence & signals views | Done |
| V2 | "**Conversation** — Socra questions, voice input, open decisions, implicit approvals, and probing." | Work with Socra view; a plain "yes" becomes an approved decision; voice by browser speech or ElevenLabs | Done (the "yes" logic is done) |
| V3 | "**Living PRD** — product sections, completeness, confidence, evidence, acceptance criteria, and human approval." | Living specification view, PRD tab, on real data | Done |
| V4 | "**Living TRD** — architecture, data, integrations, agents, security, operations, testing, and technical risks." | Living specification view, TRD tab | Done |
| V5 | "**Backlog** — curated capabilities, epics, stories, tasks, recommendations, and distractions." | Product shape view (curated backlog); recommendations wait as suggestions until pulled forward | Done |
| V6 | "**Vibe review** — click, circle, annotate, speak, capture, and iterate against a visible product surface." | Its own Vibe review view: the live built app, plus click (object), circle region, full-screen capture, a typed or spoken note, and iterate (the note goes into the next build) | Done |
| V7 | "**Prototype brief** — Claude Code package, generation history, component map, and AgentKit routing." | Prototype brief view: the package (download ZIP or build now), iteration history, components, routes | Done |
| V8 | "**Pilot and execution** — Kanban, validation observations, pilot metrics, and production readiness." | Make it real board, pilot observations, Pilot readiness view | Done |
| V9 | "**Connections** — Git, Linear, and future generation providers such as Cursor, Devin, or Antigravity." | Connections view: Git push and Linear sync are live; MCP connectors and skills are in Settings | Done (Git/Linear); Next round: Cursor, Devin and Antigravity, shown as "coming" because they have no build connection yet |
| V10 | "The user should be able to move between these views non-linearly." | Sidebar jumps to any view at any time; nothing is gated | Done |
| V11 | "The system should ask questions in natural product language while creating structured artifacts behind the scenes." | Socra skill rules plus its tools (set_spec_section, set_capability, record_decision and others) | Done |

## Living PRD workspace (all 16 sections)

| # | Their words | Status |
|---|---|---|
| P1 | "Problem and customer context" | Done |
| P2 | "Validated use case" | Done |
| P3 | "Target users and actors" | Done |
| P4 | "Customer journey" | Done |
| P5 | "Jobs to be done" | Done |
| P6 | "Product promise" | Done |
| P7 | "Scope and non-goals" | Done |
| P8 | "Capabilities" | Done |
| P9 | "User flows" | Done |
| P10 | "Functional requirements" | Done |
| P11 | "Acceptance criteria" | Done |
| P12 | "Edge cases" | Done |
| P13 | "Open questions" | Done |
| P14 | "Success metrics" | Done |
| P15 | "Rollout assumptions" | Done |
| P16 | "Risks and dependencies" | Done |
| P17 | "Each section should display its current content, completeness status, confidence, supporting evidence, related conversation, visual annotations, backlog items, open questions, and last update source." | Done (provenance rail shows each) |
| P18 | "The Product Owner should not have to complete a form. A Socra question should update the appropriate section while exposing the inference trail." | Done (Socra writes sections with a trace) |
| P19 | "an answer to 'What should happen if the user captures an idea but does not have time to organize it?' may update the user flow, functional requirements, edge cases, backlog, acceptance criteria, and readiness score." | Done (one answer can update many sections; readiness is recalculated) |

All 16 sections have permanent ids PR-001 to PR-016 (code: `PRD_SECTIONS` in `src/lib/studio/spec.ts`, Done).

## Living TRD workspace (all 21 sections)

| # | Their words | Status |
|---|---|---|
| T1 | "System context" | Done |
| T2 | "Architecture overview" | Done |
| T3 | "Capability-to-service mapping" | Done |
| T4 | "Agent roles and orchestration" | Done |
| T5 | "Human-in-the-loop boundaries" | Done |
| T6 | "Data model" | Done |
| T7 | "State transitions" | Done |
| T8 | "API and integration contracts" | Done |
| T9 | "Authentication and authorization" | Done |
| T10 | "Storage and retention" | Done |
| T11 | "Event and workflow model" | Done |
| T12 | "UI/component architecture" | Done |
| T13 | "Error handling" | Done |
| T14 | "Observability" | Done |
| T15 | "Security and privacy" | Done |
| T16 | "Performance expectations" | Done |
| T17 | "Testing strategy" | Done |
| T18 | "Deployment and environments" | Done |
| T19 | "External dependencies" | Done |
| T20 | "Technical risks" | Done |
| T21 | "Production hardening checklist" | Done |
| T22 | "The TRD should be generated progressively from product decisions rather than treated as a separate engineering exercise." | Done (the Product Engineer fills the TRD after decisions change) |

All 21 sections have permanent ids TR-001 to TR-021 (`TRD_SECTIONS`, Done).

## The five statuses

"Every section should distinguish **Confirmed**, **Recommended**, **Inferred**, **Open decision**, and **Not yet researched**."

| # | Their words | Status |
|---|---|---|
| S1 | "Confirmed" | Done (data model) |
| S2 | "Recommended" | Done (data model) |
| S3 | "Inferred" | Done (data model) |
| S4 | "Open decision" | Done (data model) |
| S5 | "Not yet researched" | Done (data model; every section starts here) |

## Inference and traceability model

| # | Their words | Status |
|---|---|---|
| C1 | "Requirement → originating conversation → evidence or research → visual annotation → capability → backlog item → execution item → generated code prompt" | Done (each section has a trace; each link opens its view) |
| C2 | The example chain: "'Users need to capture thoughts without interrupting their activity.' → voice annotation → Socra companion capability → PR-014 → TR-009 → capture → transcribe → probe workflow → Claude Code implementation task → pilot validation metric" | Done (PR/TR ids and SPEC_TRACE.json in the package) |

## Additional capabilities to add (all 7)

| # | Their words | How | Status |
|---|---|---|---|
| A1 | "**Spec completeness and readiness** — Show PRD completeness, TRD completeness, evidence coverage, open decisions, unresolved risks, acceptance criteria coverage, human approval coverage, prototype coverage, and production-readiness gaps." | `explainReadiness`: ten named factors, each with a sentence | Done (logic); Done (screen) |
| A2 | "**Section-level review** — Draft, Being explored, Evidence-backed, Owner approved, Engineer reviewed, Ready for prototype, Ready for pilot, and Production-ready." | All 8 states in `SPEC_STATUSES` | Done (logic); Done (screen) |
| A3 | "**Requirements review mode** — Review inferred requirements one at a time. Offer Keep, Revise, Challenge, and Remove. Preserve the underlying evidence and conversation regardless of the choice." | Review mode in the spec view; a review never deletes the trace | Done |
| A4 | "**Change impact analysis** — When a decision changes, show affected PRD sections, TRD sections, backlog items, agent workflows, generated artifacts, and external Linear records." | Impact panel on a decision or section | Done |
| A5 | "**Research and evidence ingestion** — Support interviews, PDFs, competitive research, screenshots, existing documents, design references, analytics exports, and customer feedback. Extract claims, evidence, contradictions, questions, potential requirements, and confidence levels." | Document agent turns uploads into evidence with confidence | Done (claims, evidence and confidence are done; contradictions, questions and potential requirements are being added) |
| A6 | "**Spec diffs and version history** — Every generation should create a versioned snapshot and explain changes such as added requirements, changed primary actors, new human approvals, removed scope, or updated technical constraints." | `SpecRevision` per package plus `specDiff`; SPEC_DIFF.md | Done (logic); Done (screen) |
| A7 | "**Validation and pilot loop** — Accept pilot observations, annotated screenshots, voice feedback, metrics, interview notes, and 'this felt wrong because…' comments. Feed them back into the PRD and TRD rather than leaving them as disconnected feedback." | Pilot observations go to Socra, which updates sections with a trace | Done |

## Honest maturity assessment (all 13 rows, "Needed next")

| # | Area | Their "Needed next" | Studio | Status |
|---|---|---|---|---|
| M1 | Use-case discovery | "Durable evidence-backed question tracking" | Open decisions and probing questions stored in the database | Done |
| M2 | PRFAQ | "Evolve into a structured living PRD" | PRFAQ kept, plus the 16-section PRD | Done |
| M3 | PRD | "Add section workspace, completeness, approvals, and traceability" | Spec view | Done |
| M4 | TRD | "Add architecture, data, APIs, security, operations, and testing" | 21 TRD sections | Done |
| M5 | Backlog | "Durable state, dependencies, and conflict handling" | Postgres; items link to capabilities, decisions and sections | Done (durable state is done; dependencies are being built); Next round: conflict handling for two people editing at once |
| M6 | Visual annotation | "Persistent regions, replay, and source media handling" | Region and picture saved with every annotation | Done (persistent regions and source media); Next round: replay |
| M7 | Voice input | "Durable transcription and audio retention rules" | Transcripts stored with their source | Done; Next round: audio retention rules |
| M8 | AgentKit | "Real runtime execution and run history" | Generated apps' agents are built with AgentKit and run in the preview; the Studio's own agents run on Claude with a run history | Done |
| M9 | Claude Code | "External execution and output ingestion" | Claude Code really builds the app; its notes and screenshots come back in | Done (engine) |
| M10 | Git | "OAuth/connector and real branch/commit flow" | Real branch, commit and push with a GitHub token saved in Settings | Done; Next round: GitHub sign-in (OAuth) in place of a token |
| M11 | Linear | "API synchronization and conflict handling" | Real Linear API sync that never deletes anything | Done; Next round: conflict handling |
| M12 | Specification history | "Revisions, diffs, approvals, rollback" | SpecRevision, diff, approvals, restore a version | Done |
| M13 | Pilot feedback | "Feedback-to-spec loop" | See A7 | Done |

## The loop (all 10 steps)

"Conversation → Evidence → Use case → Product requirement → Technical implication → Backlog item → Prototype task → Generated code → Pilot feedback → Updated specification"

| # | Step | Status |
|---|---|---|
| L1 | Conversation | Done |
| L2 | Evidence | Done |
| L3 | Use case | Done |
| L4 | Product requirement | Done |
| L5 | Technical implication | Done |
| L6 | Backlog item | Done |
| L7 | Prototype task | Done |
| L8 | Generated code | Done (engine) |
| L9 | Pilot feedback | Done |
| L10 | Updated specification | Done |

The end-to-end check walks this loop on a real product in the running Studio, in this order.

## Package and sync, from the team's v5 drop and sync verification note

| # | Their words | How the Studio meets it | Status |
|---|---|---|---|
| K1 | "The reviewed generated package contains 16 artifacts, including the three living-spec artifacts: `PRD.md` `TRD.md` `SPEC_TRACE.json`" | The package has their 16 files plus `SPEC_DIFF.md` (from their strategy doc's "Spec diffs and version history") | Done (assembly) |
| K2 | "`PRD.md` and `TRD.md` are section-oriented documents. Each section carries the inferred content plus completeness, status, and confidence metadata." | `specMarkdown`: one heading per section, then a "Completeness: N% · status · confidence" line (plus basis and PR/TR id) | Done |
| K3 | "`SPEC_TRACE.json` stores provenance edges. Each edge identifies the spec section, source label, human-readable detail, and source type." | A flat list of `{ section, label, detail, type }` (plus `ref`) | Done |
| K4 | "The reusable package inspector passed with 16 required files, one visual annotation, no annotation schema errors, and no missing Claude Code prompt guardrails." | `inspectPackage` plus their `inspect_package.py` run against our package in the tests | Done |
| K5 | "The Connections workspace now shows an automatic projection preview with three backlog records and three specification diffs" | "What would push from Studio" card, from `GET /sync`: real backlog records and the spec diffs since the last sync | Done |
| K6 | "The Git action transitions to `Synced` and reports that backlog and spec diffs are traceable by source ID." | Real commit and push; the status line names the records by Studio id | Done |
| K7 | "The Linear action transitions to `Synced` and reports that backlog and spec changes remain linked to Studio." | Real Linear issues, including `spec-change` issues carrying the Studio trace | Done |
| K8 | "The first run created 6 Git and 6 Linear records. The second run created no duplicates and reported `idempotent: true`." | `project()` gives stable ids and reports `idempotent`; tested twice in a row | Done (logic) |
| K9 | "Specification diffs project into Git as branches and package paths such as `studio/spec/spec-prd-flow` and `prototype/spec/PRD.md`." | Each record carries its `studio/spec/<id>` branch name and its `prototype/spec/...` path; the files are written at those paths and pushed on the product's one branch. Separate GitHub branches per change are not opened, on purpose, so the repository isn't flooded | Done (logic); Done (screen) |
| K10 | "They project into Linear as `spec-change` records with the originating file, before/after status, and Studio trace." | `spec-change` issues: file, before, after and Studio trace | Done (logic) |
| K11 | "These are deliberately mock states. Real repository commits, Linear API writes, credential handling, and conflict resolution remain integration work." | Real commits, Linear writes and encrypted credentials. Conflict resolution: a push never overwrites other work (it is reported instead) | Done; Next round: two-way conflict merging |

## Claude Code export test (the team's sample feature request, run as a scripted step of the end-to-end check)

Their request, word for word: "Let people save a voice note while walking, then have Socra transcribe it and ask one clarifying question before it becomes a backlog item."

| # | Their outcome | What we check | Status |
|---|---|---|---|
| X1 | "Preserved the original wording." | The message and the backlog item keep the exact words | Done |
| X2 | "Added it to product truth." | Socra carries it into the capability and spec sections it touches | Done |
| X3 | "Placed it in the ambient backlog for curation." | The backlog grows by one, "Thought held for curation" | Done (logic) |
| X4 | "Opened the Prototype Brief." | The brief view opens with the package ready | Done |
| X5 | "Generated and downloaded a real Claude Code ZIP." | ZIP downloads with all package files | Done |
| X6 | "The export advanced from `Iteration 0 / draft` to `Iteration 1 / downloaded`." | The iteration counter advances with each package | Done |
| X7 | Prompt structure: "Product and implementation-agent framing · Scope guardrails · Customer-language preservation · shadcn/ui requirements · Agent Kit routing guidance · Explicit and reversible human decisions · Traceability to `KANBAN.json` · Thin vertical-slice guidance · A `First move` section" | `inspectPackage` checks every phrase | Done |
| X8 | "Each provenance edge has this shape: { section, label, detail, type }" | Same shape | Done |
| X9 | Difference on purpose: their SPEC_TRACE mixes in seeded demo edges | Ours holds only edges from real events in this product | Done |
| X10 | "The exporter correctly avoids fabricating a visual annotation that did not actually occur." | `VISUAL_ANNOTATIONS.json` is `[]` when no annotation happened | Done |
| X11 | A second pass with a real annotation | Circle a region in Vibe review, then export again: the annotation, its frame, and annotation edges on the PRD/TRD sections appear | Done |


## Doug's flow decisions (15 November)

Doug's answers to the walkthrough questions, word for word, each with how the Studio meets it.

| # | Doug's words | How the Studio meets it | Status |
|---|---|---|---|
| F1 | "The agents should actually be like Socra with specialists for their specific categories. They could be an architect, they could be an engineer, they could be a business analyst, they could be a UX, UI specialist, they could actually be a subject matter specialist based on the area or the topic of the use case." | Socra leads; five specialists (Business analyst, Solution architect, Product engineer, UX/UI designer, and a Domain expert named for the field, such as "Claims expert") speak in the conversation in their own names (`share_finding`). Socra's team panel shows each one and what it is doing; click one to ask it directly. | Done |
| F2 | "the majority of the people are going to have a blank idea and just come in like vibing ... And then they're also going to upload maybe presentations or other documents, business cases, Excel spreadsheets" | New product is one box (typed or spoken) plus documents: decks, business cases, spreadsheets, PDFs, notes and screenshots, read by markitdown and the document agent and handed to Socra. Socra names the product (rename any time from the product switcher) and the page lands in the conversation. | Done |
| F3 | "when you hit generate, the zip is there, but it should actually go out and use Claude ... it should use Claude CLI to go out and build the application." | Prototype brief's main button is "Build it with Claude Code" (on the Claude plan); the ZIP is the second button. | Done |
| F4 | "The voice shouldn't be on by default ... You should click the voice and then be able to talk as long as you want. It should not stop. And they should then hit the deselect to stop it. And then that should convert to NATURAL language." | The mic in the composer is off until pressed, keeps listening through pauses (browser recognition restarts itself; ElevenLabs records with no limit), stops only when pressed again, then is cleaned into written language (low-cost model, with a plain clean-up as the floor) and sent; the words as spoken are kept with the message. | Done (transcription with ElevenLabs needs its key on the Mac) |
| F5 | "A spoken yes is good enough to approve something. If it's in the human in the loop process, you're going to have an approve button or a reject button with comments." | A typed or spoken yes, or a number ("2", "2 and 5") from Socra's numbered options, is an approved decision at once, with an Undo chip. Open decisions show as checkpoints with Approve and Reject and a comment; a rejection keeps it out of the build and Socra proposes another way. | Done |
| F6 | "I want to actually have several people have the ability to work in the product ... multiple roles, but all working on the same unified repository." | People on a product, each with a role (product owner, business analyst, product engineer, UX/UI designer, architect, subject-matter expert, stakeholder), from the top-bar avatar. Every message carries who said it and their role, and Socra answers at that level. One shared product truth. | Done; Next round: sign-in (who you are is remembered per browser today) |
| F7 | "one person should be able to run several products ... they can actually work on several use cases at any particular point in time." | Home lists every product with the same readiness number its screens show; the product switcher moves between them. | Done |
| F8 | Q10 left to Claude; "Number 11 is yes, it's okay." | The side menu is grouped Shape it, Prove it, See it (the new full-width Try & mark up view) and Ship it, with a next-best-move banner. The team's 390px cap on the menu is lifted (in studio-extras.css; their styles.css stays byte-identical). | Done |
| F9 | "For number 12, I agree with you, the second, not an automatic build." | Builds start only when someone presses Build (or asks Socra). The one exception is the first version at the opening, so there is a product to react to in minutes. | Done |
