import { teamListensFor } from "@/lib/studio/coverage";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled, START_PROMPT } from "@/lib/agent/runner";
import { rememberDecision } from "@/lib/memory";
import { bumpReadiness, clip, personaVoice, isAffirmative, numberedOptions, pickedNumbers, proposalFrom, specialistByKey, suggestedOption } from "./core";
import { SESSION_EDGES, addTrace } from "./trace";
import { recordChange } from "./truthlog";
import { judgeYes, jevOutcome, tagJevCall } from "@/lib/jev";
import { itemAsk } from "./itemAsk";

const NO_AGENTS = "I've kept that. Socra switches on once Claude is signed in on Settings.";

/** Opens a product for Socra the first time it is looked at (or after an upgrade reset). */
export async function ensureStarted(useCaseId: string) {
  if (!agentsEnabled()) return;
  const { count } = await prisma.useCase.updateMany({ where: { id: useCaseId, started: false }, data: { started: true } });
  if (count) await enqueue(useCaseId, "start", START_PROMPT);
}

export type Speaker = { name?: string; role?: string };
/**
 * `about`: the backlog items / cards (backlog:<id>, move:<id>) the words answer, when someone replies in an
 * item's detail view or through an outside assistant. `replyTo`: the message (Socra's question) answered.
 */
export type SayOpts = { source?: string; author?: Speaker; to?: string; raw?: string; about?: string[]; replyTo?: string };

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
 * held in the backlog in their words. A reply to a specialist's statement goes to that specialist, and every
 * specialist listens: the ones whose open question areas the words touch join in (Doug, Nov 21).
 * Either way Socra hears it and carries it into the product truth. Every approval can be undone.
 */
