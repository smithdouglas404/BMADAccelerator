import { recordChange } from "@/lib/studio/truthlog";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentTurnId } from "@/lib/studio/truthlog";
import { colorFor, workingName } from "@/lib/studio/core";
import type { RunTally } from "./tools";

// A scripted stand-in for Socra, used only by automated tests and the sandbox check
// (BACC_FAKE_AGENT=1 with no Claude sign-in). It drives the same screens the real Socra does:
// product, PRFAQ, capabilities, decisions, recommendations, evidence, validation, moves and routes.
export async function fakeAgentTurn(uc: UseCase, prompt: string, tally: RunTally, onTool?: (name: string, input: Record<string, unknown>) => void) {
  const turnId = currentTurnId(uc.id);
  const say = async (content: string, accent = "", about: string[] = []) => {
    tally.spoke++;
    onTool?.("mcp__studio__say", {});
    await prisma.message.create({ data: { useCaseId: uc.id, role: "muse", agent: "Socra · Product physician", content, accent, about, turnId } });
  };
  const specialist = async (key: string, agent: string, content: string, about: string[] = []) => {
    onTool?.("mcp__studio__share_finding", {});
    return prisma.message.create({ data: { useCaseId: uc.id, role: "agent", agent: `${agent} · Specialist`, addressed: key, content, about, turnId } });
  };
  // Items the Studio asked about (itemAsk): the stand-in sends the named specialist and asks about each.
  const asks = [...prompt.matchAll(/Item: ((?:backlog|move):\w+) \(“([^”]*)”\)\. Specialist for this stage: ([\w-]+) \(([^:]+):/g)];
  if (asks.length) {
    for (const [, node, title, agent, name] of asks) {
      const after = prompt.slice(prompt.indexOf(`Item: ${node}`));
      const about = JSON.parse(after.match(/about (\[[^\]]*\])/)?.[1] ?? JSON.stringify([node])) as string[];
      const skill = after.match(/Skill for this stage: ([\w-]+)/)?.[1];
      if (skill) onTool?.("Skill", { skill });
      onTool?.("Agent", { subagent_type: agent });
      const key = agent === "solution-architect" ? "architect" : agent === "product-engineer" ? "engineer" : agent === "ux-component-mapper" ? "ux" : "business-analyst";
      await specialist(key, name.replace(/ \(validator\)$/, ""), `I looked at “${title}”. Before it can be built it needs who uses it and what “done” means for them.`, about);
      await say(`About “${title}”: who uses this first, and what should they be able to do afterwards?\n\n1. The people who run it day to day, so they finish the job without help (suggested)\n2. Their customers, so they see where things stand\n3. Both, starting with the day-to-day team`, uc.focus, about);
    }
    if (!/interpret_annotation/.test(prompt)) return;
  }
  if (prompt.includes("[opening]")) {
    const k = kindOf(uc.description);
    // Socra names the product from what was said (the working name came from the first words).
    const name = uc.name === workingName(uc.description) ? k.name : uc.name;
    await prisma.useCase.update({
      where: { id: uc.id },
      data: {
        name,
        statement: `${name} ${k.promise}`,
        category: k.category,
        audience: k.audience,
        customerQuote: "",
        validatedUseCase: `${k.audienceOne} ${k.useCase} with ${name}, start to finish, without help.`,
        prfaq: `# ${name} launches\n\n_FOR ${k.audience.toUpperCase()}_\n\n${name} ${k.promise}\n\n## Why customers care\n\n${uc.description || k.promise}\n\n## Customer FAQs\n\n**Q: What does the pilot cover?**\nA: ${k.useCase}, end to end, on a complete professional product.\n\n## Internal & engineering FAQs\n\n**Q: Where is data kept?**\nA: In the product's own database for the pilot.\n`,
        validation: { problem: { state: "confirmed", note: "Owner's words" }, customer: { state: "probe", note: "Named in intake, not yet tested" }, evidence: { state: "probe", note: "Only the owner's view so far" }, proof: { state: "open" }, thinSlice: { state: "confirmed", note: k.useCase } },
        focus: k.caps[0][0],
        floorSeq: k.caps.reduce((n, c) => n + c[4].length, 0),
        components: k.components.map(([name, why]) => ({ name, why })),
      },
    });
    let n = 0;
    for (const [i, [key, label, kicker, readiness, items]] of k.caps.entries()) {
      await prisma.capability.create({
        data: {
          useCaseId: uc.id, key, label, kicker, readiness, position: i, color: colorFor(i),
          description: `${label} at the level the leading products in this category ship.`,
          signal: "The floor is in place. Tell me what makes yours different.",
          items: items.map((t) => ({ id: `F${++n}`, text: t, state: "assumed" })),
        },
      });
    }
    await prisma.backlogItem.createMany({
      data: k.recs.map(([title, note, recKind, probe], i) => ({ useCaseId: uc.id, title, note, kind: "epic", group: k.caps[i % k.caps.length][1], source: "Socra recommendation", recKind, probe, state: "suggested" })),
    });
    await prisma.evidence.create({ data: { useCaseId: uc.id, source: "Owner's first description", type: "conversation", insight: uc.description.slice(0, 200) || "The owner described the product.", confidence: "medium", trace: "Product promise" } });
    await prisma.decision.create({ data: { useCaseId: uc.id, text: "The pilot calls no outside systems yet: those steps end in labelled demos", status: "assumed", capability: k.caps[2][1], agent: "Socra" } });
    // A checkpoint only the people on the product can clear.
    await prisma.decision.create({ data: { useCaseId: uc.id, text: k.checkpoint, status: "open", capability: k.caps[1][1], agent: "Business analyst", includeInBuild: false, options: [{ label: "Yes, as suggested", value: "yes" }, { label: "Not for the pilot", value: "no" }] } });
    await prisma.move.createMany({
      data: [
        { useCaseId: uc.id, title: k.caps[0][4][0], capability: k.caps[0][1], decision: "Start from the category floor", status: "building", owner: "Claude Code", signal: "THIN SLICE", position: 0 },
        { useCaseId: uc.id, title: k.caps[1][4][0], capability: k.caps[1][1], decision: "Start from the category floor", status: "ready", owner: "UX / Component Mapper", signal: "TRACEABLE", position: 1 },
        { useCaseId: uc.id, title: "Decide when it is ready for a pilot", capability: k.caps[2][1], status: "queued", owner: "Product Engineer", signal: "OPEN QUESTION", position: 2 },
      ],
    });
    // The floor goes into the living spec as inferred, never confirmed, with one real inference step each.
    const floorText = k.caps.map((c) => `- ${c[1]}: ${c[4].join("; ")}`).join("\n");
    const spec: [string, string, number][] = [
      ["prd-problem", uc.description || k.promise, 45],
      ["prd-capabilities", floorText, 55],
      ["prd-flows", k.flow, 40],
      ["trd-context", `A web app for ${k.audience.toLowerCase()}, with its own database for the pilot. Outside systems are labelled demos until the owner connects them.`, 35],
    ];
    for (const [key, content, completeness] of spec)
      await prisma.specSection.updateMany({
        where: { useCaseId: uc.id, key },
        data: { content, completeness, basis: "inferred", status: "exploring", confidence: "medium", source: "Socra inference", trace: [{ label: "Inference", detail: `What the leading ${k.category.toLowerCase()} products have`, type: "inference" }] },
      });
    for (const [key] of spec) await recordChange(uc.id, { node: `spec:${key}`, kind: "added", summary: `Socra wrote this from what the leading ${k.category.toLowerCase()} products have (inferred, not confirmed)`, by: "Socra", fromTurn: true });
    await prisma.agentRoute.updateMany({ where: { useCaseId: uc.id, agent: "Socra / Interviewer" }, data: { state: "complete", detail: "Floor and PRFAQ written" } });
    await prisma.agentRoute.updateMany({ where: { useCaseId: uc.id, agent: "Use Case Validator" }, data: { state: "active", detail: "Testing the proof point" } });
    await prisma.agentRoute.updateMany({ where: { useCaseId: uc.id, agent: "UX / Component Mapper" }, data: { state: "ready" } });
    const { runGenerate } = await import("@/lib/generate");
    void runGenerate(uc.id).catch(() => {});
    await say(`I read this as ${k.article} ${k.category.toLowerCase()} product and ${name === uc.name ? `kept the name ${name}` : `called it ${name} for now (rename it any time)`}. I've laid out everything the leading ones have and a first version is building. The question that matters most: ${k.question}\n\n1. ${k.options[0]}\n2. ${k.options[1]}\n3. ${k.options[2]}`, k.caps[0][0]);
    await specialist("domain", k.expert, k.expertNote);
    await specialist("business-analyst", "Business analyst", `I've drafted the primary flow: ${k.flow} One rule needs you: it's waiting as a checkpoint.`);
    await specialist("architect", "Solution architect", "For the pilot it runs on its own database with roles from day one; outside systems are labelled demos until you connect them. I'd keep an audit trail on every change.");
    return;
  }
  const mark = prompt.match(/interpret_annotation \(annotation (\w+)\)/);
  if (mark) {
    const f = await prisma.feedback.findFirst({ where: { id: mark[1], useCaseId: uc.id } });
    if (f) {
      const interpretation = { observation: f.comment, behaviour: `What they pointed at should change: ${f.comment.replace(/\.$/, "")}.`, acceptance: [`Given the screen ${f.target || "they marked"}, when someone uses it, then it reflects: ${f.comment.replace(/\.$/, "")}`], component: f.target || "the marked surface", prd: ["prd-flows"], trd: [] as string[], question: "" };
      await prisma.feedback.update({ where: { id: f.id }, data: { interpretation } });
      await recordChange(uc.id, { node: `ann:${f.id}`, kind: "interpreted", summary: `Socra read the mark: ${interpretation.behaviour}`, after: interpretation.acceptance.join("\n"), by: "Socra" });
      const s = await prisma.specSection.findFirst({ where: { useCaseId: uc.id, key: "prd-flows" } });
      if (s) {
        const content = `${s.content}\n- ${f.comment}`.trim();
        await prisma.specSection.update({ where: { id: s.id }, data: { content, related: [...new Set([...s.related, f.id])], trace: [...((s.trace ?? []) as object[]), { label: "Annotation", detail: f.comment, type: "annotation" }].slice(-12) } });
        await recordChange(uc.id, { node: "spec:prd-flows", kind: "changed", summary: "Socra carried the mark into the primary customer flow", before: s.content, after: content, causes: [`ann:${f.id}`], by: "Socra", fromTurn: true });
      }
    }
    await say("I've read your mark and carried it into the primary flow. It goes into the next build.", uc.focus);
    return;
  }
  const pilot = prompt.match(/Pilot feedback \([^,]+, evidence (\w+)\): "([^"]+)"/);
  if (pilot) {
    const s = await prisma.specSection.findFirst({ where: { useCaseId: uc.id, key: "prd-acceptance" } });
    if (s) {
      const content = `${s.content}\n- Seen in the pilot: ${pilot[2]}`.trim();
      await prisma.specSection.update({ where: { id: s.id }, data: { content, completeness: Math.max(s.completeness, 30), basis: s.basis === "not-researched" ? "inferred" : s.basis, related: [...new Set([...s.related, pilot[1]])], trace: [...((s.trace ?? []) as object[]), { label: "Evidence", detail: pilot[2], type: "evidence" }].slice(-12) } });
      await recordChange(uc.id, { node: "spec:prd-acceptance", kind: "changed", summary: "The pilot changed the acceptance criteria", before: s.content, after: content, by: "Socra", fromTurn: true });
    }
    await say("That pilot observation now shapes the acceptance criteria.", uc.focus);
    return;
  }
  if (prompt.includes("Build finished")) {
    await say("The new version is in the preview. The main flow reads well; the detail screens need more polish before they stand next to the leaders.");
    return;
  }
  const addressed = prompt.match(/asked the (Business analyst|Solution architect|Product engineer|UX\/UI designer|Domain expert) directly/);
  if (addressed) {
    const key = { "Business analyst": "business-analyst", "Solution architect": "architect", "Product engineer": "engineer", "UX/UI designer": "ux", "Domain expert": "domain" }[addressed[1]] ?? "domain";
    await specialist(key, addressed[1] === "Domain expert" ? kindOf(uc.description).expert : addressed[1], "Good question. I've looked at it against what the leading products do and noted it in the spec; the short answer is to keep it simple for the pilot and revisit after the first real users.");
    return;
  }
  const words = prompt.match(/said: "([^"]+)"/)?.[1];
  if (words) {
    const s = await prisma.specSection.findFirst({ where: { useCaseId: uc.id, key: "prd-use-case" } });
    if (s) {
      const content = `${s.content}\n- ${words}`.trim();
      await prisma.specSection.update({ where: { id: s.id }, data: { content, completeness: Math.max(s.completeness, 25), basis: s.basis === "not-researched" ? "inferred" : s.basis, trace: [...((s.trace ?? []) as object[]), { label: "Conversation", detail: words, type: "conversation" }].slice(-12) } });
      await recordChange(uc.id, { node: "spec:prd-use-case", kind: "changed", summary: "Socra carried what was said into the validated use case", before: s.content, after: content, by: "Socra", fromTurn: true });
    }
  }
  await say("Got it. I've carried that into the product. What should feel different the first time someone uses it?", uc.focus);
}

