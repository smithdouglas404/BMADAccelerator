# Agentic Working Backwards Studio
## Living PRD/TRD, validation, pilot loop, and maturity assessment

## Executive summary

The Studio is intended to help Product Owners and Product Engineers move from an unfinished idea to a validated use case, a production-minded prototype, and repeated implementation iterations without requiring the user to understand whether the system is creating a use case, capability, epic, story, task, agent workflow, or human-in-the-loop checkpoint.

The central product principle is that the **use case remains the source object**. Conversation, evidence, inferred requirements, visual annotations, backlog items, technical implications, generated code prompts, pilot feedback, and external work-management records should all remain traceable to it.

## Proposed application structure

1. **Product truth** — use case, customer, promise, journey, evidence, and research.
2. **Conversation** — Socra questions, voice input, open decisions, implicit approvals, and probing.
3. **Living PRD** — product sections, completeness, confidence, evidence, acceptance criteria, and human approval.
4. **Living TRD** — architecture, data, integrations, agents, security, operations, testing, and technical risks.
5. **Backlog** — curated capabilities, epics, stories, tasks, recommendations, and distractions.
6. **Vibe review** — click, circle, annotate, speak, capture, and iterate against a visible product surface.
7. **Prototype brief** — Claude Code package, generation history, component map, and AgentKit routing.
8. **Pilot and execution** — Kanban, validation observations, pilot metrics, and production readiness.
9. **Connections** — Git, Linear, and future generation providers such as Cursor, Devin, or Antigravity.

The user should be able to move between these views non-linearly. The system should ask questions in natural product language while creating structured artifacts behind the scenes.

## Living PRD workspace

The PRD should be a real, visible workspace rather than a static generated document. Recommended sections:

- Problem and customer context
- Validated use case
- Target users and actors
- Customer journey
- Jobs to be done
- Product promise
- Scope and non-goals
- Capabilities
- User flows
- Functional requirements
- Acceptance criteria
- Edge cases
- Open questions
- Success metrics
- Rollout assumptions
- Risks and dependencies

Each section should display its current content, completeness status, confidence, supporting evidence, related conversation, visual annotations, backlog items, open questions, and last update source.

The Product Owner should not have to complete a form. A Socra question should update the appropriate section while exposing the inference trail. For example, an answer to “What should happen if the user captures an idea but does not have time to organize it?” may update the user flow, functional requirements, edge cases, backlog, acceptance criteria, and readiness score.

## Living TRD workspace

The TRD should be generated progressively from product decisions rather than treated as a separate engineering exercise. Recommended sections:

- System context
- Architecture overview
- Capability-to-service mapping
- Agent roles and orchestration
- Human-in-the-loop boundaries
- Data model
- State transitions
- API and integration contracts
- Authentication and authorization
- Storage and retention
- Event and workflow model
- UI/component architecture
- Error handling
- Observability
- Security and privacy
- Performance expectations
- Testing strategy
- Deployment and environments
- External dependencies
- Technical risks
- Production hardening checklist

Every section should distinguish **Confirmed**, **Recommended**, **Inferred**, **Open decision**, and **Not yet researched**.

## Inference and traceability model

Every requirement should be traceable through a chain like:

```text
Requirement
  → originating conversation
  → evidence or research
  → visual annotation
  → capability
  → backlog item
  → execution item
  → generated code prompt
```

Example:

```text
“Users need to capture thoughts without interrupting their activity.”
  → voice annotation
  → Socra companion capability
  → PR-014
  → TR-009
  → capture → transcribe → probe workflow
  → Claude Code implementation task
  → pilot validation metric
```

This is the bridge between an AI assistant, a requirements system, and a product engineering workspace.

## Additional capabilities to add

### Spec completeness and readiness

Add explainable readiness, not a single opaque percentage. Show PRD completeness, TRD completeness, evidence coverage, open decisions, unresolved risks, acceptance criteria coverage, human approval coverage, prototype coverage, and production-readiness gaps.

### Section-level review

Allow each section to move through Draft, Being explored, Evidence-backed, Owner approved, Engineer reviewed, Ready for prototype, Ready for pilot, and Production-ready.

### Requirements review mode

Review inferred requirements one at a time. Offer Keep, Revise, Challenge, and Remove. Preserve the underlying evidence and conversation regardless of the choice.

### Change impact analysis

When a decision changes, show affected PRD sections, TRD sections, backlog items, agent workflows, generated artifacts, and external Linear records.

### Research and evidence ingestion

Support interviews, PDFs, competitive research, screenshots, existing documents, design references, analytics exports, and customer feedback. Extract claims, evidence, contradictions, questions, potential requirements, and confidence levels.

### Spec diffs and version history

Every generation should create a versioned snapshot and explain changes such as added requirements, changed primary actors, new human approvals, removed scope, or updated technical constraints.

### Validation and pilot loop

Accept pilot observations, annotated screenshots, voice feedback, metrics, interview notes, and “this felt wrong because…” comments. Feed them back into the PRD and TRD rather than leaving them as disconnected feedback.

## Honest maturity assessment

| Area | Current maturity | Needed next |
| --- | --- | --- |
| Use-case discovery | Strong UI-first foundation | Durable evidence-backed question tracking |
| PRFAQ | Present | Evolve into a structured living PRD |
| PRD | Partial/generated | Add section workspace, completeness, approvals, and traceability |
| TRD | Partial/generated | Add architecture, data, APIs, security, operations, and testing |
| Backlog | Interactive local prototype | Durable state, dependencies, and conflict handling |
| Visual annotation | Prototype capability present | Persistent regions, replay, and source media handling |
| Voice input | Browser-level prototype | Durable transcription and audio retention rules |
| AgentKit | Routing model represented | Real runtime execution and run history |
| Claude Code | ZIP generation present | External execution and output ingestion |
| Git | Mock synchronization | OAuth/connector and real branch/commit flow |
| Linear | Mock synchronization | API synchronization and conflict handling |
| Specification history | Early | Revisions, diffs, approvals, rollback |
| Pilot feedback | Early | Feedback-to-spec loop |

## Bottom line

The Studio is currently at the **UI-first interaction model and package-generation stage**. It has the right product philosophy and an increasingly complete interaction loop, but it does not yet have a durable specification engine or live external execution layer.

The next major capability is the **Living Specification workspace**. It should make the following loop visible:

```text
Conversation
→ Evidence
→ Use case
→ Product requirement
→ Technical implication
→ Backlog item
→ Prototype task
→ Generated code
→ Pilot feedback
→ Updated specification
```

That loop is the path from a compelling prototype to a strong PRD/TRD and an auditable product-development system.
