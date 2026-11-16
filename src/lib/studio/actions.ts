import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled, START_PROMPT } from "@/lib/agent/runner";
import { rememberDecision } from "@/lib/memory";
import { bumpReadiness, clip, isAffirmative, numberedOptions, pickedNumbers, proposalFrom, specialistByKey, suggestedOption } from "./core";
import { SESSION_EDGES, addTrace } from "./trace";
import { recordChange } from "./truthlog";

const NO_AGENTS = "I've kept that. Socra switches on once Claude is signed in on Settings.";

/** Opens a product for Socra the first time it is looked at (or after an upgrade reset). */
export async function ensureStarted(useCaseId: string) {
  if (!agentsEnabled()) return;
  const { count } = await prisma.useCase.updateMany({ where: { id: useCaseId, started: false }, data: { started: true } });
  if (count) await enqueue(useCaseId, "start", START_PROMPT);
}

export type Speaker = { name?: string; role?: string };
export type SayOpts = { source?: string; author?: Speaker; to?: string; raw?: string };

/** The person on the product who spoke (created the first time they speak), as "Dana (Business analyst)". */
async function whoSpoke(useCaseId: string, author?: Speaker) {
  const name = author?.name?.trim().slice(0, 80) || "";
  const role = author?.role?.trim().slice(0, 60) || "Product owner";
  if (name && !(await prisma.member.findFirst({ where: { useCaseId, name } }))) await prisma.member.create({ data: { useCaseId, name, role } });
  if (name) await prisma.member.updateMany({ where: { useCaseId, name }, data: { role } });
  return { name, role, said: name ? `${name} (${role})` : role === "Product owner" ? "The owner" : `The ${role.toLowerCase()}` };
}

/**
 * Someone on the product said something. "Every time you talk is requirements. Every time you say yes,
 * it's automatically an approval." A plain yes (typed or spoken) becomes an approved decision of the
 * Socra's last proposal; a number ("2", "2 and 5") picks from Socra's numbered options; anything else is
 * held in the backlog in their words. A message addressed to a specialist goes to that specialist.
 * Either way Socra hears it and carries it into the product truth. Every approval can be undone.
 */
