---
name: studio-prd
description: The Studio's product requirements method. Holds the PRD's sections in order, what each one holds, and the guided walkthrough (the question per section, who asks it, and when an answer is good enough). Use when writing or reviewing any PRD section, and for the PRD walkthrough on the Requirements doc (PRD) screen.
origin: Working Backwards Studio
---

# The PRD: what the product must do

## What a PRD is

The **product requirements document** says what the product must do and for whom, in enough detail that a team could build it and a customer would recognise it. It comes after the PRFAQ (the promise) and before the TRD (how it will be built).

It follows a product-management method, in this order: start with the **problem and the customer**, then **who is involved** and **their journey**, then **what they hire the product for**, the **promise** and its **boundaries**, then **what it must do** and **how you'll know it works**, and finally **what could go wrong** and **how it rolls out**. Skipping ahead (writing features before the problem is clear) is the most common way products go wrong.

**How you will work on it here:** answer a short set of plain questions from the business analyst (and the UX designer or domain expert where it fits): what it is, who uses it and how many, a day in the life, what it must do, how you will know it worked. Each answer is checked; if it is thin you get a follow-up, and the rest of the PRD is worked out from your answers. You can add documents to any section (business cases, research, process maps, old requirement docs, even rough notes) and the team reads them. Anything Socra filled in from what products like this usually have is marked **inferred** until you keep, change or remove it.

## When to Activate

- Whenever Socra or a specialist writes or updates a PRD section (`set_spec_section` with a `prd-` key).
- When someone walks through the PRD on the Requirements doc (PRD) screen, or challenges, revises or uploads a document to a PRD section.

## Ground rules

1. **Their words first.** A section built from the person's answer is confirmed; anything added from the category's floor stays marked inferred or recommended.
2. **Problem before features.** If the problem or the customer is still vague, say so and ask about it before writing requirements that depend on it.
3. **Testable.** Requirements and acceptance criteria are written so someone could check them (Given / When / Then or a plain observable result).
4. **Push back honestly.** Praise only what is there. Name what is missing against the section's bar, ask one follow-up at a time, never invent an answer for them.
5. **Lineage.** Every update names where it came from: their answer, a document, the conversation or an inference.

## Sections

The PRD's sections, in reading order. The key never changes; the title and kicker are what people see.

| Key | Section | Kicker | What it holds |
|---|---|---|---|
| prd-problem | Problem and customer context | Why now | Who has the problem, what they do today, what it costs them, and why it matters now |
| prd-use-case | Validated use case | Product truth | The one use case we are proving first, and the evidence that it is real |
| prd-actors | Target users and actors | Who is in the room | Every kind of person (and system) involved, what each needs and what each may do |
| prd-journey | Customer journey | Before, during, after | The journey before, during and after using the product, and where it hurts today |
| prd-jobs | Jobs to be done | What they hire it for | The jobs people hire the product to do, in their words |
| prd-promise | Product promise | What we say out loud | The promise from the PRFAQ, stated as what the customer can count on |
| prd-scope | Scope and non-goals | Boundaries | What is in the first version and, just as important, what is not |
| prd-capabilities | Capabilities | The floor | The capabilities the product needs, including the floor leading products of the category have |
| prd-flows | Primary customer flow | Experience shape | The main flow step by step, from the first screen to the result |
| prd-functional | Functional requirements | What it must do | What the product must do, each requirement specific and testable |
| prd-acceptance | Acceptance criteria | Proof of value | How we check each requirement is met, and how we know the promise was kept |
| prd-edge-cases | Edge cases | When it gets messy | What happens when things go wrong, arrive late, are missing or are unusual |
| prd-open-questions | Open questions | Only the owner can say | Decisions only the owner can make, each with its options |
| prd-metrics | Success metrics | How we'll know | The numbers or observable signals that show it worked, with a target |
| prd-rollout | Rollout assumptions | Pilot to beta | Who gets it first, how it widens, and what must be true at each step |
| prd-risks | Risks and dependencies | What could stop it | Business, adoption and delivery risks, and what the product depends on |

## Walkthrough

First the materials step: ask whether they have **anything** that could help with the requirements (business cases, research, process maps, existing requirement documents, spreadsheets, notes, even rough or old ones) and let them add it. They can add more to any section at any time. Then each section in order: the specialist named in "Asked by" asks the question, checks the answer against the bar, and either accepts it or says in one or two plain sentences what is thin and asks **one** follow-up. At most two follow-ups per section; then it is kept as "needs work" and the walkthrough moves on. A finished section is written into the PRD from their answers, linked to them.

Keep it light: enough to define the product and the service, not a full specification. The walkthrough asks only the questions below; the sections named in "Also informs" are inferred from the same answers (marked inferred, never confirmed) and every other section is filled from the conversation, the documents and the category's floor. Sections the walkthrough does not ask about can still be opened, edited, challenged or given a document at any time.

| Key | Asked by | Ask | Good enough when | Also informs |
|---|---|---|---|---|
| prd-problem | business-analyst | What problem does this solve, who has it today, and what does it cost them now? | It names a specific kind of person, what they do today, and a real cost (time, money, risk or frustration), ideally with an example. | prd-use-case, prd-jobs |
| prd-promise | business-analyst | In a sentence or two, what is the product or service, and what does the customer get from it? | A customer could repeat it back: what it is, who it is for, and the one thing they get. | prd-capabilities, prd-jobs |
| prd-actors | business-analyst | Who will use it, roughly how many of each kind, and who else is affected or has to approve things? | It names each kind of user with a rough number, plus anyone else affected or approving. | prd-rollout, prd-capabilities |
| prd-journey | ux | Walk me through a day in the life: how does it go today, and how should it go with the product? | It covers today and the future, step by step, and points to where today hurts most. | prd-flows, prd-edge-cases |
| prd-scope | business-analyst | What must the first version do, and what are you happy to leave for later? | It lists what is in and at least one thing that is explicitly out. | prd-capabilities, prd-use-case |
| prd-functional | business-analyst | What are the things it must do that you'd check before calling it done? | Each item is specific enough to check, and together they cover the main flow. | prd-flows, prd-capabilities |
| prd-acceptance | business-analyst | How would you check each of those works, and how would you know the promise was kept? | At least one observable check per key requirement. | prd-functional |
| prd-metrics | business-analyst | How will you measure success, and what number would make you call it a win? | It names at least one measure with a target or a clear before-and-after. | prd-rollout |
| prd-risks | domain | What could stop this working: people not adopting it, rules, other teams, timing? | It names the biggest risks and how each would be handled or watched. | prd-edge-cases, prd-open-questions |
