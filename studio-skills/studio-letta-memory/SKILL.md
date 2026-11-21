---
name: studio-letta-memory
description: How the Studio's agents use Letta, their working mind: a persona and status that persist across products, an archive of longer notes per role, a playbook block per customer, a human block for what each role learns about the people it works with, and background reflection. Use before an agent answers from past work, when it settles something worth keeping, and when it needs a role's experience.
origin: Working Backwards Studio
---

# Letta: the agent's working mind

Letta (self-hosted, open source) is what gives an agent a stable identity across weeks: a persona that does not drift, a status that says what it is doing, and notes it can come back to. Mem0 holds the facts; Letta holds the mind that uses them. Anything in Letta must be rebuildable from Mem0 or the Studio's records: if losing it would hurt, it also goes to Mem0.

## When to Activate

- Before answering about an earlier product, a past decision or "what usually works for this kind of product".
- When a conversation settles something general that would help a future, similar product.
- When a gate passes (an approved decision) or a build finishes: the role reflects.
- When one role needs another's experience.
- When the memory page shows a role read but never written (or the reverse): fix the gap, do not hide it.

## Inputs

- The role's own Letta agent: its read-only `persona`, its status block, `top_lessons` (written by the app from saved lessons), the shared `bacc_portfolio` block (one line per product) and its `human` block.
- The role's archive: longer notes the app saved from its findings, tagged with the customer and the product.
- This customer's playbook block: what was decided for them, newest first (read by the Studio each turn).
- The turn's `<retrieved_context>`: Mem0 facts, the playbook, archive notes and top lessons the Studio already fetched.

## How It Works

1. **Recall first, once.** Read `<retrieved_context>` before asking anything. Use what fits and say where it came from ("from this customer's decision on their booking product"). Never copy another customer's details: the playbook and archive notes shown are this customer's only.
2. **Search before you ask a person.** `mcp__studio__search_memory` with your role (`analyst`, `architect`, `engineer`, `ux`, `validator`, `muse`, or `domain-<field>` such as `domain-lending-expert`) searches your Mem0 facts and your own archive for this customer. Use a focused query.
3. **Ask a role, not the owner, for experience.** `mcp__studio__ask_role_memory` puts a question to another role's Letta mind ("what do owners of booking products usually correct after seeing the screens?"). Its answer is advice from past products, not a decision.
4. **Save a lesson once the conversation teaches one.** `mcp__studio__save_lesson` with your own role: a general lesson with a confidence 0 to 1 ("booking tools: show why a booking is on hold, not only that it is"). No names, prices or private details: lessons cross customers.
5. **Let the app keep the rest.** Your findings go into your archive and Mem0, approved decisions and answers go into the customer's playbook, and a gate or finished build sends your role a message so its persona learns. You do not copy these by hand.
6. **Keep the human block honest.** When a message names a person and shows how they decide ("Dana approves anything over the limit herself"), add one short line to your `human` block with `core_memory_append`. Nothing private to one customer goes in a role's human block that another customer's product would read: keep it to how the person works.
7. **Say what you could not do.** If Letta is down the Studio carries on; say plainly when you answered without it.

## Output Format

A lesson, as saved:

```text
role: <your role key>
lesson: <one general sentence a future product can act on>
confidence: <0 to 1>
```

A note to a person that used memory:

```text
From <where: this customer's playbook | a Mem0 fact from <product> | my archive | <role>'s experience>: <what it says>. <How it changes what I suggest.>
```

## Examples

**The business analyst, on a lending product.** Retrieved context holds the customer's playbook: "supervisors approve every loan above the limit". The analyst does not ask who approves; it asks what the limit is and whether it differs by loan type, then saves the answer as a finding (which lands in its archive) and, at the gate, the playbook records the figure.

**The domain expert, a new field.** First time a field is named ("Lending expert"), the Studio makes that expert its own Letta mind with the same memory as every other role. On its second lending product it searches `domain-lending-expert` first and arrives with "deadlines, vocabulary and risks" already in hand.

**A lesson worth saving.** The owner corrected the same thing in three products: waiting time starts when the request is received, not when it is assigned. Save: "service tools: ask early when the waiting clock starts", confidence 0.8.

## Anti-Patterns

- Saving one client's details as a lesson (lessons are general).
- Searching with a vague query ("lending") instead of the question you need answered.
- Treating a role's advice as a decision: only a person decides money, legal, privacy, secrets, deleting data or contacting outsiders.
- Editing `top_lessons` or the persona: the app writes those.
- Hiding that memory was empty or unavailable.

## Good Outcomes

- Repeat customers are not asked what they already answered.
- Each role's memory page shows reads and writes: "used", not "write-only".
- A new specialist or a new field starts with the same memory as the others.
- Lessons shorten the next product's questions.

## Review Checklist

- [ ] Searched my own memory before asking a person.
- [ ] Said where recalled facts came from; used only this customer's.
- [ ] Saved at most the general lessons the conversation taught, with a confidence.
- [ ] Noted how a named person decides in my human block, when it showed.

## Integration

- **studio-mem0-memory**: the facts side of the same loop; read it with this one.
- **studio-reimagine** and **studio-muse**: Socra's stance and conversation; memory feeds them, never replaces what the owner says now.
- **Every specialist skill** (studio-business-analyst, studio-solution-architect, studio-ux-designer, studio-product-engineer, studio-domain-expert): each searches its own memory first and saves its own lesson.
- **The Agent memory page** (Settings): shows each agent's persona, blocks, archive notes and how often its memory is read and written.
