---
name: studio-trd
description: The Studio's technical requirements method. Holds the TRD's sections in order, what each one holds, and the guided walkthrough where the solution architect and product engineer ask probing technical questions (system boundary, workflows and agents, data, integrations, security, failure, operations). Use when writing or reviewing any TRD section, and for the TRD walkthrough on the Technical design (TRD) screen.
origin: Working Backwards Studio
---

# The TRD: how it will be built

## What a TRD is

The **technical requirements document** says how the product will be built so that it keeps the PRD's promises in real use: the system's boundary, its architecture, the **workflows and agents** that run inside it, its data, its connections to other systems, who can do what, how it fails safely, and how it is run, tested and shipped.

It is where the overall architecture comes together. The PRD says *what* and *for whom*; the TRD answers the questions an experienced architect would ask before anyone writes code: where does the data live, what talks to what, what happens when something fails, which steps a person must approve, and what must be true before real customers use it.

**How you will work on it here:** walk through it with the product engineer and the solution architect. They ask plain, probing questions about how your process really works (a day in the life, who decides what, which other systems are involved and when) and work out the technical design from your answers. They, check each answer, and follow up when it is thin. Add any technical material to any section (existing architecture diagrams, API specs, data models, security policies, integration guides, old technical requirement documents) and they read it. What Socra filled in from what products like this usually need is marked **inferred** until you keep, change or remove it. If you are not technical, say so: they will suggest options and you pick.

## When to Activate

- Whenever Socra or a specialist writes or updates a TRD section (`set_spec_section` with a `trd-` key).
- When someone walks through the TRD on the Technical design (TRD) screen, or challenges, revises or uploads a document to a TRD section.
- With the studio-agentkit skill whenever workflows, agents or human checkpoints are discussed.

## Ground rules

1. **Probe, don't assume.** Ask about the real environment (systems they already run, rules they must follow, volumes, who operates it). Anything assumed is marked inferred.
2. **Trace to the PRD.** Every technical choice serves a PRD requirement, a risk or a promise; name which.
3. **Workflows are first-class.** Pull every multi-step workflow, agent, event and human approval into one picture (studio-agentkit): what starts it, each step, who or what does it, where a person decides, and what happens on failure.
4. **Failure and trust up front.** Security, privacy, errors and observability are asked about, never left for later.
5. **Push back honestly.** Name what is missing against the bar, ask one follow-up at a time, never invent an answer. Offer numbered options with one marked "(suggested)" when the person isn't technical.
6. **Lineage.** Every update names where it came from: their answer, a document, the conversation or an inference.

## Sections

The TRD's sections, in reading order. The key never changes; the title and kicker are what people see.

| Key | Section | Kicker | What it holds |
|---|---|---|---|
| trd-context | System context | Technical boundary | What is inside the product, what is outside, and every system and person it touches |
| trd-architecture | Architecture overview | The shape of the system | The main parts, how they talk, and why this shape |
| trd-capability-map | Capability-to-service mapping | Where each capability lives | Which part of the system delivers each PRD capability |
| trd-agents | Agent roles and orchestration | Workflows and agents | Every workflow and agent: what starts it, its steps, its tools and memory, and how they are orchestrated |
| trd-hitl | Human-in-the-loop boundaries | People decide | Where a person must approve, reject or correct, and what happens while they decide |
| trd-data | Data model | Durable model | The main records, their fields and how they relate |
| trd-states | Data and state transitions | How things move | The states each main record goes through and what moves it |
| trd-apis | API and integration contracts | Edges | Each API and integration: direction, data, frequency, and what happens when it is down |
| trd-auth | Authentication and authorization | Who can do what | How people sign in, the roles, and what each role may see and do |
| trd-storage | Storage and retention | What we keep | Where data is stored, for how long, and how it is deleted |
| trd-events | Event and workflow model | What happens when | The events, schedules and triggers, and the workflows they start |
| trd-ui | UI/component architecture | Screens and components | The screens, the component library and how the interface is put together |
| trd-errors | Error handling | When it fails | What happens when each part fails, and what the person sees |
| trd-observability | Observability | Seeing it run | Logs, metrics, alerts and audit trail, and who watches them |
| trd-security | Security and privacy | Trust | Sensitive data, threats, rules and regulations, and how each is handled |
| trd-performance | Performance expectations | How fast | Volumes, response times and peaks it must handle |
| trd-testing | Testing strategy | How we check | How each requirement and workflow is tested, including agents |
| trd-deploy | Deployment and environments | Where it runs | Environments, hosting, release process and rollback |
| trd-dependencies | External dependencies | What we lean on | Outside services, libraries and teams it depends on, and the fallback for each |
| trd-risks | Technical risks | What could break | The technical risks, how likely, and how each is reduced |
| trd-hardening | Production hardening checklist | Before real customers | What must be done and checked before real customers use it |