export async function ownerSays(useCaseId: string, content: string, opts: SayOpts | string = {}) {
  const o: SayOpts = typeof opts === "string" ? { source: opts } : opts;
  const source = o.source || "Working session";
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const who = await whoSpoke(useCaseId, o.author);
  const specialist = o.to ? specialistByKey(o.to) : undefined;
  const focus = uc.focus ? await prisma.capability.findFirst({ where: { useCaseId, key: uc.focus } }) : null;
  const msg = await prisma.message.create({ data: { useCaseId, role: "user", agent: "You", content, author: who.name, authorRole: who.role, addressed: specialist?.key ?? "", raw: o.raw && o.raw !== content ? o.raw : "" } });
  // What a yes or a number answers: Socra's (or a specialist's) words since anyone last spoke.
  const lastUser = await prisma.message.findFirst({ where: { useCaseId, role: "user", createdAt: { lt: msg.createdAt } }, orderBy: { createdAt: "desc" } });
  const since = await prisma.message.findMany({
    where: { useCaseId, createdAt: { lt: msg.createdAt, ...(lastUser ? { gt: lastUser.createdAt } : {}) }, OR: [{ role: "muse" }, { role: "agent", addressed: { not: "" } }] },
    orderBy: { createdAt: "desc" },
  });
  const lastMuse = since[0] ?? (await prisma.message.findFirst({ where: { useCaseId, role: "muse", createdAt: { lt: msg.createdAt } }, orderBy: { createdAt: "desc" } }));
  await addTrace(useCaseId, ...SESSION_EDGES.ownerMessage(content));

  // A pick from the latest numbered options offered since anyone last spoke.
  const offered = since.find((m) => numberedOptions(m.content).length);
  const options = offered ? numberedOptions(offered.content) : [];
  const nums = options.length ? pickedNumbers(content) : null;
  let picked = nums ? options.filter((x) => nums.includes(x.n)) : [];
  // A bare yes approves only what was actually proposed: the option Socra marked as its suggestion,
  // or the yes/no proposal it last made. A yes to an open question or to unmarked options is held.
  const yes = !specialist && !picked.length && isAffirmative(content);
  const suggested = yes && offered ? suggestedOption(offered.content) : null;
  if (suggested) picked = options.filter((x) => x.n === suggested);
  const proposed = yes && !picked.length && !offered && lastMuse ? proposalFrom(lastMuse.content) : "";
  const unclearYes = yes && !picked.length && !proposed;
  const approved = !specialist && (picked.length > 0 || !!proposed);

  if (approved) {
    const proposal = picked.length ? picked.map((x) => `${x.n}. ${x.label}`).join("; ") : proposed;
    const decision = await prisma.decision.create({
      data: { useCaseId, text: proposal, status: "approved", capability: focus?.label ?? "", words: content, agent: who.name || "Owner", session: uc.session, resolvedAt: new Date() },
    });
    if (focus) await prisma.capability.update({ where: { id: focus.id }, data: { readiness: bumpReadiness(focus.readiness, true) } });
    await prisma.message.create({
      data: {
        useCaseId,
        role: "signal",
        agent: "Decision captured",
        accent: "#d7f58b",
        ref: decision.id,
        content: `${picked.length ? "Chosen" : "Approved"}: ${proposal}. Socra is carrying it into the product truth${focus ? ` and moving the ${focus.label.toLowerCase()} ceiling forward` : ""}.`,
      },
    });
    rememberDecision(uc, "muse", `${who.said} approved: ${proposal}`, "studio:yes");
    await recordChange(useCaseId, { node: `decision:${decision.id}`, kind: "approved", summary: `${who.said} ${picked.length ? "chose" : "approved"}: ${proposal}`, after: proposal, causes: [`msg:${msg.id}`, ...((offered ?? lastMuse) ? [`msg:${(offered ?? lastMuse)!.id}`] : [])], by: who.name || who.role });
    if (agentsEnabled())
      await enqueue(
        useCaseId,
        "user",
        `${who.said} said: "${content}"\n\nThe Studio recorded it as an approved decision (id ${decision.id}): "${proposal}"${focus ? `, in ${focus.label}` : ""}, and moved its readiness forward. They can undo it. Carry it into the product truth (PRFAQ, the spec sections it touches, the capability's items from [assumed] to [confirmed] where it applies) and ask the next question.`,
        `decision:${decision.id}`,
      );
  } else if (unclearYes) {
    // A bare yes with nothing single on the table to approve: it answers the last question. Nothing is
    // approved and nothing is held (a lone "yes" is not a requirement); Socra reads it in context.
    if (agentsEnabled())
      await enqueue(
        useCaseId,
        "user",
        `${who.said} said: "${content}"\n\nNothing approved: your last message had ${offered ? "numbered options without a marked suggestion" : "no single yes/no proposal"}. Read it as their answer to your last question. If it is unclear what they agreed to, ask in one line which one, by number, and say which you suggest.`,
        `msg:${msg.id}`,
      );
  } else {
    const item = await prisma.backlogItem.create({
      data: { useCaseId, title: clip(content, 140), note: content.length > 140 ? content : "Captured from the living conversation", kind: "capture", group: focus?.label ?? "Unsorted signal", source: who.name ? `${source} · ${who.name}` : source, state: "held" },
    });
    if (focus) await prisma.capability.update({ where: { id: focus.id }, data: { readiness: bumpReadiness(focus.readiness, false) } });
    await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "added", summary: `${who.said} said it; held in the backlog in their words`, after: content, causes: [`msg:${msg.id}`], by: who.name || who.role });
    await prisma.message.create({
      data: specialist
        ? { useCaseId, role: "signal", agent: `Asked the ${specialist.name.toLowerCase()}`, accent: "#a9d8ff", content: `The ${specialist.name.toLowerCase()} is looking at it and will answer here. Your words are kept in the backlog too.` }
        : { useCaseId, role: "signal", agent: "Thought held for curation", accent: "#f5c88a", content: "Socra has kept your original language intact and placed this in the backlog to find its right home." },
    });
    if (agentsEnabled())
      await enqueue(
        useCaseId,
        "user",
        specialist
          ? `${who.said} asked the ${specialist.name} directly: "${content}"\n\nThe Studio held it in the backlog (item ${item.id}). Send \`${specialist.agent}\` with the Agent tool to answer it; the answer reaches them through mcp__studio__share_finding as the ${specialist.name}${specialist.key === "domain" ? " (named for this product's field)" : ""}. Then carry what it changes into the product truth.`
          : `${who.said} said: "${content}"\n\nThe Studio held it in the backlog in their words (item ${item.id}). Curate it, carry its meaning into the product truth, and answer them.`,
        `msg:${msg.id}`,
      );
  }
  if (!agentsEnabled()) await prisma.message.create({ data: { useCaseId, role: "muse", agent: "Socra · Product physician", content: NO_AGENTS } });
  await prisma.useCase.update({ where: { id: useCaseId }, data: { updatedAt: new Date() } });
  return { approved, picked: picked.map((x) => x.n) };
}