export async function ownerSays(useCaseId: string, content: string, opts: SayOpts | string = {}) {
  const o: SayOpts = typeof opts === "string" ? { source: opts } : opts;
  const source = o.source || "Working session";
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const who = await whoSpoke(useCaseId, o.author);
  // An answer to one statement (Reply on a message in the conversation, or a question in an item's detail
  // view) answers that statement, not whatever was said last. A reply to a specialist goes to that specialist.
  const answered = o.replyTo ? await prisma.message.findFirst({ where: { id: o.replyTo, useCaseId, role: { in: ["muse", "agent"] } } }) : null;
  const specialist = o.to ? specialistByKey(o.to) : answered?.role === "agent" && answered.addressed ? specialistByKey(answered.addressed) : undefined;
  const focus = uc.focus ? await prisma.capability.findFirst({ where: { useCaseId, key: uc.focus } }) : null;
  const msg = await prisma.message.create({ data: { useCaseId, role: "user", agent: "You", content, author: who.name, authorRole: who.role, addressed: specialist?.key ?? "", raw: o.raw && o.raw !== content ? o.raw : "", replyTo: answered?.id ?? "" } });
  // What a yes or a number answers: Socra's (or a specialist's) words since anyone last spoke.
  const lastUser = await prisma.message.findFirst({ where: { useCaseId, role: "user", createdAt: { lt: msg.createdAt } }, orderBy: { createdAt: "desc" } });
  const since = answered
    ? [answered]
    : await prisma.message.findMany({
        where: { useCaseId, createdAt: { lt: msg.createdAt, ...(lastUser ? { gt: lastUser.createdAt } : {}) }, OR: [{ role: "muse" }, { role: "agent", addressed: { not: "" } }] },
        orderBy: { createdAt: "desc" },
      });
  // What these words are about: the items named, or the items the question they answer was about.
  const itemNodes = (o.about ?? []).filter((n) => /^(backlog|move):[a-z0-9]+$/i.test(n) || n === "prfaq");
  // (A new thought typed in the conversation is not an answer to the last question: it only takes the
  // question's items when it is a pick or a yes to that question, below.)
  let about = [...new Set([...itemNodes, ...(answered?.about ?? [])])];
  // Words given about an item (in its detail view, or naming it through the connector) answer it: they go onto
  // the item's record rather than becoming a new backlog item.
  const answersItem = itemNodes.length > 0 || (!!answered && answered.about.length > 0);
  const lastMuse = since[0] ?? (await prisma.message.findFirst({ where: { useCaseId, role: "muse", createdAt: { lt: msg.createdAt } }, orderBy: { createdAt: "desc" } }));
  await addTrace(useCaseId, ...SESSION_EDGES.ownerMessage(content));

  // A pick from the latest numbered options offered since anyone last spoke.
  const offered = since.find((m) => numberedOptions(m.content).length);
  const options = offered ? numberedOptions(offered.content) : [];
  const nums = options.length ? pickedNumbers(content) : null;
  let picked = nums ? options.filter((x) => nums.includes(x.n)) : [];
  // A bare yes approves only what was actually proposed: the option Socra marked as its suggestion,
  // or the yes/no proposal it last made. A yes to an open question or to unmarked options is held.
  const rulesYes = !specialist && !picked.length && isAffirmative(content);
  // What a yes would approve, if anything is on the table: Socra's marked option or its yes/no proposal.
  // Jev (TypeSafe) judges whether a short reply agrees to it and adds nothing new; when Jev is unsettled,
  // failing or off, the rules decide. Every call is logged beside the rules' answer (Settings > Jev).
  const marked = !specialist && !picked.length && offered ? suggestedOption(offered.content) : null;
  const onTable = specialist || picked.length ? "" : offered ? (options.find((x) => x.n === marked)?.label ?? "") : lastMuse ? proposalFrom(lastMuse.content) : "";
  const judged = onTable ? await judgeYes(useCaseId, onTable, content, rulesYes) : { yes: rulesYes, callId: null };
  const yes = judged.yes;
  const suggested = yes && offered ? suggestedOption(offered.content) : null;
  if (suggested) picked = options.filter((x) => x.n === suggested);
  const proposed = yes && !picked.length && !offered && lastMuse ? proposalFrom(lastMuse.content) : "";
  const unclearYes = yes && !picked.length && !proposed;
  const approved = !specialist && (picked.length > 0 || !!proposed);

  if (approved || unclearYes) about = [...new Set([...about, ...((offered ?? lastMuse)?.about ?? [])])];
  if (about.length) await prisma.message.update({ where: { id: msg.id }, data: { about } });

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
    if (about.length) await prisma.message.updateMany({ where: { useCaseId, ref: decision.id, agent: "Decision captured" }, data: { about } });
    for (const node of about) await recordChange(useCaseId, { node, kind: "answered", summary: `${who.said} ${picked.length ? "chose" : "approved"}: ${proposal}`, after: proposal, causes: [`decision:${decision.id}`, `msg:${msg.id}`], by: who.name || who.role });
    rememberDecision(uc, "muse", `${who.said} approved: ${proposal}`, "studio:yes");
    await tagJevCall(judged.callId, `decision:${decision.id}`);
    await recordChange(useCaseId, { node: `decision:${decision.id}`, kind: "approved", summary: `${who.said} ${picked.length ? "chose" : "approved"}: ${proposal}`, after: proposal, causes: [`msg:${msg.id}`, ...((offered ?? lastMuse) ? [`msg:${(offered ?? lastMuse)!.id}`] : [])], by: who.name || who.role });
    if (agentsEnabled())
      await enqueue(
        useCaseId,
        "user",
        `${who.said} said: "${content}"\n\nThe Studio recorded it as an approved decision (id ${decision.id}): "${proposal}"${focus ? `, in ${focus.label}` : ""}, and moved its readiness forward. They can undo it.${prfaqNote(about, msg.id)} Carry it into the product truth (PRFAQ, the spec sections it touches, the capability's items from [assumed] to [confirmed] where it applies)${about.length ? `, and into the item it answers (${about.join(", ")}): its details and acceptance criteria; reply and ask the next question with say about ${JSON.stringify(about)}` : " and ask the next question"}.\n\n${await teamListensFor(useCaseId, { about, msg: `msg:${msg.id}` })}\n\n${personaVoice(who.role)}`,
        [`decision:${decision.id}`, ...about].join(" "),
      );
  } else if (unclearYes) {
    // A bare yes with nothing single on the table to approve: it answers the last question. Nothing is
    // approved and nothing is held (a lone "yes" is not a requirement); Socra reads it in context.
    if (agentsEnabled())
      await enqueue(
        useCaseId,
        "user",
        `${who.said} said: "${content}"\n\nNothing approved: your last message had ${offered ? "numbered options without a marked suggestion" : "no single yes/no proposal"}. Read it as their answer to your last question. If it is unclear what they agreed to, ask in one line which one, by number, and say which you suggest.\n\n${personaVoice(who.role)}`,
        `msg:${msg.id}`,
      );
  } else if (answersItem && !specialist) {
    for (const node of about) await recordChange(useCaseId, { node, kind: "answered", summary: `${who.said} answered: “${clip(content, 300)}”`, after: content, causes: [`msg:${msg.id}`, ...(answered ? [`msg:${answered.id}`] : [])], by: who.name || who.role });
    await prisma.message.create({ data: { useCaseId, role: "signal", agent: "Answer kept on the item", accent: "#a9d8ff", about, content: "Your answer is on the item's record. Socra is writing it into the item and the spec." } });
    if (agentsEnabled()) {
      const titles = await itemTitles(useCaseId, about);
      await enqueue(
        useCaseId,
        "user",
        `${who.said} answered about ${titles}${answered ? ` (your question: “${clip(answered.content, 400)}”)` : ""}: "${content}"\n\n${about.includes("prfaq") ? prfaqNote(about, msg.id).trim() : "Write the answer into the item (the card's details and acceptance criteria with upsert_move, or the backlog item) and the spec sections it touches."} Reply in one line with say about ${JSON.stringify(about)}; if something a builder needs is still missing, ask the next question the same way (numbered options, your suggestion marked).\n\n${await teamListensFor(useCaseId, { about, msg: `msg:${msg.id}` })}\n\n${personaVoice(who.role)}`,
        [`msg:${msg.id}`, ...about].join(" "),
      );
    }
  } else {
    const item = await prisma.backlogItem.create({
      data: { useCaseId, title: clip(content, 140), note: content.length > 140 ? content : "", kind: "capture", group: focus?.label ?? "Unsorted signal", source: who.name ? `${source} · ${who.name}` : source, state: "held" },
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
          ? answered
            ? `${who.said} replied to the ${specialist.name}'s statement (msg:${answered.id}): “${clip(answered.content, 600)}”\n\nTheir reply: "${content}"\n\nThe Studio held it in the backlog (item ${item.id}). Send \`${specialist.agent}\` with the Agent tool, giving it the statement and the reply. As the ${specialist.name}${specialist.key === "domain" ? " (named for this product's field)" : ""}, through mcp__studio__share_finding, it opens its own skill (.claude/skills/${specialist.skill}/SKILL.md), records what the reply settled in its areas (record_coverage), acknowledges in one line what it understood, then asks at most one follow-up question from its still-open areas (numbered options, its suggestion marked "(suggested)"), and nothing more. If the reply decides something (a new product name, a rule, a scope choice), carry it out now rather than only acknowledging it: rename with set_product (owner_asked true) when they gave a name, record_decision for a choice, and the spec sections it touches; then signal what changed in one line ("Renamed ClaimSnap to X"). If it changes what another specialist said, have that specialist revisit only that point. Do not re-run the whole team.\n\n${personaVoice(who.role)}`
            : `${who.said} asked the ${specialist.name} directly: "${content}"\n\nThe Studio held it in the backlog (item ${item.id}). Send \`${specialist.agent}\` with the Agent tool to answer it; the answer reaches them through mcp__studio__share_finding as the ${specialist.name}${specialist.key === "domain" ? " (named for this product's field)" : ""}. Then carry what it changes into the product truth.\n\n${personaVoice(who.role)}`
          : `${who.said} said: "${content}"${answered ? `\n\nIt is a reply to your statement (msg:${answered.id}): “${clip(answered.content, 600)}”. Acknowledge in one line what you understood and act on it: if it decides something (a new product name, a rule, a scope choice), carry it out now (rename with set_product owner_asked true, record_decision, the spec sections it touches) and signal what changed; then ask at most one follow-up if something is still unclear.` : ""}\n\nThe Studio held it in the backlog in their words (item ${item.id}). Curate it and carry its meaning into the product truth. Then:\n${itemAsk({ node: `backlog:${item.id}`, title: item.title, text: content, stage: "said", by: who.name || who.role })}\n\n${await teamListensFor(useCaseId, { about: [`backlog:${item.id}`], msg: `msg:${msg.id}` })}\n\n${personaVoice(who.role)}`,
        `msg:${msg.id} backlog:${item.id}`,
      );
  }
  if (!agentsEnabled()) await prisma.message.create({ data: { useCaseId, role: "muse", agent: "Socra · Product physician", content: NO_AGENTS } });
  await prisma.useCase.update({ where: { id: useCaseId }, data: { updatedAt: new Date() } });
  return { approved, picked: picked.map((x) => x.n) };
}

