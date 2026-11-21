---
name: studio-prfaq
description: Turns what a person said out loud (or typed) about their product into an Amazon-style PRFAQ baseline that states only what they said, links every line to their words and marks every gap as missing; then reviews a PRFAQ and asks the few clarifying questions that would make it ready. Use for "Generate PRFAQ" and "Ask Socra" on the PRFAQ.
origin: Working Backwards Studio
---

# PRFAQ from your own words

The person talks about their product for as long as they like, then presses **Generate PRFAQ**. This skill turns their words into a PRFAQ in the Amazon working-backwards format: a press release written as if the product has launched, followed by customer FAQs and internal FAQs. It is a **baseline** they then edit in place and improve with **Ask Socra**.

## What a PRFAQ is

A PRFAQ is how Amazon starts every new product: before anything is built, you write the **press release for the day it launches**, and the **questions customers and your own team will ask**, with their answers. You write it from the future, as if the product is already out and working, so you have to say plainly who it is for, what problem it ends for them, what changes in their day, and how you will know it worked.

**Why it is worth the effort:** it is the cheapest place to find out the idea isn't clear yet. Every later step (the PRD, the TRD, the prototype, the pilot) is built from it, so a vague PRFAQ becomes a vague product. A good one fits on a page or two, a customer would understand it, and your team could say no to things because of it.

**How you will work on it here:** walk through it one section at a time and the team checks each answer and asks follow-ups until it is clear, or just talk it through and generate a first draft. Either way, add any documents that could help (decks, business cases, research, notes, even rough ones), now or whenever you find more.

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

## Walkthrough

For people who have never written a PRFAQ (and anyone who asks), the PRFAQ is built one section at a time, in the format's order. First comes the materials step: ask whether they have **anything at all** that could help (decks, Word documents, business cases, research, emails, notes, even rough or old ones) and let them add it; they can add more at any time, and new material updates the PRFAQ. Then each section in turn: ask its question, check the answer against its bar, and either accept it or say in one or two plain sentences what is thin and ask **one** follow-up. At most two follow-ups per section; after that the section is kept as "needs work" and the walkthrough moves on (they can come back). The specialist a fixed rule picks for the section's subject does the checking, in its own name. Praise only what is actually there; never invent an answer for them.

| Key | Ask | Good enough when |
|---|---|---|
| headline | If this launched tomorrow, what would the headline say? Name it and the one thing customers get. | It names the product (or a working name) and one concrete customer benefit, in a single line, with no jargon. |
| subheading | Who exactly is it for, and what do they get from it? | It names a specific kind of customer (not "everyone" or "users") and one benefit they would notice. |
| summary | In a few sentences: what is launching, for whom, and why does it matter now? | It says what launches, for whom and why now, in words a customer would understand. |
| problem | What is hard, slow or costly for that customer today, without your product? | It names who has the problem, what they do today, and what it costs them (time, money, risk or frustration), ideally with an example. |
| solution | How does the product end that problem? What is different in their day after it launches? | It describes what the customer does differently and the result, and it answers the problem as stated. |
| why-us | Why would they pick this over what they use today, or over doing nothing? | It names at least one real difference from today's alternatives, not just "better" or "easier". |
| leader-quote | What would someone in your company say about why you built it? | It is in someone's voice and says why it matters to the business or its customers. |
| how-it-works | How does a customer get started, and what does the first use look like? | It walks through the first use in a few concrete steps a customer would recognise. |
| customer-quote | What would a happy customer say after using it? Use real words you have heard if you have them. | It sounds like a customer, names the benefit in their terms, and says whether it is real or imagined. |
| customer-faq | What will customers ask first (price, setup, trust, what it doesn't do)? Answer them. | It has at least two real customer questions with honest answers. |
| internal-faq | What will your own team ask: cost, data, risks, and how you'll measure success? | It answers at least how success will be measured and the biggest risk, with a number or a clear test where possible. |

## What it reads

- **Generate new**: everything the person has said for the PRFAQ (each talk, kept with the words as spoken), what they said in the conversation, and the documents they picked on the PRFAQ (Word, PowerPoint, PDF and the rest, read through their text versions). Each quote names which of these it came from, so every line links back to the talk, the message or the document.
- **Reformat** (any press after the first): the PRFAQ as it stands, edits included. It only puts the same content back into the format's order and shape: the same sentences, the same markers, nothing added, nothing reworded, nothing removed. A line the format has no place for goes under Other notes. Sections still empty get a Missing line. A Reformat never brings in anything new; Generate new does, and replaces the draft (the previous version is kept and can be brought back).

## How the PRFAQ is written down

- `# <headline>` then the subheading in italics, then the summary paragraph.
- `## <Section>` for each later section; quotes as `> ` lines; FAQs as `**Q:**` and `**A:**` lines.
- A Missing line is `> **Missing:** <the question>`.
- Markers sit at the end of the sentence they support.
