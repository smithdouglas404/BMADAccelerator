---
name: studio-mem0-memory
description: How the Studio's agents use Mem0, their long-term fact memory: what to save and with what labels, how to search it, how it is kept apart per customer and product, how facts expire, and how to read a fact's history. Use when an agent needs a fact from earlier work, when something is decided or answered, and when a researched figure should be remembered.
origin: Working Backwards Studio
---

# Mem0: the agent's long-term facts

Mem0 (self-hosted, open source) holds what was said, decided and learned, searchable later by meaning. It is scoped per customer and per product: one customer's facts are never offered to another's. Letta is the working mind; Mem0 is the archive it can always be rebuilt from.

## When to Activate

- An agent is about to ask something that may already have been answered.
- A person answers a question, approves or rejects something, or corrects a screen.
- A researched figure or finding should outlive this conversation.
- Someone asks "why did we decide that?" or "what did it say before?".

## Inputs

- Mem0 records, each labelled the same way: `app_id` (the Studio), `agent_id` (`studio-<role>`), `user_id`, `run_id` (the product), and metadata `kind` (`fact`, `decision`, `qa`, `lesson`, `requirement`, `run_summary`, `discussion`), `agent_role`, `source`, `use_case`, `use_case_title`, `customer`, `confidence`.
- The turn's retrieved context: the other products of this customer, found by meaning.
- A record's history: how Mem0 changed or replaced it over time (shown on the Agent memory page).

## How It Works

1. **Search before asking.** `mcp__studio__search_memory` with a focused question. Results are this customer's other products and your own role's records; nothing from another customer is returned.
2. **Save what was settled, labelled.** The Studio does this when someone answers, approves or corrects, and when a specialist speaks or settles an area; you do not duplicate it. Decisions, answers and requirements are stored as written (not re-interpreted); discussions and research notes are summarised into facts.
3. **A researched figure expires.** A `fact` needs an `expiration_date` (research goes stale); a decision, requirement or answer never expires. Save a figure with its unit, year, place and source (studio-research-numbers).
4. **Read the record, not a memory of it.** When a fact matters, say which record it came from and which product. If two records disagree, the newer one wins, and say that they disagreed.
5. **Check the history when a fact looks wrong.** The Agent memory page's History button shows how a record changed; Mem0 keeps the earlier wording.
6. **Be honest about search.** The self-hosted server searches by meaning (with keyword and entity matching where its packages are installed). Do not claim a result was reranked or newest-first; read the dates.
7. **Keep customers apart.** Never carry one customer's prices, names or plans into another's product. A lesson is general; a fact is specific and stays with its customer.

## Output Format

When you rely on a fact:

```text
From <product> (<date>, <kind>): <the fact in the record's own words, shortened>.
```

When nothing is found:

```text
Not in memory: <the question>. <Asking the person | marking an assumption>.
```

## Examples

**An answered question.** The owner said last month that an "overdue" flag counts business days and pauses while the customer is asked for more time. A new product for the same customer does not ask again; it says "From <earlier product> (<date>, qa): overdue counts business days and pauses while the customer is asked for more time. Same here?" and asks only to confirm.

**A stale figure.** A research fact about average delivery time expired last quarter. The agent finds it is past its date, re-checks the source, and saves the new figure with a new expiry.

**Nothing found.** "Not in memory: how this customer wants refunds escalated. I'm asking you, with two options and my suggestion first."

## Anti-Patterns

- Searching with a one-word query, or not searching at all.
- Treating a recalled fact as this client's requirement without confirming.
- Saving private details as a general lesson.
- Calling a search "reranked" or "latest only": the self-hosted server does not do that.
- Re-saving what the Studio already saves for you.

## Good Outcomes

- Repeat customers are asked only what is new.
- Every recalled fact names its record and product.
- Old figures are re-checked, not repeated.
- The memory page shows facts read and written for each agent.

## Review Checklist

- [ ] Searched with a focused question before asking.
- [ ] Used only this customer's records and said where each came from.
- [ ] Gave any saved figure a unit, a year, a place, a source and an expiry.
- [ ] Said "not in memory" instead of guessing.

## Integration

- **studio-letta-memory**: the working-mind side of the same loop; read it with this one.
- **studio-research-numbers**: how figures are sourced before they are saved.
- **Every specialist skill**: each searches Mem0 first and relies on the Studio to save its findings.
- **studio-prfaq, studio-prd, studio-trd**: earlier decisions and answers recalled here feed the documents.
- **The Agent memory page** (Settings): lists each agent's Mem0 facts, search, history and use counts.