## Walkthrough

First the materials step: ask whether they have **any technical material** (architecture diagrams, API specs, data models, security or compliance policies, integration guides, existing technical requirement documents, even rough or old ones) and let them add it. They can add more to any section at any time. Then each section in order: the specialist named in "Asked by" asks the question, checks the answer against the bar, and either accepts it or says in one or two plain sentences what is thin and asks **one** probing follow-up. At most two follow-ups per section; then it is kept as "needs work" and the walkthrough moves on. A finished section is written into the TRD from their answers, linked to them.

Stay a product engineer, not a textbook: plain what, who, when and what-if questions about the process, with technical terms only when the person uses them. The walkthrough asks only the questions below; from the answers the architect infers the technical architecture: the sections named in "Also informs" are written from the same answers (marked inferred, with the answer it rests on), and the rest come from the conversation, the documents and what systems of this kind need. Generated products are usually AI systems, so always find out where a person is in the loop and which steps an agent may take on its own. For example, for an ordering application: does it need to talk to the stock system or a payments system, and when?

| Key | Asked by | Ask | Good enough when | Also informs |
|---|---|---|---|---|
| trd-context | engineer | Walk us through a day in the life: who uses it, what they do from start to finish, and what should happen behind the scenes at each step? | It follows one real case from start to finish, naming who does what and what the system does at each step. | trd-architecture, trd-events, trd-ui, trd-capability-map |
| trd-apis | engineer | Does it need to work with any other systems? Which ones, what does it get from or send to each, and when? | Each system is named with what goes in or out and when (as it happens, daily, on request); or they confirm there are none. | trd-context, trd-dependencies, trd-architecture |
| trd-agents | engineer | Which steps in that process should happen on their own, and which need judgement, like sorting, checking, drafting or chasing someone? | Each automated step is named with what starts it and what it may do on its own; judgement steps are told apart from fixed rules. | trd-events, trd-architecture, trd-capability-map |
| trd-hitl | engineer | Where must a person look at it and say yes or no before it goes on, and what happens while they decide? | Each approval point names who decides, what they see, and what happens on yes, no or no answer. | trd-states, trd-agents |
| trd-data | engineer | What information does it keep about each case or customer, and which of it is personal or sensitive? | It names the main records and their key information, and which of it is sensitive. | trd-storage, trd-security, trd-states |
| trd-auth | architect | What kinds of users are there, how many of each, and what should each be allowed to see and do? | Each role has a rough number and what it may see and do; it says how people sign in today if known. | trd-performance, trd-security |
| trd-errors | engineer | What should happen when something goes wrong: another system is down, information is missing, or the AI isn't sure? | It covers those three cases with what the person sees and what happens next. | trd-observability, trd-testing |
| trd-deploy | architect | Where does it need to run, and does your company have rules about that (cloud, region, approved tools, data staying in the country)? | It names where it runs and any rules, or confirms there are none. | trd-security, trd-hardening, trd-dependencies |
| trd-hardening | engineer | What would have to be true for you to trust it with real customers? | It lists concrete things to check or sign off, with who does it. | trd-testing, trd-risks, trd-observability |

## Inputs

Read only what the section needs, in this order of trust:

