---
name: bacc-floor
description: Write the product floor (bacc/floor.md) right after intake - the category, the leading products, everything this kind of product has, and the gap questions BMAD won't ask. Use before any BMAD agent starts, and update it whenever the client answers.
---

# The product floor

Doug, 2026-11-15: "users are only able to give you part of the floor. You need to fill in the rest of the floor so that they have some scaffolding and then you help them build in the gaps of what they don't know, because they're trying to build an unknown and they don't know that certain things might exist."

The client's intake is part of the floor. You fill in the rest from what you know about this kind of product and industry. BMAD draws out what the client knows; you bring what they don't. Generate builds the whole floor straight away, so the client reacts to a working product, and every answer after that raises it.

## When

1. Right after intake, before any BMAD agent starts (set_stage refuses until `bacc/floor.md` is registered).
2. Whenever the client answers a gap question, confirms or removes something, or a BMAD document settles an item: update the item's state, keep its id, and register the file again. The floor only rises; an item leaves only with the client's explicit "no". The client also changes items directly on the Product map; read the file before you edit it.

## How

1. **Recall first.** `search_memory` for a playbook from earlier use cases of the same category and industry ("online shop confectionery playbook"). Start from it if there is one.
2. **Name the category and industry.** What kind of product is this (online shop, booking site, field-service app...) and in which industry (sweets and food, healthcare...)? The industry adds its own must-haves: for food, allergens and ingredient labels, shelf life, heat-safe shipping, age rules for some products.
3. **Study the leaders and the client's own material.** Name at least three real leading products in the category and what each does best: search the web (WebSearch, WebFetch) for the category's leaders and their features, and for the industry's rules (labelling, age limits, shipping, returns law). Read every upload in `bacc/uploads/` and the intake: a business case often says far more than the intake form. Save what you found, with links, in `bacc/research/floor-research.md`. Right after intake, write the floor from what you already know first and register it (that starts the first build, and speed matters), then research and raise it. When the Agent tool is available, run the three studies in parallel with your research team subagents (`category-researcher`, `industry-expert`, `innovation-scout`, each writing to `bacc/research/`): a category researcher (the leaders and what they all have), an industry expert (rules, conventions and risks for this industry), and an innovation scout (what nobody in the category does yet, grounded in the client's context).
4. **Write the scaffold.** Everything a leading product of this kind has, grouped under `### Area` headings (at least six areas, at least 30 items). Each item is one line with a state:
   - `[confirmed]` the client said it, or a signed-off document has it;
   - `[assumed]` you added it because leading products have it (Generate builds it; the client can change it);
   - `[out]` the client explicitly said no (quote them).
   Give each item an id in brackets after its state, `(F1)`, `(F2)`..., numbered through the whole file. `register_document` numbers any item you leave without one. An id never changes or gets reused: documents, the Product map and the app (`data-floor="F12"`) all point at it.
   A pilot limit changes behaviour, not presence: "pre-order only" keeps the basket and checkout and marks the payment step `[out]`.
5. **Gap questions.** At least five questions, most important first, that the client hasn't answered and BMAD won't ask, each with why it matters for this product and a suggested answer, so the client can just say yes.
6. **Ideas.** What the leaders do that this product could do better, and what nobody in the category does yet. Ground each in the client's context.
7. **Register it** with `register_document` (path `bacc/floor.md`, type `brief`, title "Product floor", review true). The tool checks the shape and starts the first build of the app from the floor if none exists yet.
8. **Ask** the gap questions with `ask`, one at a time, then hand the floor to the BMAD agent as the client's input: "this is the full product; draw out where the client differs".
9. **Remember.** When the floor settles, `save_lesson` the category playbook (areas and items, not the client's private details) so the next use case of this kind starts higher.

## Format

```markdown
# Product floor: <name>

## Category
<kind of product>, <industry>. <one line on who it serves>

## Leading products
- <name>: <what it does best>
- ...

## Scaffold
### Catalogue
- [confirmed] (F1) Nine planet collections (intake)
- [assumed] (F2) Search and filters by diet (every leading sweet shop has them)
- [out] (F3) Payment at checkout (client: "pre-order only for the pilot")

### Product page
- ...

## Gap questions
1. <question> Why: <why it matters>. Suggested: <answer>.

## Ideas
- <idea>, from <leader or the client's context>
```
