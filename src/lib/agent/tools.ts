import path from "path";
import { markReadBySocra } from "@/lib/jev";
import { LINK_KINDS, LINK_LABEL, MAX_SUGGESTED_PER_STORY, maySuggest, wouldCycle } from "@/lib/studio/storymap";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/** The backlog items or Board cards a message is about, so it shows in each item's detail view and Traceability. */
const ABOUT = z.array(z.string()).max(10).default([]).describe('The backlog items or Board cards this is about: "backlog:<id>" or "move:<id>", or "prfaq" for the PRFAQ (the prompt names them as "Item: ..."). Always set it when you ask or answer about an item.');
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { formatHits, letta, logMemoryEvent, rememberAnswer, rememberCoverage, rememberDecision, rememberFinding, rememberLesson, searchMemory } from "@/lib/memory";
import { ROLES, roleFor, specialistRoleKey } from "@/lib/memory/lettaCore";
import { IMAGE_LIMIT, imagesConfigured, makeImage } from "@/lib/images";
import { SPEC_BASIS, SPEC_STATUSES, TRACE_TYPES, cleanTrace } from "@/lib/studio/spec";
import { SPEC_DEFS } from "@/lib/studio/specDefs";
import { ensureSpec } from "@/lib/studio/state";
import { currentCauses, currentItems, currentTurnId, nodesForIds, recordChange } from "@/lib/studio/truthlog";
import { teamCoverage } from "@/lib/studio/coverage";
import { COVERAGE_STATUSES } from "@/lib/studio/coverageCore";
import { VALIDATION_SIGNALS, colorFor, numberItems, overallReadiness, slugify, specialistByKey, validationScore, workingName, type Validation } from "@/lib/studio/core";

const ROLE_KEYS = ROLES.map((r) => r.key) as [string, ...string[]];
const ROLE_HELP = `${ROLE_KEYS.join(", ")}, or domain-<field> for a field's expert`;
const RoleParam = z.string().min(2).max(60).refine((k) => Boolean(roleFor(k)), "unknown role");
const SIGNAL_KEYS = VALIDATION_SIGNALS.map((s) => s.key) as [string, ...string[]];

function ok(text = "ok") {
  return { content: [{ type: "text" as const, text }] };
}

export type RunTally = { spoke: number };

const itemSchema = z.object({
  id: z.string().optional().describe("Keep the id (F12) of an existing item; leave empty for a new one"),
  text: z.string().min(2),
  state: z.enum(["confirmed", "assumed", "out"]).default("assumed"),
});

