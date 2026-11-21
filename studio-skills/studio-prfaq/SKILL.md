---
name: studio-prfaq
description: Turns what a person said out loud (or typed) about their product into an Amazon-style PRFAQ baseline that states only what they said, links every line to their words and marks every gap as missing; then reviews a PRFAQ and asks the few clarifying questions that would make it ready. Use for "Generate PRFAQ" and "Ask Socra" on the PRFAQ.
origin: Working Backwards Studio
---

# PRFAQ from your own words

The person talks about their product for as long as they like, then presses **Generate PRFAQ**. This skill turns their words into a PRFAQ in the Amazon working-backwards format: a press release written as if the product has launched, followed by customer FAQs and internal FAQs. It is a **baseline** they then edit in place and improve with **Ask Socra**.

## When to Activate

- When someone presses Generate PRFAQ on the Product story page (the writer uses the format and rules below).
- When someone presses Ask Socra on the PRFAQ, or on one of its Missing lines (Socra opens this skill, sends a specialist and asks).
- When Socra rewrites a PRFAQ that carries source markers (`[^s3]`, `[^m:<id>]`) or Missing lines.

## Ground rules

1. **Only what they said.** Every statement must rest on a short verbatim quote from their words. Rephrase into press-release voice, but never add a fact, a number, a name, a customer, a date, a price or a promise they did not say. The writer leaves a line out rather than guess.
2. **Gaps are shown, not filled.** Every section of the format below that their words don't cover gets a Missing line that names what is missing as a short question to them (for example "Who is the first customer, and what are they doing today?"). The floor (what leading products of the category have) belongs in the PRD, not here; the PRFAQ is their story.
3. **Lineage.** Each statement ends with its marker: `[^s<n>]` for a quote from what the PRFAQ was generated from (a talk, a message or a document), `[^m:<message id>]` for a person's later answer in the conversation. Keep every marker when rewriting. A Missing line goes only when a person's words answer it, and the new line carries that answer's marker.
4. **Their words win.** Anything a person edited in place stands as written.
5. **Questions, not lectures.** Ask Socra reviews the PRFAQ as it stands and asks at most three questions, most important first, each with numbered options and one marked "(suggested)", aimed at the Missing lines and at statements a customer would not believe yet (vague benefit, no customer named, no measure of success).

## The format

The writer fills these sections in this order. The first column is the section's key; the third says what it holds and is what the Missing line asks for when nothing they said covers it.

| Key | Section | What it holds |
|---|---|---|
| headline | Headline | The product's name and the one thing the customer gets, in a single line |
| subheading | Subheading | Who it is for and the benefit they get, in one sentence |
| summary | Summary | The opening paragraph: what is launching, for whom, and why it matters now |
| problem | The problem | The customer's problem today, in their terms, and what it costs them |
| solution | The solution | How the product solves the problem, and what changes for the customer |
| why-us | Why us | What makes this different from what customers use today |
| leader-quote | Quote from the team | A quote from someone in the company on why they built it |
| how-it-works | How it works | How a customer gets started and what the first use looks like |
| customer-quote | Customer quote | A quote from a customer describing the benefit in their own words |
| customer-faq | Customer FAQs | Questions a customer would ask, with answers |
| internal-faq | Internal FAQs | Questions the business and engineering would ask (cost, data, risks, measures of success), with answers |
| other | Other notes | Lines from the earlier version that no section above holds (only on Reformat; never shown as Missing) |

Quotes in the leader-quote and customer-quote sections are only ever their words: if they said what a customer told them, that can stand; otherwise the section is Missing.

## What it reads

- **Generate new**: everything the person has said for the PRFAQ (each talk, kept with the words as spoken), what they said in the conversation, and the documents they picked on the PRFAQ (Word, PowerPoint, PDF and the rest, read through their text versions). Each quote names which of these it came from, so every line links back to the talk, the message or the document.
- **Reformat** (any press after the first): the PRFAQ as it stands, edits included. It only puts the same content back into the format's order and shape: the same sentences, the same markers, nothing added, nothing reworded, nothing removed. A line the format has no place for goes under Other notes. Sections still empty get a Missing line. A Reformat never brings in anything new; Generate new does, and replaces the draft (the previous version is kept and can be brought back).

## How the PRFAQ is written down

- `# <headline>` then the subheading in italics, then the summary paragraph.
- `## <Section>` for each later section; quotes as `> ` lines; FAQs as `**Q:**` and `**A:**` lines.
- A Missing line is `> **Missing:** <the question>`.
- Markers sit at the end of the sentence they support.
