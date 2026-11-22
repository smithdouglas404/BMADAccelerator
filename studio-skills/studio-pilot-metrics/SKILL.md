---
name: studio-pilot-metrics
description: Agreeing how the pilot will prove it worked, in any field: one main measure tied to the product's promise, its baseline today, a target, two or three guardrails, who judges and when, and how the prototype shows them, so the pilot ends in a clear yes or no. Use when the product engineer covers what proves it worked, when the PRFAQ or PRD says how you'll know, and before a pilot starts.
origin: Working Backwards Studio
---

# Pilot success measures

A pilot without an agreed measure ends in opinions. This skill pins down, before anything is built, the one number that says the promise came true, what it is today, what good looks like, and what must not get worse.

## When to Activate

- The product engineer's `proof` area is open, or the PRFAQ or PRD's "how you'll know" is empty or vague.
- Before a pilot starts (Ready to pilot), and when its first results come in.
- When someone says "faster", "better", "easier" or "more" without a number.

## Inputs

1. The product's promise in the PRFAQ, and the people's own words about what better means.
2. Their current numbers (the baseline), asked for first; studio-research-numbers' benchmarks when they have none.
3. The thin slice and the pilot's users, length and size (from the product engineer).
4. What could get worse if the main measure improves (from the domain expert and the business analyst).

## How It Works

1. **One main measure, from the promise.** Turn their words ("approved faster") into a measurable thing (median time from submission to decision) with a clear start and stop point. One, not five.
2. **Baseline.** What it is today, from their numbers (recommend they pull them, and what to pull). If unknown, a sourced benchmark or an estimate, labelled, with a plan to measure the first week.
3. **Target.** What would make them say yes, in their words and as a number, realistic for the pilot's length and size. Offer options around a suggested target.
4. **Guardrails.** Two or three things that must not get worse while the main measure improves (errors, complaints, workload, fairness, cost). Each with a limit.
5. **Who decides, and when.** The person or group that judges, the date, and what happens on yes, no or mixed.
6. **Show it in the prototype.** The prototype displays the main measure and guardrails (from the sample data), so the people see what they'll be looking at; the pilot build records the events needed to compute them for real.
7. **Write it down** in the PRD ("how you'll know"), the PRFAQ's internal FAQ, and the engineer's coverage note.

## Output Format

```text
Main measure: <what>, from <start event> to <end event>, <median/share/count>
Baseline: <value> (<source or "their data, to pull: ..." or "Estimate: ...">)
Target: <value> by <date>, because <their words>
Guardrails: <measure> stays <limit>; <measure> stays <limit>
Decides: <who>, on <date>; yes = <next step>, no = <next step>
Shown in the prototype: <screen or widget>
```

## Examples

**Approvals product, "approved faster".** Main measure: median hours from submission to final decision. Baseline: their last quarter's data (to pull from the current system). Target: under 24 hours for requests below the supervisor threshold. Guardrails: share of approvals later reversed stays under its current level; supervisor queue never older than 2 days. Decides: the operations lead at the end of a 6-week pilot.

**Field service, "fewer return trips".** Main measure: share of jobs finished on the first visit. Baseline: their last year, or a sourced industry benchmark labelled as such. Target: up by a set number of points they choose. Guardrails: average job time doesn't rise by more than 10%; parts cost per job flat.

## Anti-Patterns

- Five equal "KPIs" and no main measure.
- "Users love it" or "it feels faster" as the measure.
- A target with no baseline, or a baseline invented without a label.
- Measures the pilot can't actually record.

## Good Outcomes

- Everyone knows before the build what a successful pilot looks like, as a number.
- The prototype already shows the measure, so the demo tells the story of the promise.
- The pilot ends in a decision, not a debate.

## Review Checklist

- [ ] One main measure, tied to the PRFAQ's promise, with start and stop points.
- [ ] Baseline sourced, theirs to pull, or labelled estimate.
- [ ] Target in their words and as a number, with a date.
- [ ] Two or three guardrails with limits.
- [ ] Who decides, when, and what happens next.

## Integration

- **studio-product-engineer**: covers its `proof` area with this skill.
- **studio-research-numbers**: supplies baselines and benchmarks.
- **studio-prfaq** and **studio-prd**: "how you'll know" holds the result.
- **studio-sample-data**: makes the measure visible in the prototype.
- **Ready to pilot**: the measure and guardrails are part of what holds a pilot back or lets it go.
