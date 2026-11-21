---
name: studio-research-numbers
description: Finding the numbers a product's field runs on (volumes, rates, times, amounts, thresholds, market size, benchmarks) from real published sources, recording each with its unit, year, place and link, and turning them into suggested options, sample data and pilot targets. Use when the domain expert, the researchers or the PRFAQ need a figure, and whenever a question's answer would be better grounded in a number than an opinion.
origin: Working Backwards Studio
---

# Numbers with sources

A prototype that says "about 120 claims a day, 4% flagged for review" reads as real; one that says "lots of claims" reads as a mock-up. This skill gets the numbers a professional in the field would quote, from sources a sceptic would accept, and never passes off a guess as a fact.

## When to Activate

- The domain expert derives a field's areas, or asks a question whose suggested option needs a range.
- The category researcher or industry expert writes their findings.
- The PRFAQ makes a claim about the problem's size or the customer's pain.
- The product engineer sets the pilot's target, or sample data needs realistic volumes.
- Someone asks "how big is this?", "what's normal?" or "is that a lot?".

## Inputs

In this order of trust:

1. The people's own numbers: what they said, documents and reports they added. Always preferred; ask for them first when they matter.
2. Official statistics and regulators: national statistics offices, central banks, regulators' published data and rules.
3. Industry bodies and standards organisations: their annual reports, surveys and benchmarks.
4. Peer-reviewed studies and companies' audited annual reports.
5. Reputable analysts and trade press, naming their own source. Use only when 1 to 4 have nothing, and say so.
6. Never: an unsourced blog figure, a number from memory presented as fact, or a figure from another country or year without saying so.

## How It Works

1. **Name the number first.** Write down exactly what you need and what it will decide: "the share of orders returned in this category, to set the returns screen's prominence". A number that decides nothing is not worth finding.
2. **Ask them if they have it.** If it is their own operation (their volumes, their times), it comes from them. Recommend they pull it, and say what it decides.
3. **Search narrowly.** Field + measure + market + recent year ("average days to settle a property claim United States 2025"). Open the source itself, not a page quoting it.
4. **Record it as evidence** with `mcp__studio__add_evidence`: the figure, the unit, the year, the place it applies to, the source's name and link, and confidence (high for official data, medium for industry bodies, low for trade press).
5. **Say what it is not.** A national average is not their number; a figure from 2019 may be stale; a figure for large firms may not fit a small one. Write that caveat next to it.
6. **Use it.** As a range in suggested options ("most teams like this handle 50 to 200 a day"), as volumes in sample data (studio-sample-data), as a baseline for the pilot's target (studio-pilot-metrics), and in the PRFAQ's problem statement.
7. **When nothing is found**, say "not found" and either mark an estimate (with the reasoning: "a team of 10 handling about 15 each a day suggests about 150") or leave it open for them.

## Output Format

Each number, wherever it appears:

```
<figure> <unit> (<place>, <year>; <source name>, <link>) [confidence]
Caveat: <what it is not, in one line>
Decides: <what in the product it settles>
```

An estimate is labelled `Estimate:` with its reasoning, never formatted like a sourced figure.

## Examples

**Field service.** Need: how many jobs a technician does in a day, for sample data and the day screen's density. Their dispatcher has it: ask. If not: an industry body's benchmark for residential service visits per technician per day, recorded with its year and country; caveat: commercial work runs fewer, longer visits.

**Online retail.** Need: the share of orders returned, to decide whether returns get their own tab. Source: a national retail federation's annual returns report, with the year; caveat: varies hugely by category (apparel far above groceries), so the category's own figure is preferred if the report breaks it down.

**Not found.** "I couldn't find a published figure for how often <their record> is disputed in <their market>. Your own last year would settle it; until then I've assumed about 1 in 20, marked as an estimate."

## Anti-Patterns

- A precise-looking number with no source ("73% of customers...").
- A global or foreign average used as if it were this market's.
- Searching for numbers that decide nothing.
- Burying the caveat; it goes right next to the figure.

## Good Outcomes

- Every figure in the PRFAQ, the suggested options, the sample data and the pilot target can be traced to a source or is visibly an estimate.
- The people learn which of their own numbers would sharpen the product, and why.
- The prototype's volumes and ranges look like the real operation.

## Review Checklist

- [ ] Each figure has a unit, a year, a place and a link.
- [ ] Each has a caveat and says what it decides.
- [ ] Their own numbers were asked for before outside ones were used.
- [ ] Estimates are labelled and reasoned.

## Integration

- **studio-domain-expert**: the main user; numbers ground its suggested options and "worth considering" points.
- **studio-sample-data**: takes the volumes, ranges and mixes for the prototype's data.
- **studio-pilot-metrics**: takes the baselines the pilot is measured against.
- **studio-prfaq**: the problem's size and the customer's pain cite these numbers.
- **category-researcher** and **industry-expert**: record figures in their research files in this format.