type Cap = readonly [string, string, string, number, readonly string[]];
type Kind = { name: string; expert: string; expertNote: string; checkpoint: string; options: readonly [string, string, string]; category: string; article: string; promise: string; audience: string; audienceOne: string; useCase: string; flow: string; question: string; caps: readonly Cap[]; recs: readonly (readonly [string, string, string, string])[]; components: readonly (readonly [string, string])[] };

// A few category floors for the stand-in only; the real Socra infers the category from anything described.
function kindOf(text: string): Kind {
  const t = text.toLowerCase();
  if (/claim|insur|adjust/.test(t))
    return {
      name: "Claimwise", expert: "Claims expert", expertNote: "In claims, the first notice of loss sets the pace: most delays come from missing documents and unclear status. Leading carriers acknowledge within a day and show the claimant every step. I've added acknowledgement deadlines and a document checklist to the floor.",
      checkpoint: "Claims above a payout limit need a second approver", options: ["Missing documents slow it most", "Waiting for an adjuster slows it most", "Back-and-forth on the decision slows it most"],
      category: "Claims processing", article: "a", promise: "turns a claim into a decision quickly, with the claimant always knowing where it stands.",
      audience: "Claimants and adjusters", audienceOne: "A claimant", useCase: "files a claim and follows it to a decision", flow: "File the claim → upload documents → triage → assign an adjuster → decision → payout or appeal, with status visible to the claimant throughout.",
      question: "who decides a claim today, and what slows them down most? I'd guess missing documents.",
      caps: [
        ["intake", "Claim intake", "The first five minutes", 30, ["Guided claim form", "Document and photo upload", "Policy lookup", "Save and resume"]],
        ["triage", "Triage & assignment", "The right person, fast", 22, ["Priority rules", "Adjuster assignment", "Fraud flags for review"]],
        ["workbench", "Adjuster workbench", "Deciding well", 18, ["Claim queue", "Claim detail with documents", "Notes and audit trail", "Decision with reasons"]],
        ["status", "Claimant status", "Never in the dark", 20, ["Status timeline", "Notifications", "Messages with the adjuster"]],
      ],
      recs: [["Payout limits that need a second approver", "Money: a person stays in the loop above a limit.", "hitl", "Above what amount should a second person approve?"], ["Missing-document chaser", "An agentic workflow: notice what is missing and ask the claimant.", "workflow", "Should the claimant be reminded automatically when a document is missing?"], ["Appeals", "Most leading claims products let a claimant appeal.", "consider", "Can a claimant appeal a decision?"]],
      components: [["form", "Claim intake"], ["table", "Adjuster queue"], ["sheet", "Claim detail"]],
    };
  if (/book|reserv|appointment|schedul/.test(t))
    return {
      name: "Slotwise", expert: "Scheduling expert", expertNote: "No-shows and last-minute changes are what hurt booking businesses most. The leaders send reminders a day and an hour ahead and make rescheduling one tap. I've added both to the floor.",
      checkpoint: "Cancellations inside 24 hours keep the deposit", options: ["Mostly this week", "Mostly a month ahead", "A mix, depending on the service"],
      category: "Booking", article: "a", promise: "lets people find a time and book it in under a minute.",
      audience: "People booking and the businesses they book with", audienceOne: "A first-time customer", useCase: "finds a slot and books it", flow: "Search → pick a service → pick a time → confirm → reminder → reschedule or cancel.",
      question: "what gets booked most, and how far ahead? I'd guess this week.",
      caps: [
        ["search", "Search & availability", "Finding a time", 30, ["Service list", "Calendar availability", "Filters"]],
        ["booking", "Booking", "Confirming it", 24, ["Slot picker", "Confirmation", "Add to calendar"]],
        ["manage", "Manage bookings", "Changing plans", 18, ["Reschedule", "Cancel with policy", "Reminders"]],
        ["admin", "Business admin", "Running the day", 15, ["Schedule view", "Staff and services", "No-show handling"]],
      ],
      recs: [["Deposits for busy slots", "Money: the owner decides.", "hitl", "Should busy slots take a deposit?"], ["Waitlist", "An agentic workflow: offer freed slots to the waitlist.", "workflow", "Should a cancelled slot be offered to the waitlist automatically?"], ["Reviews after a visit", "Leading booking products ask for one.", "consider", "Should customers be asked for a review afterwards?"]],
      components: [["calendar", "Availability"], ["dialog", "Confirm booking"], ["table", "Admin schedule"]],
    };
  return {
    name: "Pathway", expert: "Domain expert", expertNote: "In this field, people judge a new tool in its first session: if the main job isn't obvious, they leave. I've added a guided first task and clear empty states to the floor.",
    checkpoint: "Only admins can invite people and change roles", options: ["Finished their first task", "Set up their workspace", "Invited their team"],
    category: "Web application", article: "a", promise: "does the job its users came for, clearly and without friction.",
    audience: "Its first users", audienceOne: "A first-time user", useCase: "completes the main job", flow: "Arrive → understand what it does → sign in → do the main job → see the result → come back.",
    question: "who is the first user, and what should they have done ten minutes after arriving?",
    caps: [
      ["onboarding", "First run", "The first ten minutes", 28, ["Clear landing", "Sign up and sign in", "Guided first task"]],
      ["core", "The main job", "Why they came", 24, ["Primary workflow screens", "Search and filters", "Empty and error states"]],
      ["records", "Records & history", "Picking up where they left off", 18, ["List and detail views", "Activity history", "Export"]],
      ["account", "Account & trust", "Feeling safe", 15, ["Settings and profile", "Roles and permissions", "Privacy and terms"]],
    ],
    recs: [["Who approves changes that matter", "A person stays in the loop.", "hitl", "Which actions need a second person?"], ["Weekly summary", "An agentic workflow: summarise what changed for each user.", "workflow", "Would a weekly summary help your users?"], ["Team accounts", "Leading products in this category support teams.", "consider", "Will people use it alone or as a team?"]],
    components: [["card", "Dashboard tiles"], ["table", "Records"], ["form", "Main workflow"]],
  };
}
