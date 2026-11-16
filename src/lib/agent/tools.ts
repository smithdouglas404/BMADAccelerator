import path from "path";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { formatHits, letta, rememberAnswer, rememberDecision, rememberLesson, searchMemory } from "@/lib/memory";
import { ROLES } from "@/lib/memory/lettaCore";
import { IMAGE_LIMIT, imagesConfigured, makeImage } from "@/lib/images";
import { SPEC_BASIS, SPEC_DEFS, SPEC_STATUSES, TRACE_TYPES, cleanTrace } from "@/lib/studio/spec";
import { ensureSpec } from "@/lib/studio/state";
import { nodesForIds, recordChange } from "@/lib/studio/truthlog";
import { VALIDATION_SIGNALS, colorFor, numberItems, overallReadiness, slugify, specialistByKey, validationScore, type Validation } from "@/lib/studio/core";

const ROLE_KEYS = ROLES.map((r) => r.key) as [string, ...string[]];
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

// What the Muse and its team can do in the Studio. Everything the owner sees comes through here.
export function studioTools(useCaseId: string, slug: string, tally: RunTally, opts: { speaker?: string } = {}) {
  const speaker = opts.speaker ?? "Muse";
  const uc = () => prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
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
            routes: s.routes.map((r) => ({ agent: r.agent, state: r.state, detail: r.detail })),
            components: s.components,
            techNotes: s.techNotes,
            lastMessages: s.messages.reverse().map((m) => `${m.role === "user" ? (m.author ? `${m.author} (${m.authorRole || "Product owner"})` : "Owner") + (m.addressed ? ` to the ${m.addressed} specialist` : "") : m.agent || m.role}: ${m.content}`),
            people: s.members.map((p) => `${p.name} (${p.role})`),
            spec: s.spec.map((x) => ({ key: x.key, ref: x.ref, tab: x.tab, title: x.title, basis: x.basis, status: x.status, completeness: x.completeness, review: x.review, reviewNote: x.reviewNote, content: x.content.slice(0, 600) })),
            build: { versions: s.generateCount, packageIterations: s.packageCount, building: s.generateBusy },
          };
          return ok(JSON.stringify(out, null, 1));
        },
      ),
      tool(
        "say",
        "Show a message to the owner in the conversation, in the Muse's voice. The only way the owner sees anything you write. Plain product language, one or two questions at most, never jargon (no epics, stories or agent names unless they ask).",
        { text: z.string().min(1), capability: z.string().default("").describe("The capability this is about (key or label), if any") },
        async ({ text, capability }) => {
          tally.spoke++;
          await prisma.message.create({ data: { useCaseId, role: "muse", agent: speaker === "Muse" ? "Muse · Product physician" : speaker, content: text, accent: await capKey(capability) } });
          return ok();
        },
      ),
      tool(
        "signal",
        "Show a quiet signal card in the conversation (for example \"Decision captured\", \"Added to product truth\", \"Parked for later\") with one plain sentence. Use it when the product truth changed in a way the owner should notice.",
        { label: z.string().min(2).max(60), text: z.string().min(2), capability: z.string().default("") },
        async ({ label, text, capability }) => {
          await prisma.message.create({ data: { useCaseId, role: "signal", agent: label, content: text, accent: await capKey(capability) } });
          return ok();
        },
      ),
      tool(
        "share_finding",
        "A specialist speaks in the conversation, visibly, in their own name: what they found or recommend, in two to four plain sentences, and at most one question (with a suggested answer) for the people on the product. Use it when a specialist finishes (the Muse may share for a research specialist), or to answer someone who addressed a specialist directly. Numbered options are fine when there are real choices. specialist: business-analyst, architect, engineer, ux or domain; for domain give the field's name in 'title' (for example \"Claims expert\").",
        {
          specialist: z.enum(["business-analyst", "architect", "engineer", "ux", "domain"]),
          title: z.string().max(60).default(""),
          text: z.string().min(2),
          capability: z.string().default(""),
        },
        async ({ specialist, title, text, capability }) => {
          const s = specialistByKey(specialist)!;
          const name = specialist === "domain" && title.trim() ? title.trim() : s.name;
          await prisma.message.create({ data: { useCaseId, role: "agent", agent: `${name} · Specialist`, addressed: specialist, content: text, accent: await capKey(capability) } });
          return ok();
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
        },
        async (a) => {
          const data = Object.fromEntries(Object.entries(a).filter(([, v]) => v.trim())) as Prisma.UseCaseUpdateInput;
          await prisma.useCase.update({ where: { id: useCaseId }, data });
          return ok();
        },
      ),
      tool(
        "update_prfaq",
        "Replace the living PRFAQ (Markdown). Shape: '# <headline>' then a one-line kicker '_FOR <who>_', a summary paragraph, '## Why customers care' (problem, solution, a customer quote as a '> ' line), '## How to get started', '## Customer FAQs' (Q/A), '## Internal & engineering FAQs' (data, auth, integrations, risks). Keep the owner's own words where they said them. It is the product's dream of the future, written as if launched.",
        { markdown: z.string().min(40) },
        async ({ markdown }) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { prfaq: markdown, prfaqUpdatedAt: new Date() } });
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
        "Move the lens: the capability the conversation is now holding. The Whole product and Work with Muse views follow it.",
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
        "Record a decision in the human-in-the-loop register. status 'approved' when the owner agreed (a yes is an approval: never ask 'do you want to approve this?'), 'assumed' when you assumed it for them (they can correct it), 'open' when only the owner can decide it (options: two to four choices, the first being your suggestion). Keep their original words in 'words'. An approved decision goes into the next build.",
        {
          text: z.string().min(3),
          status: z.enum(["approved", "assumed", "open"]),
          capability: z.string().default(""),
          words: z.string().default(""),
          options: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
        },
        async (a) => {
          const u = await uc();
          const d = await prisma.decision.create({
            data: { useCaseId, text: a.text, status: a.status, capability: await capLabel(a.capability), words: a.words, options: a.options, agent: speaker, session: u.session, includeInBuild: a.status !== "open" },
          });
          if (a.status === "approved") rememberDecision(u, "muse", `${a.text}${a.words ? `\nThe owner said: "${a.words}"` : ""}`, "studio:decision");
          await recordChange(useCaseId, { node: `decision:${d.id}`, kind: a.status === "approved" ? "approved" : "added", summary: a.status === "open" ? `${speaker} raised a checkpoint only a person can decide: ${a.text}` : a.status === "assumed" ? `${speaker} assumed: ${a.text} (they can correct it)` : `Recorded as approved: ${a.text}`, after: a.text, by: speaker, fromTurn: true });
          return ok(`Recorded ${d.id}.`);
        },
      ),
      tool(
        "resolve_decision",
        "Settle an open or assumed decision once the owner answered: approved with their answer, or changed text.",
        { id: z.string(), status: z.enum(["approved", "assumed", "open"]).default("approved"), answer: z.string().default(""), text: z.string().default("") },
        async ({ id, status, answer, text }) => {
          const d = await prisma.decision.findFirst({ where: { id, useCaseId } });
          if (!d) return ok("No such decision.");
          await prisma.decision.update({ where: { id }, data: { status, answer: answer || d.answer, text: text || d.text, includeInBuild: status !== "open", resolvedAt: new Date() } });
          await recordChange(useCaseId, { node: `decision:${id}`, kind: status === "approved" ? "approved" : "changed", summary: `${status === "approved" ? "Settled" : "Updated"}: ${text || d.text}${answer ? ` (answer: ${answer})` : ""}`, before: `${d.text} (${d.status})`, after: `${text || d.text} (${status})`, by: speaker, fromTurn: true });
          if (answer) rememberAnswer(await uc(), "muse", d.text, answer);
          return ok();
        },
      ),
      tool(
        "recommend",
        "Put a recommendation in the backlog: something the owner may not know to consider. kind 'consider' (a capability or best practice), 'workflow' (an agentic workflow candidate: only for workflows, messages, alerts, recommendations or insights; fixed rules stay plain code), or 'hitl' (a decision a person must keep). 'prompt' is the probing question the Muse asks when the owner pulls it forward. It never becomes a requirement silently.",
        { title: z.string().min(3), reason: z.string().min(3), prompt: z.string().min(5), capability: z.string().default(""), kind: z.enum(["consider", "workflow", "hitl"]) },
        async (a) => {
          const group = (await capLabel(a.capability)) || "Unsorted signal";
          const dup = await prisma.backlogItem.findFirst({ where: { useCaseId, title: a.title } });
          if (dup) return ok(`Already in the backlog as ${dup.id}.`);
          const b = await prisma.backlogItem.create({
            data: { useCaseId, title: a.title, note: a.reason, kind: "epic", group, source: "Muse recommendation", recKind: a.kind, probe: a.prompt, state: "suggested", hidden: a.kind === "workflow" ? "workflow" : "capability" },
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
          const group = a.kind === "distraction" ? "Parked by Muse" : (await capLabel(a.capability)) || b.group;
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
        },
        async (a) => {
          const f = await prisma.feedback.findFirst({ where: { id: a.id, useCaseId } });
          if (!f) return ok("No such annotation.");
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
        "Create or update a build move on the Make it real board. Every move traces to a capability and a decision. status: queued (Backlog), ready (Ready to shape), building (Being made real), review (Human review), done. owner: the agent or 'Product owner'. signal: a short tag (OPEN QUESTION, TRACEABLE, THIN SLICE, HUMAN REVIEW). hidden: capability | epic | story | task | workflow.",
        {
          id: z.string().default(""),
          title: z.string().min(3),
          capability: z.string().default(""),
          decision: z.string().default(""),
          status: z.enum(["queued", "ready", "building", "review", "done"]).default("queued"),
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
        "set_route",
        "Show where an agent is on the agent route: 'Muse / Interviewer', 'Use Case Validator', 'UX / Component Mapper' or 'Product Engineer'; state complete | active | ready | waiting; detail one line.",
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
        { query: z.string().min(3), role: z.enum(ROLE_KEYS).optional() },
        async ({ query, role }) => {
          const hits = await searchMemory(query, { role, excludeUseCase: useCaseId, limit: 8 }).catch(() => []);
          return ok(hits.length ? formatHits(hits) : "Nothing relevant remembered.");
        },
      ),
      tool(
        "ask_role_memory",
        "Ask a Studio role's long-term memory (Letta) for its experience across earlier products.",
        { role: z.enum(ROLE_KEYS), question: z.string().min(5) },
        async ({ role, question }) => {
          const answer = await letta.askRole(role, question, speaker).catch(() => null);
          return ok(answer || "That role's memory is not available right now. Carry on without it.");
        },
      ),
      tool(
        "save_lesson",
        "Save a general lesson that would help a future, similar product (a category playbook, a question that unlocked the promise). No owner names, prices or private details.",
        { role: z.enum(ROLE_KEYS).default("muse"), lesson: z.string().min(10), confidence: z.number().min(0).max(1).default(0.7) },
        async ({ role, lesson, confidence }) => {
          rememberLesson(await uc(), role, lesson, confidence);
          return ok("Saved.");
        },
      ),
    ],
  });
}