/** “Title” (backlog:<id>) for each item node, for prompts. */
async function itemTitles(useCaseId: string, nodes: string[]) {
  const ids = (k: string) => nodes.filter((n) => n.startsWith(`${k}:`)).map((n) => n.slice(k.length + 1));
  const [b, m] = await Promise.all([
    prisma.backlogItem.findMany({ where: { useCaseId, id: { in: ids("backlog") } }, select: { id: true, title: true } }),
    prisma.move.findMany({ where: { useCaseId, id: { in: ids("move") } }, select: { id: true, title: true } }),
  ]);
  return [...(nodes.includes("prfaq") ? ["the PRFAQ (prfaq)"] : []), ...b.map((x) => `“${x.title}” (backlog:${x.id})`), ...m.map((x) => `“${x.title}” (move:${x.id})`)].join(" and ") || nodes.join(", ");
}

/** An answer about the PRFAQ is written into it, with the answer's message as the new line's source (Doug, Nov 21). */
function prfaqNote(about: string[], msgId: string) {
  return about.includes("prfaq")
    ? ` It answers a question about the PRFAQ: write it in with update_prfaq (the studio-prfaq skill's rules): replace the Missing line it answers with their answer in press-release voice, ending with [^m:${msgId}], and keep every other line, marker and Missing line exactly as it is.`
    : "";
}

