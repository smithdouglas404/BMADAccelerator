---
name: studio-acceptance-tests
description: Turning what the people said and approved into acceptance tests a tester, a reviewer or Claude Code can check without asking anyone, written as Given / When / Then in the people's words, one per rule, state change, exception and approval, each pointing at the sample record that proves it. Use when the business analyst writes acceptance, when a Board card moves toward building, and when Claude Code builds or a person reviews a version.
origin: Working Backwards Studio
---

# Acceptance tests from the people's words

A prototype is high-fidelity when it does what the people said, not just looks like it. Acceptance tests are how anyone can check that without being in the room, and how Claude Code knows what "done" means for each card.

## When to Activate

- The business analyst covers the `acceptance` area, or any rule, exception or approval is answered.
- A Board card moves to Being made real (its criteria must be enough to build from).
- Generate builds a version (Claude Code writes the checks it can automate).
- A person reviews a version on the preview (the tests are their checklist).

## Inputs

1. The people's answers and approvals: what they said, decisions, and what the team recorded as answered (their words win).
2. The PRD: flow, roles, states, business rules with their numbers, exceptions, approvals; what was assumed and its default.
3. The card's details and the backlog item's words.
4. The sample data (studio-sample-data), so each test names a record that shows it.

## How It Works

1. **One test per thing that can go wrong.** For each business rule, state change, exception, approval and role permission in the slice, write one test. Rules with a number get a test either side of it.
2. **Write Given / When / Then in their words.** Given a situation (using a named sample record), When a person or the system does something, Then something visible happens. "Then" is observable on screen or in the record, never "works correctly".
3. **Trace it.** Each test names where it came from (the person's words, a decision, or "assumed: <default>"), so a reviewer knows whether a failure breaks something they said or a default they can change.
4. **Mark how it is checked.** Automated (Claude Code writes it as a test in the app), on the preview (a person clicks through), or both.
5. **Keep it short.** The slice's tests fit on a page. If a card needs more than about eight, it is probably two cards: say so.
6. **Write them where they're used.** On the card (`mcp__studio__upsert_move`, acceptance criteria) and the PRD's acceptance section (`mcp__studio__set_spec_section`).

## Output Format

```text
AT-<n> <short name>  [from: <their words | decision | assumed: default>] [check: automated | preview | both]
Given <situation, naming a sample record>
When <action, by whom>
Then <visible result>
```

## Examples

**A threshold rule.** The owner said "anything over 5,000 needs a supervisor".

```text
AT-3 Supervisor above 5,000  [from: owner's words] [check: both]
Given request R-1042 for 5,020 submitted by an adjuster
When the adjuster approves it
Then it shows "Waiting for supervisor" and appears in the supervisor's queue, not as approved
AT-4 At the limit  [from: assumed: "over" means strictly above] [check: automated]
Given request R-1041 for exactly 5,000
When the adjuster approves it
Then it is approved without a supervisor
```

**An exception, bookings.** "Given booking B-7 cancelled 1 hour before its start, When the customer cancels, Then they see the late-cancellation fee before confirming" [from: decision on late cancellations] [check: preview].

## Anti-Patterns

- "The system works correctly", "it should be user friendly": not checkable.
- Tests for things nobody said or assumed (invented scope).
- A test without a named sample record: the reviewer can't find the case.
- Hiding whether a test rests on their words or on a default.

## Good Outcomes

- Someone who wasn't in the room can check every rule the people stated.
- Claude Code knows when a card is done; a person reviewing the preview has a checklist.
- A failed test tells you whether it broke their words or a changeable default.

## Review Checklist

- [ ] Every rule, exception, approval and permission in the slice has a test.
- [ ] Every number has tests either side of it.
- [ ] Every Then is visible on screen or in the record.
- [ ] Every test traces to their words, a decision, or a named default.

## Integration

- **studio-business-analyst**: writes them as it covers rules, exceptions, approvals and acceptance.
- **studio-sample-data**: provides the named records each test uses.
- **studio-prd**: the acceptance section holds them.
- **working-backwards-studio**: cards move to Done only when a person said yes on the preview; these tests are what they check.
- **Claude Code at Generate**: automates the ones marked automated.