// What Socra and its team can do in the Studio. Everything the owner sees comes through here.
export function studioTools(useCaseId: string, slug: string, tally: RunTally, opts: { speaker?: string } = {}) {
  const speaker = opts.speaker ?? "Socra";
  const uc = () => prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  // The backlog items and cards a message is about ("backlog:<id>", "move:<id>" or a bare id). When none is
  // named and the turn answers exactly one item (a backlog item and the card made from it count as one),
  // the message is about that item, so questions always reach the item's detail view.
  const aboutNodes = async (about: string[]) => {
    const named = await nodesForIds(useCaseId, about.map((a) => a.replace(/^(backlog|move):/, "")));
    const items = [...named.filter((n) => /^(backlog|move):/.test(n)), ...(about.includes("prfaq") ? ["prfaq"] : [])];
    if (items.length) return [...new Set(items)];
    const turn = currentItems(useCaseId);
    return turn.length && turn.filter((n) => n.startsWith("backlog:")).length <= 1 && turn.filter((n) => n.startsWith("move:")).length <= 1 ? turn : [];
  };
  // A turn that answers a reply (Reply on a statement) threads its messages under that reply, so the
  // acknowledgement and follow-up show with it (Doug, Nov 21). Only when the turn answers exactly one reply.
  const replyThread = async () => {
    const ids = currentCauses(useCaseId).filter((c) => c.startsWith("msg:")).map((c) => c.slice(4));
    if (!ids.length) return "";
    const replies = await prisma.message.findMany({ where: { useCaseId, id: { in: ids }, role: "user", NOT: { replyTo: "" } }, select: { id: true } });
    return replies.length === 1 ? replies[0].id : "";
  };
  const capKey = async (c: string) => {
    if (!c) return "";
    const caps = await prisma.capability.findMany({ where: { useCaseId } });
    const hit = caps.find((x) => x.key === c || x.label.toLowerCase() === c.toLowerCase() || x.key === slugify(c));
    return hit?.key ?? "";
  };
  const capLabel = async (c: string) => {
    const key = await capKey(c);
    if (!key) return c;
    return (await prisma.capability.findUnique({ where: { useCaseId_key: { useCaseId, key } } }))?.label ?? c;
  };

  let imagesMade = 0;
  return createSdkMcpServer({
    name: "studio",
    version: "2.0.0",
    tools: [
      tool(
        "get_state",
        "Read the product truth as it stands: product, PRFAQ, capabilities with floor items and readiness, decisions, backlog, recommendations, evidence, validation, build moves, routes and the last messages.",
        {},
        async () => {
          const s = await prisma.useCase.findUniqueOrThrow({
            where: { id: useCaseId },
            include: {
              capabilities: { orderBy: { position: "asc" } },
              decisions: { orderBy: { createdAt: "asc" } },
              backlog: { orderBy: { createdAt: "asc" } },
              evidence: true,
              moves: { orderBy: { position: "asc" } },
              routes: { orderBy: { position: "asc" } },
              messages: { orderBy: { createdAt: "desc" }, take: 12 },
              spec: { orderBy: [{ tab: "asc" }, { position: "asc" }] },
              members: { orderBy: { createdAt: "asc" } },
              storyLinks: { orderBy: { createdAt: "asc" } },
            },
          });
          const out = {
            product: { name: s.name, statement: s.statement, category: s.category, audience: s.audience, stage: s.stageLabel, customerQuote: s.customerQuote, validatedUseCase: s.validatedUseCase, focus: s.focus, session: s.session },
            prfaq: s.prfaq,
            readiness: overallReadiness(s.capabilities),
            validation: s.validation,
            validationScore: validationScore(s.validation as Validation),
            capabilities: s.capabilities.map((c) => ({ key: c.key, label: c.label, kicker: c.kicker, readiness: c.readiness, signal: c.signal, description: c.description, items: c.items })),
            decisions: s.decisions.map((d) => ({ id: d.id, status: d.status, text: d.text, capability: d.capability, words: d.words, answer: d.answer })),
            backlog: s.backlog.map((b) => ({ id: b.id, title: b.title, note: b.note, kind: b.kind, group: b.group, source: b.source, recKind: b.recKind, state: b.state, probe: b.probe, includeInBuild: b.includeInBuild })),
            evidence: s.evidence.map((e) => ({ source: e.source, type: e.type, insight: e.insight, confidence: e.confidence })),
            moves: s.moves.map((m) => ({ id: m.id, title: m.title, capability: m.capability, status: m.status, owner: m.owner, decision: m.decision })),
            // The Story map: ends are "move:<id>" or "backlog:<id>". Dismissed links are listed so you never offer them again.
            storyLinks: s.storyLinks.map((l) => ({ from: l.from, to: l.to, kind: l.kind, status: l.status, why: l.why })),
            routes: s.routes.map((r) => ({ agent: r.agent, state: r.state, detail: r.detail })),
            components: s.components,
            techNotes: s.techNotes,
            lastMessages: s.messages.reverse().map((m) => `${m.role === "user" ? (m.author ? `${m.author} (${m.authorRole || "Product owner"})` : "Owner") + (m.addressed ? ` to the ${m.addressed} specialist` : "") : m.agent || m.role}: ${m.content}`),
            people: s.members.map((p) => `${p.name} (${p.role})`),
            spec: s.spec.map((x) => ({ key: x.key, ref: x.ref, tab: x.tab, title: x.title, basis: x.basis, status: x.status, completeness: x.completeness, review: x.review, reviewNote: x.reviewNote, content: x.content.slice(0, 600) })),
            build: { versions: s.generateCount, packageIterations: s.packageCount, building: s.generateBusy },
            // Each specialist's question areas (from its skill) and what the people have answered so far.
            coverage: (await teamCoverage(useCaseId)).map((c) => ({ specialist: c.key, skill: c.skill, answered: `${c.done} of ${c.total}`, areas: c.areas.map((a) => ({ area: a.key, label: a.label, status: a.status, enough: a.enough, note: a.note })) })),
          };
          return ok(JSON.stringify(out, null, 1));
        },
      ),
      tool(
        "say",
        "Show a message to the owner in the conversation, in Socra's voice. The only way the owner sees anything you write. Plain product language, one or two questions at most, never jargon (no epics, stories or agent names unless they ask).",
        { text: z.string().min(1), capability: z.string().default("").describe("The capability this is about (key or label), if any"), about: ABOUT },
        async ({ text, capability, about }) => {
          tally.spoke++;
          await prisma.message.create({ data: { useCaseId, role: "muse", agent: speaker === "Socra" ? "Socra · Product physician" : speaker, content: text, accent: await capKey(capability), about: await aboutNodes(about), turnId: currentTurnId(useCaseId), replyTo: await replyThread() } });
          return ok();
        },
      ),
      tool(
        "signal",
        "Show a quiet signal card in the conversation (for example \"Decision captured\", \"Added to product truth\", \"Parked for later\") with one plain sentence. Use it when the product truth changed in a way the owner should notice.",
        { label: z.string().min(2).max(60), text: z.string().min(2), capability: z.string().default(""), about: ABOUT },
        async ({ label, text, capability, about }) => {
          await prisma.message.create({ data: { useCaseId, role: "signal", agent: label, content: text, accent: await capKey(capability), about: await aboutNodes(about), turnId: currentTurnId(useCaseId) } });
          return ok();
        },
      ),
      tool(
        "share_finding",
        "A specialist speaks in the conversation, visibly, in their own name: what they found or recommend, in two to four plain sentences, then one or two questions from its own skill's open areas, each with numbered options and one marked \"(suggested)\". Use it when a specialist finishes (Socra may share for a research specialist), or to answer someone who replied to a specialist. specialist: business-analyst, architect, engineer, ux or domain; for domain give the field's name in 'title' (for example \"Claims expert\").",
        {
          specialist: z.enum(["business-analyst", "architect", "engineer", "ux", "domain"]),
          title: z.string().max(60).default(""),
          text: z.string().min(2),
          capability: z.string().default(""),
          about: ABOUT,
        },
        async ({ specialist, title, text, capability, about }) => {
          const s = specialistByKey(specialist)!;
          const name = specialist === "domain" && title.trim() ? title.trim() : s.name;
          const roleKey = specialistRoleKey(specialist, title);
          rememberFinding(await uc(), roleKey, name, text);
          await prisma.message.create({ data: { useCaseId, role: "agent", agent: `${name} · Specialist`, addressed: specialist, content: text, accent: await capKey(capability), about: await aboutNodes(about), turnId: currentTurnId(useCaseId), replyTo: await replyThread() } });
          return ok();
        },
      ),
      tool(
        "record_coverage",
        `A specialist records how far one of its question areas is answered, from what the people on the product actually said (never from a guess). Areas are the ones under "Question areas" in the specialist's own skill; the domain expert records its own field's areas here first (status open, with what "enough" means and the source in the note). status: ${COVERAGE_STATUSES.join(", ")} (assumed = they said enough or don't know, and the note holds the suggested default). note: what settled it, quoting their words. When every area of a specialist is covered or assumed, it stops asking.`,
        {
          specialist: z.enum(["business-analyst", "architect", "engineer", "ux", "domain"]),
          area: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
          label: z.string().max(80).default(""),
          status: z.enum(COVERAGE_STATUSES as [string, ...string[]]),
          note: z.string().max(1200).default(""),
        },
        async ({ specialist, area, label, status, note }) => {
          const before = await prisma.coverage.findUnique({ where: { useCaseId_specialist_area: { useCaseId, specialist, area } } });
          const evidence = [...new Set([...(before?.evidence ?? []), ...currentCauses(useCaseId).filter((c) => /^(msg|decision|backlog|move):/.test(c))])].slice(-20);
          await prisma.coverage.upsert({
            where: { useCaseId_specialist_area: { useCaseId, specialist, area } },
            update: { status, note: note || before?.note || "", ...(label ? { label } : {}), evidence },
            create: { useCaseId, specialist, area, label, status, note, evidence },
          });
          const s = specialistByKey(specialist)!;
          if (before?.status !== status && (status === "covered" || status === "assumed")) {
            const lastDomain = specialist === "domain" ? await prisma.message.findFirst({ where: { useCaseId, addressed: "domain" }, orderBy: { createdAt: "desc" }, select: { agent: true } }) : null;
            const title = lastDomain?.agent?.split(" · ")[0] ?? "";
            rememberCoverage(await uc(), specialistRoleKey(specialist, title), title || s.name, label || before?.label || area, status, note);
          }
          if (before?.status !== status) await recordChange(useCaseId, { node: `coverage:${specialist}:${area}`, kind: before ? "changed" : "added", summary: `${s.name}: ${label || before?.label || area} is ${status}${note ? ` (${note.slice(0, 200)})` : ""}`, before: before?.status ?? "", after: status, by: s.name, fromTurn: true });
          const left = (await teamCoverage(useCaseId)).find((c) => c.key === specialist);
          return ok(left ? `${left.done} of ${left.total} of the ${s.name.toLowerCase()}'s areas answered${left.complete ? ": all answered, stop asking unless something changes them." : "."}` : "ok");
        },
      ),
      tool(
        "set_product",
        "Set the product in one breath: its name, statement (one sentence promise), category (the kind of product and industry, e.g. \"insurance claims processing\" or \"B2B SaaS analytics\"), audience, stage label, the customer quote from the PRFAQ, and the validated use case in one sentence. Leave a field empty to keep it.",
        {
          name: z.string().default(""),
          statement: z.string().default(""),
          category: z.string().default(""),
          audience: z.string().default(""),
          stageLabel: z.string().default(""),
          customerQuote: z.string().default(""),
          validatedUseCase: z.string().default(""),
          owner_asked: z.boolean().default(false).describe("True only when a person asked for this name in their own words (for example a reply 'call it X'): then it replaces the name they chose before."),
        },
        async ({ owner_asked, ...a }) => {
          const data = Object.fromEntries(Object.entries(a).filter(([, v]) => v.trim())) as Prisma.UseCaseUpdateInput;
          // The name is yours to give only while it is a working name from the first words. A name the owner typed
          // (or one already chosen) is theirs: it changes only when they rename it.
          let kept = "";
          if (data.name && !owner_asked) {
            const uc = await prisma.useCase.findUnique({ where: { id: useCaseId }, select: { name: true, description: true } });
            if (uc && uc.name !== workingName(uc.description)) { delete data.name; kept = ` The product's name stays "${uc.name}": the owner chose it.`; }
          }
          await prisma.useCase.update({ where: { id: useCaseId }, data });
          return ok(kept.trim() || undefined);
        },
      ),
      tool(
        "update_prfaq",
        "Replace the living PRFAQ (Markdown), in the Amazon format the studio-prfaq skill sets out (its sections in order, '# <headline>', the subheading in italics, '## <Section>', quotes as '> ' lines, FAQs as **Q:**/**A:** lines). Keep the owner's own words where they said them. It is the product's dream of the future, written as if launched. If it carries source markers ([^s3], [^m:<id>]) or '> **Missing:**' lines, keep every marker on its line; a Missing line goes only when a person's words answer it, and the new line ends with [^m:<that message id>].",
        { markdown: z.string().min(40) },
        async ({ markdown }) => {
          const before = (await uc()).prfaq;
          await prisma.useCase.update({ where: { id: useCaseId }, data: { prfaq: markdown, prfaqUpdatedAt: new Date() } });
          await recordChange(useCaseId, { node: "prfaq", kind: "changed", summary: `${speaker} updated the PRFAQ`, before, after: markdown, by: speaker, fromTurn: true });
          return ok("PRFAQ updated.");
        },
      ),
      tool(
        "set_spec_section",
        `Write or update one section of the living specification (PRD or TRD). The owner never fills a form: you fill the sections from what they said, the evidence and the annotations, and expose the inference trail. Sections (key: title): ${SPEC_DEFS.map((d) => `${d.key}: ${d.title}`).join("; ")}. basis says how we know it: confirmed (the owner said or approved it), recommended (you or the team recommend it; the owner hasn't decided), inferred (deduced from what they said or the evidence), open (only the owner can decide; say the options), not-researched. status is the section's review state: ${SPEC_STATUSES.map((x) => x.key).join(", ")} (only move it to owner-approved when the owner approved it; engineer-reviewed after the Product Engineer checked it). completeness 0-100 is your honest read. trace adds provenance steps (type one of ${TRACE_TYPES.join(", ")}) such as the owner's words, an evidence card, an annotation, a backlog item, a build card. related lists ids of decisions, backlog items, build moves or evidence it rests on. One answer can update several sections: call this for each.`,
        {
          key: z.enum(SPEC_DEFS.map((d) => d.key) as [string, ...string[]]),
          content: z.string().default("").describe("The section's text (Markdown); empty keeps it"),
          completeness: z.number().int().min(0).max(100).optional(),
          confidence: z.enum(["high", "medium", "open"]).optional(),
          basis: z.enum(SPEC_BASIS.map((b) => b.key) as [string, ...string[]]).optional(),
          status: z.enum(SPEC_STATUSES.map((b) => b.key) as [string, ...string[]]).optional(),
          source: z.string().default("").describe("Where this update came from, in a few words (e.g. 'Owner's answer, session 3')"),
          capability: z.string().default(""),
          related: z.array(z.string()).default([]),
          trace: z.array(z.object({ label: z.string(), detail: z.string(), type: z.enum(TRACE_TYPES as [string, ...string[]]) })).default([]),
        },
        async (a) => {
          await ensureSpec(useCaseId);
          const cur = await prisma.specSection.findUniqueOrThrow({ where: { useCaseId_key: { useCaseId, key: a.key } } });
          const trace = cleanTrace([...(Array.isArray(cur.trace) ? cur.trace : []), ...a.trace]).slice(-12);
          const changedText = !!a.content.trim() && a.content.trim() !== cur.content.trim();
          if (changedText || (a.basis && a.basis !== cur.basis) || (a.status && a.status !== cur.status))
            await recordChange(useCaseId, {
              node: `spec:${a.key}`,
              kind: cur.content.trim() ? "changed" : "added",
              summary: `${speaker} ${cur.content.trim() ? "updated" : "wrote"} ${cur.ref} ${cur.title}${a.source ? ` (${a.source})` : ""}${a.basis && a.basis !== cur.basis ? `; now ${a.basis}` : ""}`,
              before: changedText ? cur.content : `${cur.basis} · ${cur.status}`,
              after: changedText ? a.content : `${a.basis ?? cur.basis} · ${a.status ?? cur.status}`,
              causes: await nodesForIds(useCaseId, a.related),
              by: speaker,
              fromTurn: true,
            });
          await prisma.specSection.update({
            where: { id: cur.id },
            data: {
              ...(a.content.trim() ? { content: a.content } : {}),
              ...(a.completeness !== undefined ? { completeness: a.completeness } : {}),
              ...(a.confidence ? { confidence: a.confidence } : {}),
              ...(a.basis ? { basis: a.basis } : {}),
              ...(a.status ? { status: a.status } : {}),
              ...(a.capability ? { capability: await capLabel(a.capability) } : {}),
              related: [...new Set([...cur.related, ...a.related])].slice(-30),
              source: a.source || cur.source,
              trace,
              updatedBy: speaker,
              // A section the owner challenged or asked to revise is answered by this update.
              ...(cur.review === "revise" || cur.review === "challenge" ? { review: "", reviewNote: "" } : {}),
            },
          });
          return ok(`${cur.ref} ${cur.title} updated.`);
        },
      ),
      tool(
        "set_capability",
        "Create or update one capability area of the product (its floor). The floor is everything a leading product of this kind has in this area: list its items, each [confirmed] (the owner said it), [assumed] (you added it because leading products have it; the owner can change it) or [out] (the owner explicitly said no). Keep item ids; an item leaves only with the owner's explicit no (state out). Readiness 0-100 is your honest read of how close this capability is to its ceiling (pilot-ready at about 65); 'signal' is one sentence the owner sees about what would move it; 'delta' a short note like '+8 this session'.",
        {
          key: z.string().default("").describe("Existing key to update; empty to create from the label"),
          label: z.string().min(2),
          kicker: z.string().default(""),
          description: z.string().default(""),
          readiness: z.number().int().min(0).max(100).optional(),
          signal: z.string().default(""),
          delta: z.string().default(""),
          items: z.array(itemSchema).optional(),
        },
        async (a) => {
          const u = await uc();
          const key = (await capKey(a.key || a.label)) || slugify(a.label);
          const existing = await prisma.capability.findUnique({ where: { useCaseId_key: { useCaseId, key } } });
          let seq = u.floorSeq;
          let items = (existing?.items ?? []) as { id: string; text: string; state: string }[];
          if (a.items) {
            // Silence never removes: items the call left out stay as they were.
            const numbered = numberItems(a.items, seq);
            seq = numbered.seq;
            const byId = new Map(items.map((i) => [i.id, i]));
            for (const it of numbered.items) byId.set(it.id, it);
            items = [...byId.values()];
          }
          const count = await prisma.capability.count({ where: { useCaseId } });
          const data = {
            label: a.label,
            ...(a.kicker ? { kicker: a.kicker } : {}),
            ...(a.description ? { description: a.description } : {}),
            ...(a.signal ? { signal: a.signal } : {}),
            ...(a.delta ? { delta: a.delta } : {}),
            ...(a.readiness !== undefined ? { readiness: a.readiness } : {}),
            items,
          };
          if (existing) await prisma.capability.update({ where: { id: existing.id }, data });
          else await prisma.capability.create({ data: { useCaseId, key, position: count, color: colorFor(count), readiness: a.readiness ?? 10, ...data } });
          const was = ((existing?.items ?? []) as { id: string; state: string }[]).map((i) => `${i.id}:${i.state}`).join(",");
          const now = items.map((i) => `${i.id}:${i.state}`).join(",");
          if (!existing || was !== now || (a.readiness !== undefined && a.readiness !== existing.readiness))
            await recordChange(useCaseId, { node: `cap:${key}`, kind: existing ? "changed" : "added", summary: `${speaker} ${existing ? "updated" : "laid out"} ${a.label}: ${items.filter((i) => i.state === "confirmed").length} confirmed, ${items.filter((i) => i.state === "assumed").length} inferred from leading products, ${items.filter((i) => i.state === "out").length} ruled out`, by: speaker, fromTurn: true });
          await prisma.useCase.update({ where: { id: useCaseId }, data: { floorSeq: seq, ...(u.focus ? {} : { focus: key }) } });
          return ok(`Capability "${a.label}" saved as ${key} with ${items.length} floor items.`);
        },
      ),
      tool(
        "focus",
        "Move the lens: the capability the conversation is now holding. The Whole product and Work with Socra views follow it.",
        { capability: z.string().min(1) },
        async ({ capability }) => {
          const key = await capKey(capability);
          if (!key) return ok("No such capability.");
          await prisma.useCase.update({ where: { id: useCaseId }, data: { focus: key } });
          return ok();
        },
      ),
      tool(
        "record_decision",
        "Record a decision in the human-in-the-loop register. status 'approved' when the owner agreed (a yes is an approval: never ask 'do you want to approve this?'), 'assumed' when you assumed it for them (they can correct it), 'open' when only the owner can decide it (options: two to four choices, the first being your suggestion; write its text as the question they answer, ending in '?', and don't also ask the same thing in words). Keep their original words in 'words'. An approved decision goes into the next build. When it changes an earlier decision or assumption (a new answer, a correction), name the earlier ones' ids in 'replaces': they are closed as replaced, so nothing left contradicts it.",
        {
          text: z.string().min(3),
          status: z.enum(["approved", "assumed", "open"]),
          capability: z.string().default(""),
          words: z.string().default(""),
          options: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
          replaces: z.array(z.string()).default([]),
        },
        async (a) => {
          const u = await uc();
          const d = await prisma.decision.create({
            data: { useCaseId, text: a.text, status: a.status, capability: await capLabel(a.capability), words: a.words, options: a.options, agent: speaker, session: u.session, includeInBuild: a.status !== "open" },
          });
          if (a.status === "approved") rememberDecision(u, "muse", `${a.text}${a.words ? `\nThe owner said: "${a.words}"` : ""}`, "studio:decision");
          await recordChange(useCaseId, { node: `decision:${d.id}`, kind: a.status === "approved" ? "approved" : "added", summary: a.status === "open" ? `${speaker} raised a checkpoint only a person can decide: ${a.text}` : a.status === "assumed" ? `${speaker} assumed: ${a.text} (they can correct it)` : `Recorded as approved: ${a.text}`, after: a.text, by: speaker, fromTurn: true });
          // An answer that changes an earlier decision closes it, so the spec and the build never see both.
          const old = a.replaces.length ? await prisma.decision.findMany({ where: { useCaseId, id: { in: a.replaces }, NOT: { id: d.id } } }) : [];
          for (const o of old) {
            await prisma.decision.update({ where: { id: o.id }, data: { status: "rejected", includeInBuild: false, resolvedAt: new Date(), answer: `Replaced by: ${a.text}`.slice(0, 4000) } });
            await recordChange(useCaseId, { node: `decision:${o.id}`, kind: "changed", summary: `Replaced by a newer decision: ${a.text}`, before: `${o.text} (${o.status})`, after: "replaced", causes: [`decision:${d.id}`], by: speaker, fromTurn: true });
          }
          return ok(`Recorded ${d.id}.${old.length ? ` Replaced ${old.length} earlier decision${old.length === 1 ? "" : "s"}.` : ""}`);
        },
      ),
      tool(
        "move_card",
        "Move a card on the Board, so nobody has to. 'ready' (Ready to shape) is the first column, where new cards are shaped: to 'queued' (Backlog) when it is shaped but held for later, to 'building' once its acceptance criteria are agreed and it should be built, back to 'ready' when a mark on the prototype or a person's no reopens it, to 'done' when a person said yes to it on the live preview. Builds move cards into and out of 'building' themselves. 'why' is one plain line the owner sees on the card (\"you approved it on version 4\").",
        { id: z.string(), status: z.enum(["queued", "ready", "building", "review", "done"]), why: z.string().min(5).max(300), causes: z.array(z.string()).default([]) },
        async ({ id, status, why, causes }) => {
          const { moveCard } = await import("@/lib/studio/board");
          const m = await moveCard(useCaseId, id, status, speaker === "Socra" ? "Socra" : speaker, why, [...(await nodesForIds(useCaseId, causes)), ...currentCauses(useCaseId)]);
          return ok(m ? `Moved to ${status}.` : "No such card.");
        },
      ),
      tool(
        "propose_agent",
        "Propose an agent this product needs, for the shared agent service (only where an agent truly helps: workflows, messages, alerts, recommendations, insights; fixed rules stay plain code). It becomes an open checkpoint with Approve and Reject; once approved the Studio registers it and the app calls it. Every agent has a Letta persona by default (persona.enabled true, with persona text: who it is, its voice, how it treats people); set it false only when a person explicitly said no to a persona for it. Tools are actions the app takes for it; set approval true for anything about money, safety, legal, sending to a customer or hard to undo. approvals.output true when a person must check its answer before it is used (anything a customer sees).",
        {
          key: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/),
          name: z.string().min(2).max(80),
          purpose: z.string().min(5),
          instructions: z.string().min(10),
          persona: z.object({ enabled: z.boolean().default(true), text: z.string().default("") }).default({ enabled: true, text: "" }),
          provider: z.enum(["anthropic", "openai", "gemini"]).default("anthropic"),
          model: z.string().default(""),
          tools: z
            .array(
              z.object({
                name: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
                description: z.string().min(5),
                parameters: z.record(z.string(), z.object({ type: z.enum(["string", "number", "boolean"]), description: z.string().default(""), optional: z.boolean().default(false) })).default({}),
                approval: z.boolean().default(false),
              }),
            )
            .default([]),
          approvals: z.object({ output: z.boolean().default(false), timeoutMinutes: z.number().int().min(1).default(1440), onTimeout: z.enum(["reject", "approve"]).default("reject") }).default({ output: false, timeoutMinutes: 1440, onTimeout: "reject" }),
          facts: z.boolean().default(true),
          why: z.string().min(5).describe("What in the product truth this agent traces to (a PRFAQ line, a capability, a decision or the owner's words)."),
        },
        async (a) => {
          const u = await uc();
          const personaText = a.persona.enabled ? a.persona.text.trim() || `You are ${a.name}. ${a.purpose}` : "";
          const existing = await prisma.appAgent.findUnique({ where: { useCaseId_key: { useCaseId, key: a.key } } });
          const tools = a.tools.map((t) => `${t.description}${t.approval ? " (waits for a person's approval)" : ""}`);
          const d = await prisma.decision.create({
            data: {
              useCaseId,
              text: `Add the ${a.name} agent: ${a.purpose.replace(/\.$/, "")}. ${a.persona.enabled ? "It has its own persona (Letta) and remembers each person." : "No persona: a plain task agent."}${tools.length ? ` It can: ${tools.join("; ")}.` : ""}${a.approvals.output ? " A person checks its answers before they are used." : ""}`,
              status: "open",
              capability: "",
              words: a.why,
              options: [
                { label: "Add it as described (suggested)", value: "approve" },
                { label: "Not now", value: "reject" },
              ],
              agent: speaker,
              session: u.session,
              includeInBuild: false,
            },
          });
          const data = {
            name: a.name, purpose: a.purpose, instructions: a.instructions, persona: a.persona.enabled, personaText, provider: a.provider, model: a.model,
            tools: a.tools, approvals: a.approvals, facts: a.facts, why: a.why, decisionId: d.id,
            ...(existing?.status === "approved" ? {} : { status: "proposed" }),
          };
          await prisma.appAgent.upsert({ where: { useCaseId_key: { useCaseId, key: a.key } }, create: { useCaseId, key: a.key, ...data }, update: data });
          await recordChange(useCaseId, { node: `decision:${d.id}`, kind: "added", summary: `${speaker} proposed the ${a.name} agent`, after: a.purpose, by: speaker, fromTurn: true });
          return ok(`Proposed as checkpoint ${d.id}. When a person approves it, the Studio registers the agent and the next build calls it.`);
        },
      ),
      tool(
        "resolve_decision",
        "Settle an open or assumed decision once the owner answered: approved with their answer, or changed text. An approved or closed decision is never rewritten: when the owner changes or corrects it, record the new one with record_decision and name this one in replaces, so the history shows both.",
        { id: z.string(), status: z.enum(["approved", "assumed", "open"]).default("approved"), answer: z.string().default(""), text: z.string().default("") },
        async ({ id, status, answer, text }) => {
          const d = await prisma.decision.findFirst({ where: { id, useCaseId } });
          if (!d) return ok("No such decision.");
          // A settled decision keeps its words: a correction replaces it, so "Why did this change?" shows both.
          if (d.status !== "open" && d.status !== "assumed") return ok(`That decision is already ${d.status}. Record the new answer with record_decision and replaces: ["${d.id}"].`);
          await prisma.decision.update({ where: { id }, data: { status, answer: answer || d.answer, text: text || d.text, includeInBuild: status !== "open", resolvedAt: new Date() } });
          await recordChange(useCaseId, { node: `decision:${id}`, kind: status === "approved" ? "approved" : "changed", summary: `${status === "approved" ? "Settled" : "Updated"}: ${text || d.text}${answer ? ` (answer: ${answer})` : ""}`, before: `${d.text} (${d.status})`, after: `${text || d.text} (${status})`, by: speaker, fromTurn: true });
          if (answer) rememberAnswer(await uc(), "muse", d.text, answer);
          return ok();
        },
      ),
      tool(
        "recommend",
        "Put a recommendation in the backlog: something the owner may not know to consider. kind 'consider' (a capability or best practice), 'workflow' (an agentic workflow candidate: only for workflows, messages, alerts, recommendations or insights; fixed rules stay plain code), or 'hitl' (a decision a person must keep). 'prompt' is the probing question Socra asks when the owner pulls it forward. It never becomes a requirement silently.",
        { title: z.string().min(3), reason: z.string().min(3), prompt: z.string().min(5), capability: z.string().default(""), kind: z.enum(["consider", "workflow", "hitl"]) },
        async (a) => {
          const group = (await capLabel(a.capability)) || "Unsorted signal";
          const dup = await prisma.backlogItem.findFirst({ where: { useCaseId, title: a.title } });
          if (dup) return ok(`Already in the backlog as ${dup.id}.`);
          const b = await prisma.backlogItem.create({
            data: { useCaseId, title: a.title, note: a.reason, kind: "epic", group, source: "Socra recommendation", recKind: a.kind, probe: a.prompt, state: "suggested", hidden: a.kind === "workflow" ? "workflow" : "capability" },
          });
          await recordChange(useCaseId, { node: `backlog:${b.id}`, kind: "added", summary: `${speaker} recommended: ${a.title}`, after: a.reason, by: speaker, fromTurn: true });
          return ok(`Recommended ${b.id}.`);
        },
      ),
      tool(
        "add_backlog",
        "Hold a thought in the backlog in the owner's own words (a capture), or a capability signal (kind epic).",
        { title: z.string().min(2), note: z.string().default(""), kind: z.enum(["capture", "epic", "distraction"]).default("capture"), capability: z.string().default(""), source: z.string().default("Working session") },
        async (a) => {
          const b = await prisma.backlogItem.create({ data: { useCaseId, title: a.title, note: a.note, kind: a.kind, group: (await capLabel(a.capability)) || "Unsorted signal", source: a.source } });
          await recordChange(useCaseId, { node: `backlog:${b.id}`, kind: "added", summary: `${speaker} held a thought: ${a.title}`, by: speaker, fromTurn: true });
          return ok(`Held as ${b.id}.`);
        },
      ),
      tool(
        "curate",
        "Curate a backlog item: group it under a capability (kind epic: it belongs to a capability), keep it as a new thought, or park it as a distraction ('Not wrong, just not this week'). Set 'hidden' to how it would be classified underneath (capability, epic, story, task, workflow); the owner never has to see that. state: held | probing | ready (the meaning is clear and it can be built) | built. includeInBuild puts it in the next build.",
        {
          id: z.string(),
          kind: z.enum(["capture", "epic", "distraction"]).optional(),
          capability: z.string().default(""),
          note: z.string().default(""),
          hidden: z.enum(["", "capability", "epic", "story", "task", "workflow"]).default(""),
          state: z.enum(["", "held", "probing", "ready", "built"]).default(""),
          includeInBuild: z.boolean().optional(),
          mergeInto: z.string().default("").describe("Another item's id: this one belongs together with it"),
        },
        async (a) => {
          const b = await prisma.backlogItem.findFirst({ where: { id: a.id, useCaseId } });
          if (!b) return ok("No such item.");
          const group = a.kind === "distraction" ? "Parked by Socra" : (await capLabel(a.capability)) || b.group;
          await prisma.backlogItem.update({
            where: { id: b.id },
            data: {
              ...(a.kind ? { kind: a.kind } : {}),
              group,
              ...(a.note ? { note: a.note } : {}),
              ...(a.hidden ? { hidden: a.hidden } : {}),
              ...(a.state ? { state: a.state } : {}),
              ...(a.includeInBuild !== undefined ? { includeInBuild: a.includeInBuild } : a.state === "ready" ? { includeInBuild: true } : {}),
              ...(a.mergeInto ? { note: `${a.note || b.note} · belongs with ${a.mergeInto}` } : {}),
            },
          });
          if ((a.kind && a.kind !== b.kind) || (a.state && a.state !== b.state) || a.mergeInto)
            await recordChange(useCaseId, {
              node: `backlog:${b.id}`,
              kind: a.kind === "distraction" ? "rejected" : "changed",
              summary: a.kind === "distraction" ? `Parked as not this week: ${b.title}` : a.mergeInto ? `Belongs together with another item: ${b.title}` : `${b.title} is now ${a.state || a.kind}${group !== b.group ? ` under ${group}` : ""}`,
              causes: a.mergeInto ? [`backlog:${a.mergeInto}`] : [],
              by: speaker,
              fromTurn: true,
            });
          return ok();
        },
      ),
      tool(
        "interpret_annotation",
        "Interpret a mark the owner made on the live prototype (a click, a circled region or the whole screen, with what they said). Keep their words as the observation and write the chain: the behaviour they want in plain words, two to four acceptance criteria (testable, Given/When/Then or plain), the component change (shadcn/ui names where it applies), the PRD section keys it changes and the TRD section keys it creates a technical consequence in, and one question if the meaning is unclear. Then update those sections with set_spec_section (an annotation trace step quoting their words).",
        {
          id: z.string().describe("The annotation id"),
          behaviour: z.string().min(5).describe("What should happen or feel different, in the owner's plain language"),
          acceptance: z.array(z.string().min(5)).min(1).max(6),
          component: z.string().default(""),
          prd: z.array(z.enum(SPEC_DEFS.filter((d) => d.tab === "prd").map((d) => d.key) as [string, ...string[]])).default([]),
          trd: z.array(z.enum(SPEC_DEFS.filter((d) => d.tab === "trd").map((d) => d.key) as [string, ...string[]])).default([]),
          question: z.string().default(""),
          kind: z.enum(["new_requirement", "change_request", "bug_report", "none"]).optional().describe("What the mark asks for: something new, a change to what exists, a fix, or nothing (a comment)"),
        },
        async (a) => {
          const f = await prisma.feedback.findFirst({ where: { id: a.id, useCaseId } });
          if (!f) return ok("No such annotation.");
          if (a.kind) await markReadBySocra(f.id, a.kind === "none" ? "asks_nothing" : a.kind);
          const interpretation = { observation: f.comment, behaviour: a.behaviour, acceptance: a.acceptance, component: a.component, prd: a.prd, trd: a.trd, question: a.question };
          await prisma.feedback.update({ where: { id: f.id }, data: { interpretation } });
          await recordChange(useCaseId, {
            node: `ann:${f.id}`,
            kind: "interpreted",
            summary: `${speaker} read the mark on ${f.target || "the product"}: ${a.behaviour}`,
            after: [`Acceptance: ${a.acceptance.join(" | ")}`, a.component ? `Component: ${a.component}` : "", a.prd.length || a.trd.length ? `Changes: ${[...a.prd, ...a.trd].join(", ")}` : ""].filter(Boolean).join("\n"),
            by: speaker,
          });
          return ok(`Interpreted. Now update ${[...a.prd, ...a.trd].join(", ") || "the sections it touches"} with set_spec_section (related: ["${f.id}"]).`);
        },
      ),
      tool(
        "add_evidence",
        "Add evidence to the library: what a conversation, interview, research finding or upload says, with its source, type, confidence (high, medium, open) and trace (what claim it supports).",
        { source: z.string().min(2), type: z.enum(["interview", "research", "uploaded", "conversation"]), insight: z.string().min(5), confidence: z.enum(["high", "medium", "open"]).default("medium"), trace: z.string().default("") },
        async (a) => {
          const e = await prisma.evidence.create({ data: { useCaseId, ...a } });
          await recordChange(useCaseId, { node: `evidence:${e.id}`, kind: "added", summary: `${speaker} added evidence from ${a.source}: ${a.insight.slice(0, 160)}`, by: speaker, fromTurn: true });
          return ok(`Evidence ${e.id}.`);
        },
      ),
      tool(
        "set_validation",
        "Set one use-case validation signal: problem, customer, evidence, proof or thinSlice; state confirmed, probe (close but soft: ask about it) or open, with a one-line note.",
        { key: z.enum(SIGNAL_KEYS), state: z.enum(["confirmed", "probe", "open"]), note: z.string().default("") },
        async ({ key, state, note }) => {
          const u = await uc();
          const v = { ...((u.validation ?? {}) as Validation), [key]: { state, note } };
          await prisma.useCase.update({ where: { id: useCaseId }, data: { validation: v } });
          await recordChange(useCaseId, { node: "usecase", kind: "changed", summary: `Validation signal “${key}” is now ${state}${note ? `: ${note}` : ""}`, by: speaker, fromTurn: true });
          return ok(`Use case confidence now ${validationScore(v)}%.`);
        },
      ),
      tool(
        "upsert_move",
        "Create or update a build move on the Board. Every move traces to a capability and a decision. New cards start in Ready to shape (the first column). status: ready (Ready to shape), queued (Backlog: held for later), building (Being made real), review (Human review), done. owner: the agent or 'Product owner'. signal: a short tag (OPEN QUESTION, TRACEABLE, THIN SLICE, HUMAN REVIEW). hidden: capability | epic | story | task | workflow.",
        {
          id: z.string().default(""),
          title: z.string().min(3),
          capability: z.string().default(""),
          decision: z.string().default(""),
          status: z.enum(["queued", "ready", "building", "review", "done"]).default("ready"),
          owner: z.string().default("Product Engineer"),
          signal: z.string().default(""),
          hidden: z.string().default("story"),
          components: z.array(z.string()).optional(),
          routes: z.array(z.string()).optional(),
          prompt: z.string().default(""),
        },
        async (a) => {
          const capability = await capLabel(a.capability);
          const data = { title: a.title, capability, decision: a.decision, status: a.status, owner: a.owner, signal: a.signal, hidden: a.hidden, prompt: a.prompt, ...(a.components ? { components: a.components } : {}), ...(a.routes ? { routes: a.routes } : {}) };
          const existing = a.id ? await prisma.move.findFirst({ where: { id: a.id, useCaseId } }) : await prisma.move.findFirst({ where: { useCaseId, title: a.title } });
          if (existing) {
            await prisma.move.update({ where: { id: existing.id }, data });
            return ok(`Updated ${existing.id}.`);
          }
          const m = await prisma.move.create({ data: { useCaseId, position: await prisma.move.count({ where: { useCaseId } }), ...data } });
          return ok(`Move ${m.id}.`);
        },
      ),
      tool(
        "link_stories",
        `Draw a line on the Story map between two stories (board moves, "move:<id>") or a story and one of your recommendations ("backlog:<id>"). kind: depends_on (from needs to first), split_from (from was broken out of to), related. A link you draw is a GUESS shown dashed until a person accepts it, so use it when something changes and you see a connection the owner hasn't made ("what you said here affects that"). Offer only the strongest: at most ${MAX_SUGGESTED_PER_STORY} suggested links per story, and never one a person dismissed. Set confirmed true only when a person just told you the two are linked. Say why in plain words.`,
        { from: z.string().min(3), to: z.string().min(3), kind: z.enum(LINK_KINDS), why: z.string().default(""), confirmed: z.boolean().default(false) },
        async (a) => {
          const ref = (r: string) => (/^(move|backlog):/.test(r) ? r : `move:${r}`);
          const from = ref(a.from), to = ref(a.to);
          const exists = async (r: string) => (r.startsWith("move:") ? !!(await prisma.move.findFirst({ where: { id: r.slice(5), useCaseId } })) : !!(await prisma.backlogItem.findFirst({ where: { id: r.slice(8), useCaseId } })));
          if (!(await exists(from)) || !(await exists(to))) return ok("One of those isn't a story or recommendation in this product. Use ids from get_state.");
          const all = await prisma.storyLink.findMany({ where: { useCaseId } });
          if (from === to || wouldCycle(all, from, to, a.kind)) return ok("That would make a circle (or link a story to itself): each would wait on the other.");
          if (!a.confirmed) {
            const may = maySuggest(all, from, to, a.kind);
            if (!may.ok) return ok(may.why);
          }
          const status = a.confirmed ? "confirmed" : "suggested";
          const l = await prisma.storyLink.upsert({ where: { useCaseId_from_to_kind: { useCaseId, from, to, kind: a.kind } }, create: { useCaseId, from, to, kind: a.kind, status, why: a.why, by: speaker }, update: { status, why: a.why || undefined, by: speaker } });
          const title = async (r: string) => (r.startsWith("move:") ? (await prisma.move.findFirst({ where: { id: r.slice(5), useCaseId } }))?.title : (await prisma.backlogItem.findFirst({ where: { id: r.slice(8), useCaseId } }))?.title) ?? r;
          const [fromTitle, toTitle] = [await title(from), await title(to)];
          await recordChange(useCaseId, { node: from, kind: "changed", summary: `${speaker} ${a.confirmed ? "linked" : "suggested a link:"} “${fromTitle}” ${LINK_LABEL[a.kind]} “${toTitle}”${a.why ? `, because ${a.why}` : ""}`, after: `${LINK_LABEL[a.kind]} “${toTitle}” (${status})`, causes: [to], by: speaker, fromTurn: true });
          return ok(`Link ${l.id} (${status}).`);
        },
      ),
      tool(
        "set_route",
        "Show where an agent is on the agent route: 'Socra / Interviewer', 'Use Case Validator', 'UX / Component Mapper' or 'Product Engineer'; state complete | active | ready | waiting; detail one line.",
        { agent: z.string().min(2), state: z.enum(["complete", "active", "ready", "waiting"]), detail: z.string().default(""), action: z.string().default("") },
        async ({ agent, state, detail, action }) => {
          await prisma.agentRoute.upsert({
            where: { useCaseId_agent: { useCaseId, agent } },
            update: { state, ...(detail ? { detail } : {}), ...(action ? { action } : {}) },
            create: { useCaseId, agent, state, detail, action, position: await prisma.agentRoute.count({ where: { useCaseId } }) },
          });
          return ok();
        },
      ),
      tool(
        "set_components",
        "The product's shadcn/ui component map: exact registry names from the shadcn MCP tools, each with one line on why it fits. Replaces the map.",
        { components: z.array(z.object({ name: z.string().min(1), why: z.string().default("") })).min(1) },
        async ({ components }) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { components } });
          return ok();
        },
      ),
      tool(
        "add_tech_note",
        "Add a short technical note for the package's technical requirements (data, auth, integrations, risks, agent workflows).",
        { note: z.string().min(5) },
        async ({ note }) => {
          const u = await uc();
          if (!u.techNotes.includes(note)) await prisma.useCase.update({ where: { id: useCaseId }, data: { techNotes: { push: note } } });
          return ok();
        },
      ),
      tool(
        "start_build",
        "Stage a pilot build: assembles a fresh Claude Code package (a new iteration) and has Claude Code build the app into the live preview. Use after the first capability floor is written, and when the owner asks. Builds also start from the Studio's own buttons.",
        { reason: z.string().default("") },
        async () => {
          const u = await uc();
          if (u.generateBusy) return ok("A build is already running; changes go into the next one.");
          const { runGenerate } = await import("@/lib/generate");
          void runGenerate(useCaseId).catch((e) => console.error("build", e));
          return ok("The build has started. Tell the owner in one line that a first version is on its way to the preview.");
        },
      ),
      tool(
        "show_preview",
        "Build only: put the app as it stands now into the owner's live preview, so they can try it while you keep building. Call it once the main flow and the core screens run (aim for about ten minutes in), after \`npm run build\` passes, and again after each big step. The Studio restarts the preview from app/; it never stops your work.",
        { reason: z.string().default("") },
        async ({ reason }) => {
          const { startPreview } = await import("@/lib/preview");
          void startPreview(useCaseId).catch((e) => console.error("preview", e));
          await prisma.message.create({ data: { useCaseId, role: "agent", agent: "Claude Code", content: `An early version is in the preview${reason ? `: ${reason}` : ""}. The rest is still being built.` } });
          return ok("The preview is restarting from app/. Carry on building.");
        },
      ),
      tool(
        "make_image",
        `Build only: create one AI image (product shot, hero, illustration) for the app with OpenAI's image model and save it under app/. Use it for the images that carry the design, at most ${IMAGE_LIMIT} per run; draw icons and simple shapes as SVG instead. Never depict real people or brands.`,
        {
          prompt: z.string().min(10).max(4000),
          size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
          file: z.string().min(1).describe("Path inside app/, for example app/public/images/hero.webp"),
        },
        async ({ prompt, size, file }) => {
          if (!imagesConfigured()) return ok("Image generation is not set up here. Draw this as SVG instead.");
          if (imagesMade >= IMAGE_LIMIT) return ok(`The limit of ${IMAGE_LIMIT} images for this run is reached. Reuse an image or draw SVG.`);
          const appRoot = workspacePath(slug, "app");
          const target = path.resolve(workspacePath(slug), file);
          if (!target.startsWith(appRoot + path.sep)) return ok("The file must be inside app/.");
          try {
            imagesMade++;
            const model = await makeImage(prompt, size, target);
            return ok(`Saved ${path.relative(workspacePath(slug), target)} (${model}). Open it with Read to check it.`);
          } catch (e) {
            return ok(`${e instanceof Error ? e.message : String(e)}. Draw this as SVG instead.`);
          }
        },
      ),
      tool(
        "search_memory",
        "Search what the Studio learned in earlier products (Mem0): playbooks for a category, decisions owners made, answers, lessons. Never copy another owner's private details.",
        { query: z.string().min(3), role: RoleParam.optional().describe(`Whose memory to search: ${ROLE_HELP}. Leave out to search everyone's.`) },
        async ({ query, role }) => {
          const hits = await searchMemory(query, { role, excludeUseCase: useCaseId, limit: 8 }).catch(() => []);
          return ok(hits.length ? formatHits(hits) : "Nothing relevant remembered.");
        },
      ),
      tool(
        "ask_role_memory",
        "Ask a Studio role's long-term memory (Letta) for its experience across earlier products.",
        { role: RoleParam.describe(ROLE_HELP), question: z.string().min(5) },
        async ({ role, question }) => {
          const answer = await letta.askRole(role, question, speaker).catch(() => null);
          if (answer) logMemoryEvent({ role, kind: "ask", store: "letta", useCaseId, source: speaker, detail: question.slice(0, 200) });
          return ok(answer || "That role's memory is not available right now. Carry on without it.");
        },
      ),
      tool(
        "save_lesson",
        "Save a general lesson that would help a future, similar product (a category playbook, a question that unlocked the promise). No owner names, prices or private details.",
        { role: RoleParam.default("muse").describe(`Whose lesson it is (you, if you are a specialist): ${ROLE_HELP}`), lesson: z.string().min(10), confidence: z.number().min(0).max(1).default(0.7) },
        async ({ role, lesson, confidence }) => {
          rememberLesson(await uc(), role, lesson, confidence);
          return ok("Saved.");
        },
      ),
    ],
  });
}