/**
 * A screen asks Socra something on a person's behalf (the Story map's "firm up this link", "look for
 * links"). The conversation shows one short line saying what happened; the long request goes to Socra
 * only, and nothing is filed in the backlog as a thought.
 */
export async function askSocra(useCaseId: string, o: { label: string; line: string; prompt: string; cause?: string }) {
  await prisma.message.create({ data: { useCaseId, role: "signal", agent: o.label, accent: "#a9d8ff", content: o.line } });
  if (agentsEnabled()) await enqueue(useCaseId, "user", o.prompt, o.cause ?? "");
  else await prisma.message.create({ data: { useCaseId, role: "muse", agent: "Socra · Product physician", content: NO_AGENTS } });
  await prisma.useCase.update({ where: { id: useCaseId }, data: { updatedAt: new Date() } });
}

/** Undo an approval made by a yes or a pick: as if it was never said. The decision goes; Socra hears it. */
export async function undoApproval(useCaseId: string, decisionId: string, author?: Speaker) {
  const d = await prisma.decision.findFirst({ where: { id: decisionId, useCaseId } });
  if (!d) return null;
  const who = await whoSpoke(useCaseId, author);
  await prisma.decision.delete({ where: { id: d.id } });
  await jevOutcome(`decision:${d.id}`, "undone");
  await prisma.message.updateMany({ where: { useCaseId, ref: d.id, agent: "Decision captured" }, data: { agent: "Approval undone", accent: "#f5c88a", content: `Undone: ${d.text}. Nothing was carried forward.` } });
  await recordChange(useCaseId, { node: `decision:${d.id}`, kind: "undone", summary: `${who.said} undid the approval: ${d.text}`, before: d.text, by: who.name || who.role });
  if (agentsEnabled())
    await enqueue(useCaseId, "decision", `${who.said} undid an approval: "${d.text}" (decision ${d.id}, now removed). Take it back out of the product truth wherever you carried it in, and ask about it again later only if it matters.`);
  return d;
}