/** Undo an approval made by a yes or a pick: as if it was never said. The decision goes; Socra hears it. */
export async function undoApproval(useCaseId: string, decisionId: string, author?: Speaker) {
  const d = await prisma.decision.findFirst({ where: { id: decisionId, useCaseId } });
  if (!d) return null;
  const who = await whoSpoke(useCaseId, author);
  await prisma.decision.delete({ where: { id: d.id } });
  await prisma.message.updateMany({ where: { useCaseId, ref: d.id, agent: "Decision captured" }, data: { agent: "Approval undone", accent: "#f5c88a", content: `Undone: ${d.text}. Nothing was carried forward.` } });
  await recordChange(useCaseId, { node: `decision:${d.id}`, kind: "undone", summary: `${who.said} undid the approval: ${d.text}`, before: d.text, by: who.name || who.role });
  if (agentsEnabled())
    await enqueue(useCaseId, "decision", `${who.said} undid an approval: "${d.text}" (decision ${d.id}, now removed). Take it back out of the product truth wherever you carried it in, and ask about it again later only if it matters.`);
  return d;
}

/** A thought caught away from the desk (phone, voice, the sidebar). Held, then curated by Socra. */
export async function captureThought(useCaseId: string, text: string, source = "Phone / voice") {
  const item = await prisma.backlogItem.create({
    data: { useCaseId, title: clip(text, 140), note: text.length > 140 ? text : "Ambient capture · ready for a home", kind: "capture", group: "Unsorted signal", source, state: "held" },
  });
  await addTrace(useCaseId, ...SESSION_EDGES.capture(text));
  await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "added", summary: `A thought was captured (${source})`, after: text, by: source });
  if (agentsEnabled()) await enqueue(useCaseId, "capture", `A captured thought arrived (${source}, backlog item ${item.id}): "${text}". Curate it with the others waiting; talk about the pattern, not the thought.`, `backlog:${item.id}`);
  return item;
}

/** The owner pulled a recommendation forward: it is ready for facilitation and Socra asks its probing question. */
export async function pullForward(useCaseId: string, itemId: string) {
  const item = await prisma.backlogItem.update({ where: { id: itemId }, data: { state: "probing" } });
  await addTrace(useCaseId, ...SESSION_EDGES.recommendation(item.title));
  await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "reviewed", summary: `The owner pulled “${item.title}” forward for a probing conversation`, by: "Owner" });
  const cap = item.group ? await prisma.capability.findFirst({ where: { useCaseId, label: item.group } }) : null;
  if (cap) await prisma.useCase.update({ where: { id: useCaseId }, data: { focus: cap.key } });
  await prisma.message.create({
    data: { useCaseId, role: "signal", agent: "Pulled forward", accent: "#f5c88a", content: `${item.title} is ready for a probing conversation. Nothing changes in the product until you decide.` },
  });
  if (agentsEnabled())
    await enqueue(
      useCaseId,
      "probe",
      `The owner pulled a recommendation forward (backlog item ${item.id}): "${item.title}" (${item.recKind || "consider"}). ${item.note}\nIts probing question: ${item.probe || "(write one)"}\nAsk it now, one question, with your suggestion. A yes makes it an approved decision and the item ready for the build (curate with includeInBuild); a no parks it.`,
      `backlog:${item.id}`,
    );
  else
    await prisma.message.create({
      data: { useCaseId, role: "muse", agent: "Socra · Suggested consideration", accent: "#f5c88a", content: `${item.title}. ${item.probe || "What would you like to do with this?"}` },
    });
  return item;
}

/** Socra moves its lens to a capability, as the owner asked. */
export async function focusCapability(useCaseId: string, key: string) {
  const cap = await prisma.capability.findFirst({ where: { useCaseId, key } });
  if (!cap) return null;
  await prisma.useCase.update({ where: { id: useCaseId }, data: { focus: key } });
  await prisma.message.create({
    data: {
      useCaseId,
      role: "muse",
      agent: "Socra · Product physician",
      accent: cap.color,
      content: `Let's work on ${cap.label.toLowerCase()}. ${cap.signal}`.trim(),
    },
  });
  if (agentsEnabled())
    await enqueue(useCaseId, "focus", `The owner moved the lens to ${cap.label}. Ask the most important open question about it, with your suggested answer, comparing it with what the leading products in this category have there.`);
  return cap;
}