1. The person's own answers in the walkthrough and the conversation, especially how the work really happens today.
2. Technical documents they added to the TRD or to a section (architecture diagrams, API specs, data models, security or compliance policies, integration guides, earlier technical requirement documents), read as text.
3. The PRD (users and numbers, flows, requirements, risks), the PRFAQ and the evidence library.
4. What systems of this kind need (studio-reimagine's floor; for agents and workflows, studio-agentkit). Marked inferred or recommended, never confirmed.

## How It Works

1. **Ask about the work, not the technology.** Start from a day in the life: who does what, in what order, and what should happen behind the scenes at each step. Technical terms are used only when the person uses them.
2. **Find the other systems and the when.** For each system the product touches: what goes in or out, and when (as it happens, daily, on request), and what happens when it is unavailable.
3. **Find the people in the loop and the steps that run on their own.** Generated products are usually AI systems, so always establish which steps an agent may take alone, which need judgement (sorting, checking, drafting, chasing), and where a person must say yes or no before it goes on, and what waits while they decide.
4. **Infer the architecture from the answers.** The sections each answer "also informs" are drafted from the same answers (marked inferred, with the answer each rests on): boundary, shape of the system, capability-to-service mapping, events, data, storage, security and so on. The person keeps, edits, challenges or removes anything inferred.
5. **Check, don't flatter.** Each answer is held against its bar; say what is missing in one or two plain sentences and ask one probing follow-up. After two follow-ups keep it as "needs work" and move on. Offer numbered options with one marked "(suggested)" when the person is not technical.
6. **Pull workflows into one picture.** Agents, events and human approvals are written as one workflow model (studio-agentkit): trigger, steps, who or what does each, where a person decides, what happens on failure.
7. **Keep the lineage.** Every update names where it came from (their answer, a document, the conversation, an inference).

## Output Format

Each section is Markdown: short paragraphs or bullets, no headings inside the section. Systems and integrations are a list with direction, data, timing and what happens when down. Workflows are numbered steps naming the trigger, the actor (person, agent or fixed rule) and any approval point. Roles are a list with what each may see and do and a rough number. Any line the team added rather than the person is marked "(inferred)" with the answer it rests on.

## Examples

**A claims application, "other systems":** "It reads the policy from the policy admin system when a claim is filed (as it happens), sends approved payments to the payments system once a day at 6pm, and nothing else. If the policy system is down, the claim is saved and checked within the hour." Good: system, data, direction, timing, failure. Thin: "It connects to our other systems."

**A marketplace, "people in the loop":** "An agent drafts the listing text from photos; the seller approves it before it goes live. Reports of fraud are reviewed by a person within a day; the agent may hide the listing while it waits." Good: who decides, what waits, what the agent may do alone. Thin: "A human reviews things."

## Anti-Patterns

- Technical terms the person never used.
- Skipping where a person is in the loop and which steps an agent may take alone.
- A system named with no timing and no plan for when it is down.
- Showing an inferred line as confirmed.
- Suggesting an agent for a fixed rule (see studio-agentkit).

## Good Outcomes

- A non-technical owner can answer every question without learning a term, and still ends with a sensible architecture.
- Every other system has data, direction, timing and a failure plan.
- Every agent step and every approval point is written down with who decides.
- Nothing inferred is shown as confirmed.
- Claude Code can build the prototype's architecture from the TRD without guessing.

## Integration

- **studio-solution-architect**, **studio-product-engineer**: the specialists the Walkthrough names (architect: roles and hosting, engineer: the rest).
- **studio-prd**: its users, numbers, flows and risks feed the first TRD questions.
- **studio-agentkit**: the workflow and agent model, human checkpoints and memory.
- **studio-reimagine**: supplies the floor and keeps the person's differences visible.
- **studio-muse**: Socra opens this skill whenever a TRD section is written, probed or challenged, and sends the specialist the Walkthrough table names.

## Review Checklist

- [ ] Every other system has data, direction, timing and a failure plan.
- [ ] Every agent step and approval point names who decides and what waits.
- [ ] Inferred lines say "(inferred)" and name the answer they rest on.
- [ ] Questions are about the work, in the person's words.
- [ ] One probing follow-up at a time, two at most per section.
