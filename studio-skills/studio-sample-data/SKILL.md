---
name: studio-sample-data
description: Writing the prototype's sample data so it looks like the people's real operation, in any field: believable names, the field's own vocabulary, realistic volumes and mixes, every state and exception present, and the edge cases the rules talk about, with nothing that could be mistaken for a real person's data. Use when the product engineer shapes a build, when Claude Code seeds a prototype at Generate, and when a reviewer says the prototype "looks fake".
origin: Working Backwards Studio
---

# Sample data that makes a prototype real

Most prototypes look fake because of their data: three rows called "Test 1", every record in the same state, round numbers, no exceptions. People judge a prototype by whether they recognise their own Monday morning in it. This skill writes data they recognise.

## When to Activate

- Generate builds or rebuilds the prototype (Claude Code reads this skill before seeding).
- The product engineer shapes the thin slice or a build move that shows lists, queues or dashboards.
- A mark-up or a reviewer says something looks empty, fake or wrong.

## Inputs

1. The people's words: the roles, records, states, numbers and vocabulary they used, and any sample files they uploaded (their words and real column names win).
2. The PRD: the flow, states, business rules, exceptions and approvals, and what the team recorded as answered or assumed.
3. The domain expert's areas and the evidence library (volumes, rates, typical amounts, from studio-research-numbers).
4. The capability floor and the component map (which screens need data).

## How It Works

1. **List the records the slice touches** (the main record, the people, the things attached to it) and the screens that show them.
2. **Size it like the real thing.** Use their numbers or the evidence: a day screen gets a realistic day; a queue gets a realistic backlog; a dashboard gets enough history for its charts to have shape (several weeks, with a weekly rhythm and one busier period). If no number is known, use studio-research-numbers' estimate and say so in the seed file's header.
3. **Cover every state.** Every state in the life cycle appears at least once, in realistic proportion (most records in the common states, a few in the rare ones), so every badge, filter and empty state can be seen.
4. **Put the rules on screen.** For each business rule with a threshold, include records just below, at and just above it. For each exception in the PRD (late, duplicate, missing information, refused, reopened), include at least one record that shows it.
5. **Use the field's words.** Record names, categories, statuses and notes use the vocabulary the people and the domain expert used, not generic labels. Amounts, dates and durations are uneven, as real ones are (not 100, 200, 300; not every date on the 1st).
6. **Keep it safe.** Names are plainly invented and diverse; no real company, person, address, phone number, card or account number; emails use example.com; any identifier follows the format but cannot be valid. Never copy rows from an uploaded real file into the prototype: derive the shape, invent the values.
7. **Make it repeatable.** One seed script with a fixed random seed, so the demo looks the same each time; a header comment says what it represents (for example "a Tuesday in a busy month for a 10-person team") and which numbers are estimates.

## Output Format

- A seed script in the app (the build's own language), with a header comment: what it represents, the volumes and where they came from, the estimates.
- A short list in the build notes: each state and exception, and which sample records show it (so a reviewer can find them).

## Examples

**Bookings product.** Thin: 3 bookings, all "confirmed", at 9:00, 10:00, 11:00. Real: a Thursday with 23 bookings from 8:15 to 17:40, two cancellations (one inside the late-cancellation window), one no-show, one waitlisted, one booked by staff on someone's behalf, a regular with 14 past visits and a first-timer with none.

**Approvals product with a threshold of 5,000.** Include requests at 4,980, 5,000 and 5,020, one approved then reopened, one refused with a reason, one waiting on someone who is away, and a month of history where Mondays are busiest.

## Anti-Patterns

- "Lorem ipsum", "Test", "Foo", "John Doe", sequential ids as names.
- Every record in the same state; no empty, error or edge states anywhere.
- Real people, companies or contact details; rows copied from a customer's file.
- Volumes so small the lists and charts look empty, or so large the pilot is slow.

## Good Outcomes

- A professional in the field looks at the first screen and recognises their day.
- Every state, rule threshold and exception in the PRD can be found in the data.
- The same demo looks the same every time it is run.

## Review Checklist

- [ ] Every life-cycle state and every PRD exception appears at least once.
- [ ] Each rule threshold has records below, at and above it.
- [ ] Volumes are sourced or labelled as estimates in the seed header.
- [ ] No real personal or company data.

## Integration

- **studio-product-engineer**: names the thin slice the data must fill.
- **studio-business-analyst**: its states, rules and exceptions are what the data must show.
- **studio-research-numbers**: supplies the volumes and mixes.
- **studio-acceptance-tests**: tests point at the sample records that prove each rule.
- **Claude Code at Generate**: reads this skill before writing the seed.