/** A thought caught away from the desk (phone, voice, the sidebar). Held, then curated by Socra. */
export async function captureThought(useCaseId: string, text: string, source = "Phone / voice") {
  const item = await prisma.backlogItem.create({
    data: { useCaseId, title: clip(text, 140), note: text.length > 140 ? text : "", kind: "capture", group: "Unsorted signal", source, state: "held" },
  });
  await addTrace(useCaseId, ...SESSION_EDGES.capture(text));
  await recordChange(useCaseId, { node: `backlog:${item.id}`, kind: "added", summary: `A thought was captured (${source})`, after: text, by: source });
  // Captures from anywhere (the phone, the sidebar, Muse or another assistant through the connector) get the
  // same treatment as anything said in the Studio: the right specialist looks, Socra asks what is missing.
  if (agentsEnabled())
    await enqueue(
      useCaseId,
      "user",
      `A thought was captured (${source}, backlog item ${item.id}): "${text}". Curate it with the others waiting (if several belong together, say so in one line). Then, for this item:\n${itemAsk({ node: `backlog:${item.id}`, title: item.title, text, stage: "captured", by: source })}\n\n${await teamListensFor(useCaseId, { about: [`backlog:${item.id}`] })}\nIf it came through an outside assistant, the person reads your questions there: keep each one short and self-contained.`,
      `backlog:${item.id}`,
    );
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
      `The owner pulled a recommendation forward (backlog item ${item.id}): "${item.title}" (${item.recKind || "consider"}). ${item.note}\nIts probing question: ${item.probe || "(write one)"}\nAsk it now, one question, with your suggestion, with say about ["backlog:${item.id}"] so it shows on the item too. A yes makes it an approved decision and the item ready for the build (curate with includeInBuild); a no parks it.`,
      `backlog:${item.id}`,
    );
  else await prisma.message.create({ data: { useCaseId, role: "muse", agent: "Socra · Product physician", about: [`backlog:${item.id}`], content: NO_AGENTS } });
  return item;
}

/** Socra moves its lens to a capability, as the owner asked. */
export async function focusCapability(useCaseId: string, key: string) {
  const cap = await prisma.capability.findFirst({ where: { useCaseId, key } });
  if (!cap) return null;
  await prisma.useCase.update({ where: { id: useCaseId }, data: { focus: key } });
  await prisma.message.create({
    // A plain signal, not words put in Socra's mouth: Socra's own question follows from its turn.
    data: { useCaseId, role: "signal", agent: "Lens moved", accent: cap.color, content: `Now working on ${cap.label.toLowerCase()}.` },
  });
  if (agentsEnabled())
    await enqueue(useCaseId, "focus", `The owner moved the lens to ${cap.label}. Ask the most important open question about it, with your suggested answer, comparing it with what the leading products in this category have there.`);
  return cap;
}
