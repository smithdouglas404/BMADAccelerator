---
name: studio-competitor-teardown
description: Taking apart the leading products in the product's category, feature by feature and screen by screen, from their own public pages, docs and reviews, to set the capability floor, find what they all do, what they miss and what people complain about, and give the UX designer real patterns to start from. Use when the category is first inferred, when the floor is raised, and when the people ask how others do something.
origin: Working Backwards Studio
---

# Competitor teardown

"Floor, not ceiling": a pilot should have everything the leading products of its kind have, and then what makes this one different. That needs a real look at the leaders, not a guess. This skill does the look.

## When to Activate

- At the opening, once the category is inferred (with the category researcher).
- When the product moves into a new area, or a capability's floor looks thin.
- When someone asks "how do others do this?", or the UX designer needs patterns for a screen.
- When the people name a competitor or a product they admire.

## Inputs

1. Products the people named (competitors, products they admire or hate). Always included.
2. The category and its leaders: at least three, found by search (market reports, "best <category> software" lists from reputable reviewers, app store rankings).
3. Each leader's own public material: product pages, pricing pages, help centre and docs, release notes, public demo videos, screenshots in their own marketing.
4. What their users say: review sites and app store reviews (patterns, not single complaints).
5. Never: anything behind a login you'd need to sign up for, private material, or another customer's data.

## How It Works

1. **Pick the leaders.** At least three, mixing the market leader, a challenger and one aimed at the same size of customer as these people. Say why each was picked.
2. **Feature grid.** For each capability area of the product, what each leader offers, from its own docs or pages (link each cell). Mark: has it, partly, not found.
3. **Screen patterns.** For the slice's key screens, how the leaders lay them out (first screen, the main list, the detail view, the key moment), from their public screenshots or demos, in a line each.
4. **What users say.** The three most common praises and complaints per leader, from reviews, with links. Complaints are where this product can win.
5. **Sort it.** "All of them have it" goes into the floor (capabilities, items marked [assumed]). "Most have it" becomes a recommendation. "Only one has it" and "nobody does it well" go to the innovation scout and studio-reimagine as chances to differ.
6. **Record it.** Write `studio/research/category.md` (or add to it), floor items with `mcp__studio__set_capability`, and patterns the UX designer can use in the component map's reasons.

## Output Format

```
## Leaders (why each)
## Feature grid  (area | leader A | leader B | leader C | floor?)  each cell linked
## Screen patterns (screen: pattern per leader, one line each)
## What users say (praise / complaints, linked)
## Floor / Recommended / Chances to differ
```

## Examples

**Scheduling product.** Leaders: the market leader, a fast-growing challenger, one aimed at small studios. Grid shows all three have online booking, reminders and a waitlist (floor); two of three have deposits (recommended); users of all three complain about rescheduling taking too many steps (a chance to differ: one-tap reschedule).

**Internal approvals tool.** People named an existing tool they use and dislike. Its complaints (no mobile approvals, no reason on refusal) become this product's "why us"; the floor comes from three leaders' approval features.

## Anti-Patterns

- Feature lists from memory instead of the leaders' own pages.
- Copying a competitor's look, name, copy or assets: take patterns, never their identity.
- Only market leaders; no product aimed at customers like these people.
- Treating one angry review as a pattern.

## Good Outcomes

- The floor rests on what real leaders verifiably have, with links.
- The people see where they can win, from what users actually complain about.
- The UX designer starts from proven patterns rather than a blank page.

## Review Checklist

- [ ] At least three leaders, each with a reason, plus any the people named.
- [ ] Every grid cell links to the leader's own material.
- [ ] Floor, recommended and chances to differ are sorted and recorded.
- [ ] Nothing copied but patterns.

## Integration

- **category-researcher**: runs this skill and writes category.md.
- **studio-ux-designer**: uses the screen patterns.
- **studio-reimagine** and **innovation-scout**: take the chances to differ.
- **studio-domain-expert**: adds the field's rules the leaders all follow.
- **studio-prfaq**: "why us" draws on what users complain about elsewhere.
