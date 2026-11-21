import { prisma } from "@/lib/db";
import { brand, ASSISTANT_NAME } from "@/lib/brand";
import { isAffirmative, pickedNumbers } from "@/lib/studio/core";
import { changeImpact } from "@/lib/studio/impact";
import { nodesForIds, truthView } from "@/lib/studio/truthlog";
import { itemTrace } from "@/lib/studio/itemTrace";
import { BOARD_LABEL, type BoardStatus } from "@/lib/studio/board";
import { agentsView } from "@/lib/agentService";
import { LEVEL_LABEL, ROLE_RULES, TOOLS, TOOL_NAMES, effectiveLevel, gate, inScope, needsConfirm, type ToolName } from "./catalog";
import { stopPreview, startPreview } from "@/lib/preview";
import { asksSomething, questionOf } from "@/lib/notifyFormat";
import type { Access } from "./tokens";
import { POST as createUseCase } from "@/app/api/use-cases/route";
import { POST as captureRoute } from "@/app/api/use-cases/[id]/capture/route";
import { POST as observationRoute } from "@/app/api/use-cases/[id]/observations/route";
import { POST as messageRoute } from "@/app/api/use-cases/[id]/messages/route";
import { PATCH as decisionRoute } from "@/app/api/use-cases/[id]/decisions/[did]/route";
import { PATCH as backlogRoute } from "@/app/api/use-cases/[id]/backlog/[itemId]/route";
import { PATCH as moveRoute } from "@/app/api/use-cases/[id]/moves/[mid]/route";
import { POST as generateRoute } from "@/app/api/use-cases/[id]/generate/route";
import { PATCH as useCaseRoute } from "@/app/api/use-cases/[id]/route";
import { PATCH as undoRoute } from "@/app/api/use-cases/[id]/messages/route";
import { POST as newCardRoute } from "@/app/api/use-cases/[id]/moves/route";
import { GET as cardRoute } from "@/app/api/use-cases/[id]/moves/[mid]/route";
import { POST as cardFilesRoute } from "@/app/api/use-cases/[id]/moves/[mid]/files/route";
import { PATCH as specRoute } from "@/app/api/use-cases/[id]/spec/[key]/route";
import { POST as restoreRoute } from "@/app/api/use-cases/[id]/spec/restore/route";
import { GET as storyMapGet, POST as storyMapRoute } from "@/app/api/use-cases/[id]/story-map/route";
import { GET as truthRoute } from "@/app/api/use-cases/[id]/truth/route";
import { POST as memberAdd, DELETE as memberRemove } from "@/app/api/use-cases/[id]/members/route";
import { PATCH as agentRoute } from "@/app/api/use-cases/[id]/agents/[key]/route";
import { POST as agentApprovalRoute } from "@/app/api/use-cases/[id]/agents/approvals/[aid]/route";
import { POST as feedbackRoute } from "@/app/api/use-cases/[id]/feedback/route";
import { POST as retryRoute } from "@/app/api/use-cases/[id]/retry/route";
import { POST as syncRoute } from "@/app/api/use-cases/[id]/sync/route";

// Runs the catalog's tools. Every write goes through the same route the Studio's own screens use, so the
// rules (a yes approves only a real proposal, changes ripple to Socra, the Truth Graph logs who and why)
// hold exactly as they do on screen.

export class ToolError extends Error {}
export type ToolResult = { ok: true; data: unknown } | { ok: false; needsConfirmation: true; preview: unknown; how: string } | { ok: false; error: string; status: number };

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;
async function call<P>(h: Handler<P>, params: P, method: string, body?: unknown, query = ""): Promise<Record<string, unknown>> {
  const url = `http://studio.internal/connector${query}`;
  const req = body instanceof FormData ? new Request(url, { method, body }) : new Request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await h(req, { params: Promise.resolve(params) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ToolError(String(data.error ?? `That didn't work (${res.status}).`));
  return data;
}

async function scopedUseCase(access: Access, id: string) {
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc || !inScope(access.customer, uc.customer)) throw new ToolError("No use case with that id for this access.");
  return uc;
}
const scopeWhere = (access: Access, customer?: string) => {
  const c = access.customer || customer || "";
  return c ? { customer: { equals: c, mode: "insensitive" as const } } : {};
};
const by = (a: Access, client: string) => `${a.person || "Someone"} (via ${client})`.slice(0, 80);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");

async function waiting(useCaseIds: string[]) {
  const [open, review] = await Promise.all([
    prisma.decision.findMany({ where: { useCaseId: { in: useCaseIds }, status: "open" }, orderBy: { createdAt: "asc" } }),
    prisma.move.findMany({ where: { useCaseId: { in: useCaseIds }, status: "review" }, orderBy: { position: "asc" } }),
  ]);
  return { open, review };
}

export async function runTool(tool: ToolName, raw: unknown, access: Access, client: string): Promise<ToolResult> {
  const g = gate(tool, access);
  if (!g.ok) return { ok: false, error: g.error, status: 403 };
  const parsed = TOOLS[tool].input.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: `Check the input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`, status: 400 };
  const input = parsed.data as Record<string, unknown> & { use_case_id?: string };
  const isApproval = (t: string) => isAffirmative(t) || pickedNumbers(t) !== null;
  try {
    const uc = input.use_case_id ? await scopedUseCase(access, input.use_case_id) : null;
    if (needsConfirm(tool, input, isApproval)) {
      return { ok: false, needsConfirmation: true, preview: await preview(tool, input, uc!.id), how: "Nothing has changed yet. Tell the person what this would do; call again with confirm: true only after they say yes to it." };
    }
    return { ok: true, data: await run(tool, input, uc, access, client) };
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message, status: /No use case/.test(e.message) ? 404 : 400 };
    console.error("connector tool", tool, e);
    return { ok: false, error: "Something went wrong in the Studio.", status: 500 };
  }
}

async function preview(tool: ToolName, input: Record<string, unknown>, ucId: string) {
  if (tool === "decide" || (tool === "change_item" && input.action === "reopen_decision")) {
    const key = tool === "decide" ? String(input.decision_id) : String(input.item_id);
    const d = await prisma.decision.findFirst({ where: { id: key, useCaseId: ucId } });
    if (!d) throw new ToolError("No decision with that id in this use case.");
    const touches = await changeImpact(ucId, { decisionId: d.id });
    const would = tool === "decide" ? `${input.decision === "approve" ? "Approve" : "Reject"}: “${brand(d.text)}”${input.comment ? ` with the comment “${input.comment}”` : ""}` : `Reopen the decision “${brand(d.text)}” (now ${d.status})`;
    return { would, touches };
  }
  if (tool === "change_item" && input.action === "withdraw") {
    const b = await prisma.backlogItem.findFirst({ where: { id: String(input.item_id), useCaseId: ucId } });
    if (!b) throw new ToolError("No backlog item with that id in this use case.");
    return { would: `Withdraw “${b.title}”. It stays in history and ${ASSISTANT_NAME} updates what it touched.` };
  }
  if (tool === "change_item" && input.action === "send_back_card") {
    const m = await prisma.move.findFirst({ where: { id: String(input.item_id), useCaseId: ucId } });
    if (!m) throw new ToolError("No board card with that id in this use case.");
    return { would: `Send “${m.title}” back from ${BOARD_LABEL[m.status as BoardStatus] ?? m.status} to ${BOARD_LABEL.ready}.${input.why ? ` Reason: ${input.why}` : ""}` };
  }
  if (tool === "build") {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: ucId } });
    const [decisions, items] = await Promise.all([
      prisma.decision.findMany({ where: { useCaseId: ucId, status: "approved", includeInBuild: true, builtInVersion: 0 }, select: { text: true } }),
      prisma.backlogItem.findMany({ where: { useCaseId: ucId, includeInBuild: true, builtInVersion: 0 }, select: { title: true } }),
    ]);
    if (uc.generateBusy) return { would: "A build is already running.", status: uc.generateStatus };
    const mode = input.mode === "redesign" ? "Redesign the look of" : input.mode === "fresh" ? "Set the current app aside and build from scratch" : "Build";
    return { would: `${mode} version ${uc.generateCount + 1} with Claude Code.`, newDecisions: decisions.map((d) => brand(d.text)), newItems: items.map((i) => i.title), takes: "Usually 6 to 20 minutes. Ask for the brief to see how it is going." };
  }
  if (tool === "change_item" && input.action === "undo_approval") {
    const d = await prisma.decision.findFirst({ where: { id: String(input.item_id), useCaseId: ucId } });
    if (!d) throw new ToolError("No decision with that id in this use case.");
    return { would: `Undo the approval of “${brand(d.text)}”. It goes back to being an open question for ${ASSISTANT_NAME}.` };
  }
  if (tool === "board_card") {
    const m = await prisma.move.findFirst({ where: { id: String(input.card_id ?? ""), useCaseId: ucId } });
    if (!m) throw new ToolError("No board card with that id in this use case.");
    return { would: `Move “${m.title}” from ${BOARD_LABEL[m.status as BoardStatus] ?? m.status} to Done. That says a person tried it and it works.${input.why ? ` Reason: ${input.why}` : ""}` };
  }
  if (tool === "review_spec") {
    const sec = await prisma.specSection.findFirst({ where: { useCaseId: ucId, key: String(input.section) } });
    if (!sec) throw new ToolError("No spec section with that key. See read_spec part prd or trd.");
    return { would: `Mark ${sec.ref} “${sec.title}” for removal. ${ASSISTANT_NAME} takes it out of the spec and says what that changes.`, now: brand(sec.content).slice(0, 800) };
  }
  if (tool === "restore_spec") {
    const rev = await prisma.specRevision.findFirst({ where: { useCaseId: ucId, version: Number(input.version) } });
    if (!rev) throw new ToolError("No spec version with that number. See read_spec part spec_versions.");
    return { would: `Put the PRD and TRD back to version ${rev.version} (${rev.reason || "saved"} on ${day(rev.createdAt)}). The current version stays in history.` };
  }
  if (tool === "story_map") return { would: `Remove the Story map link ${input.link_id}. ${ASSISTANT_NAME} hears it was removed.` };
  if (tool === "people") {
    const m = await prisma.member.findFirst({ where: { useCaseId: ucId, OR: [{ id: String(input.member_id ?? "") }, { name: String(input.name ?? "") }] } });
    if (!m) throw new ToolError("Nobody by that id or name on this use case. See read_spec part members.");
    return { would: `Remove ${m.name} (${m.role}) from this use case. What they said stays in the history.` };
  }
  if (tool === "agent_control") return { would: `${input.action === "approve" ? "Approve" : "Reject"} the agent approval ${input.approval_id}${input.comment ? ` with the comment “${input.comment}”` : ""}.` };
  if (tool === "sync") {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: ucId } });
    return input.to === "git"
      ? { would: `Push the latest build and package to ${uc.repoUrl || "the Git repository (none set yet: set repo_url with update_use_case first)"}, branch ${uc.gitBranch}.` }
      : { would: `Send the Board's cards to the Linear team ${uc.linearTeam || "(none set yet: set linear_team with update_use_case first)"}.` };
  }
  if (tool === "archive_use_case") {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: ucId } });
    return { would: `Archive “${uc.name}”${uc.customer ? ` (${uc.customer})` : ""}. It leaves the home list; nothing is lost and it can be restored any time.` };
  }
  if (tool === "delete_use_case") {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: ucId }, include: { _count: { select: { messages: true, decisions: true, backlog: true, moves: true, documents: true, spec: true } } } });
    return {
      would: `Delete “${uc.name}”${uc.customer ? ` (${uc.customer})` : ""} for good. This cannot be undone.`,
      loses: { messages: uc._count.messages, decisions: uc._count.decisions, held_thoughts: uc._count.backlog, board_cards: uc._count.moves, documents: uc._count.documents, spec_sections: uc._count.spec, versions_built: uc.generateCount },
      safer: "archive_use_case hides it from the home list and keeps everything.",
      to_delete: `Send confirm: true and confirm_name: "${uc.name}" only after the person says to delete it for good.`,
    };
  }
  if (tool === "answer") return { would:`Say “${input.text}” to ${ASSISTANT_NAME}. A bare yes or a number approves what ${ASSISTANT_NAME} last proposed.`, lastFromSocra: await lastSocra(ucId) };
  return {};
}

/** Socra's latest question in each conversation that nobody has answered yet. */
async function socraAsks(ids: string[], names: Map<string, string>) {
  const out: { use_case_id: string; use_case?: string; question: string; options: string[]; asked: string }[] = [];
  for (const id of ids) {
    const m = await prisma.message.findFirst({ where: { useCaseId: id, role: { in: ["muse", "user"] } }, orderBy: { createdAt: "desc" } });
    if (!m || m.role !== "muse" || !asksSomething(m.content)) continue;
    const q = questionOf(brand(m.content));
    out.push({ use_case_id: id, use_case: names.get(id), question: q.question, options: q.options, asked: day(m.createdAt) });
  }
  return out;
}

/** Socra's open questions about backlog items and Board cards (from each item's own record). */
async function itemAsks(ids: string[], names: Map<string, string>) {
  const out: { use_case_id: string; use_case?: string; item_id: string; item: string; question_id: string; question: string; options: string[]; asked: string }[] = [];
  for (const id of ids) {
    const recent = await prisma.message.findMany({ where: { useCaseId: id, role: { in: ["muse", "agent"] }, NOT: { about: { isEmpty: true } }, createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 60, select: { about: true } });
    const seen = new Set<string>();
    for (const node of recent.flatMap((m) => m.about)) {
      const t = await itemTrace(id, node);
      if (t.nodes.some((n) => seen.has(n))) continue;
      t.nodes.forEach((n) => seen.add(n));
      if (!t.question) continue;
      const [kind, itemId] = node.split(":");
      const title = kind === "backlog" ? (await prisma.backlogItem.findUnique({ where: { id: itemId }, select: { title: true } }))?.title : (await prisma.move.findUnique({ where: { id: itemId }, select: { title: true } }))?.title;
      const q = questionOf(brand(t.question.text));
      out.push({ use_case_id: id, use_case: names.get(id), item_id: node, item: title ?? node, question_id: t.question.messageId, question: q.question, options: q.options, asked: day(new Date(t.question.at)) });
    }
  }
  return out;
}

async function lastSocra(ucId: string) {
  const m = await prisma.message.findFirst({ where: { useCaseId: ucId, role: { in: ["muse", "agent"] } }, orderBy: { createdAt: "desc" } });
  return m ? brand(m.content).slice(0, 1500) : "";
}

async function run(tool: ToolName, input: Record<string, unknown>, uc: Awaited<ReturnType<typeof scopedUseCase>> | null, access: Access, client: string): Promise<unknown> {
  const s = (k: string) => (input[k] === undefined ? undefined : String(input[k]));
  switch (tool) {
    case "list_use_cases": {
      const rows = await prisma.useCase.findMany({ where: { ...scopeWhere(access, s("customer")), ...(input.include_archived ? {} : { archivedAt: null }) }, orderBy: { updatedAt: "desc" }, take: 200 });
      const w = await waiting(rows.map((r) => r.id));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        customer: r.customer,
        business_area: r.businessArea,
        summary: r.summary || r.validatedUseCase || r.statement,
        versions_built: r.generateCount,
        waiting_on_people: w.open.filter((d) => d.useCaseId === r.id).length + w.review.filter((m) => m.useCaseId === r.id).length,
        updated: day(r.updatedAt),
        archived: r.archivedAt ? day(r.archivedAt) : undefined,
      }));
    }
    case "whats_waiting": {
      const rows = uc ? [uc] : await prisma.useCase.findMany({ where: { ...scopeWhere(access), archivedAt: null }, select: { id: true, name: true, customer: true, generateBusy: true, generateStatus: true } });
      const names = new Map(rows.map((r) => [r.id, `${r.customer ? `${r.customer} · ` : ""}${r.name}`]));
      const w = await waiting(rows.map((r) => r.id));
      return {
        decisions: w.open.map((d) => ({ use_case_id: d.useCaseId, use_case: names.get(d.useCaseId), decision_id: d.id, question: brand(d.text), from: brand(d.agent), options: d.options, since: day(d.createdAt) })),
        to_review: w.review.map((m) => ({ use_case_id: m.useCaseId, use_case: names.get(m.useCaseId), card_id: m.id, card: m.title, why: m.moveReason })),
        socra_asks: await socraAsks(rows.map((r) => r.id), names),
        item_questions: await itemAsks(rows.map((r) => r.id), names),
        builds_running: rows.filter((r) => r.generateBusy).map((r) => ({ use_case_id: r.id, use_case: names.get(r.id), status: r.generateStatus })),
      };
    }
    case "brief": {
      const id = uc!.id;
      const [decisions, backlog, moves, messages] = await Promise.all([
        prisma.decision.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } }),
        prisma.backlogItem.findMany({ where: { useCaseId: id, kind: { not: "distraction" } }, orderBy: { createdAt: "asc" } }),
        prisma.move.findMany({ where: { useCaseId: id }, orderBy: { position: "asc" } }),
        prisma.message.findMany({ where: { useCaseId: id, role: { in: ["user", "muse", "agent"] } }, orderBy: { createdAt: "desc" }, take: 8 }),
      ]);
      const board = Object.fromEntries(Object.entries(BOARD_LABEL).map(([k, l]) => [l, moves.filter((m) => m.status === k).length]));
      return {
        name: uc!.name,
        customer: uc!.customer,
        business_area: uc!.businessArea,
        what_it_is: uc!.validatedUseCase || uc!.statement || uc!.summary || uc!.description.slice(0, 600),
        decided: decisions.filter((d) => d.status === "approved").slice(-10).map((d) => brand(d.text)),
        waiting_on_people: decisions.filter((d) => d.status === "open").map((d) => ({ decision_id: d.id, question: brand(d.text), options: d.options })),
        held_thoughts: backlog.filter((b) => b.state === "held").slice(-8).map((b) => ({ id: b.id, title: b.title })),
        board,
        build: { versions_built: uc!.generateCount, last_built: day(uc!.lastGeneratedAt), running: uc!.generateBusy, status: uc!.generateStatus },
        latest_conversation: messages.reverse().map((m) => ({ who: m.role === "user" ? m.author || "Owner" : brand(m.agent || ASSISTANT_NAME), said: brand(m.content).slice(0, 1200), at: day(m.createdAt) })),
      };
    }
    case "why_changed": {
      const view = await truthView(uc!.id);
      const about = (s("about") ?? "").toLowerCase();
      const rows = (view?.timeline ?? []).filter((c) => !about || c.node.toLowerCase() === about || `${c.title} ${c.summary}`.toLowerCase().includes(about));
      return rows.slice(0, Number(input.limit ?? 15)).map((c) => ({
        when: day(new Date(c.createdAt)),
        what: brand(c.title),
        change: brand(c.summary),
        by: brand(c.by),
        before: c.before,
        after: c.after,
        because: c.because.map((b) => `${brand(b.title)} (${b.relation}, ${b.statement})`),
        affects: c.affects.map((a) => brand(a.title)),
      }));
    }
    case "read_spec": {
      const id = uc!.id;
      const part = s("part");
      if (part === "prfaq") return { prfaq: brand(uc!.prfaq) || "Not written yet." };
      if (part === "story_map") return call(storyMapGet, { id }, "GET");
      if (part === "truth_graph") {
        const t = await call(truthRoute, { id }, "GET");
        delete t.schema;
        return t;
      }
      if (part === "decisions") {
        const rows = await prisma.decision.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } });
        return rows.map((d) => ({ id: d.id, text: brand(d.text), status: d.status, capability: d.capability, from: brand(d.agent), options: d.options, answer: d.answer, in_next_build: d.includeInBuild && !d.builtInVersion, built_in_version: d.builtInVersion || undefined, since: day(d.createdAt) }));
      }
      if (part === "members") return (await prisma.member.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } })).map((m) => ({ id: m.id, name: m.name, role: m.role }));
      if (part === "documents") {
        const rows = await prisma.document.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "desc" } });
        return rows.map((d) => ({ id: d.id, file: d.fileName, type: d.mimeType, bytes: d.sizeBytes, kind: d.kind, status: d.status, summary: d.summary || d.description, card_id: d.moveId || undefined, added: day(d.createdAt) }));
      }
      if (part === "evidence") {
        const rows = await prisma.evidence.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "desc" }, take: 200 });
        return rows.map((e) => ({ id: e.id, source: e.source, type: e.type, insight: brand(e.insight), confidence: e.confidence, trace: e.trace, added: day(e.createdAt) }));
      }
      if (part === "spec_versions") {
        const rows = await prisma.specRevision.findMany({ where: { useCaseId: id }, orderBy: { version: "desc" }, select: { version: true, reason: true, diff: true, createdAt: true } });
        return rows.map((r) => ({ version: r.version, reason: r.reason, changes: r.diff.slice(0, 1500), saved: day(r.createdAt) }));
      }
      if (part === "conversation") {
        const rows = await prisma.message.findMany({ where: { useCaseId: id, role: { in: ["user", "muse", "agent"] } }, orderBy: { createdAt: "desc" }, take: Number(input.limit ?? 50) });
        return rows.reverse().map((m) => ({ who: m.role === "user" ? m.author || "Owner" : brand(m.agent || ASSISTANT_NAME), said: brand(m.content), at: day(m.createdAt) }));
      }
      if (part === "prd" || part === "trd") {
        const rows = await prisma.specSection.findMany({ where: { useCaseId: id, tab: part }, orderBy: { position: "asc" } });
        return rows.map((r) => ({ ref: r.ref, key: r.key, title: r.title, status: r.status, basis: r.basis, content: brand(r.content) }));
      }
      if (part === "backlog") {
        const rows = await prisma.backlogItem.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } });
        return rows.map((b) => ({ id: b.id, title: b.title, note: b.note, state: b.state, group: b.group, withdrawn: b.kind === "distraction", in_next_build: b.includeInBuild && !b.builtInVersion }));
      }
      const rows = await prisma.move.findMany({ where: { useCaseId: id }, orderBy: { position: "asc" } });
      return rows.map((m) => ({ id: m.id, title: m.title, column: BOARD_LABEL[m.status as BoardStatus] ?? m.status, moved_by: brand(m.movedBy), why: m.moveReason }));
    }
    case "agent_status": {
      const v = await agentsView(uc!.id);
      return {
        agents: v.agents.map((a) => ({ key: a.key, name: a.name, purpose: a.purpose, status: a.status, persona: a.persona ? a.personaText || "on" : "off", model: a.model, tools: a.tools })),
        runs: v.runs,
        approvals: v.approvals,
        note: v.note,
      };
    }
    case "capture": {
      const item = (await call(captureRoute, { id: uc!.id }, "POST", { text: s("text"), source: by(access, client) })) as { id?: string };
      return { held: true, item_id: item.id ? `backlog:${item.id}` : undefined, next: `${ASSISTANT_NAME} is having the right specialist look at it and will ask what is missing. Read the questions in a minute with whats_waiting (item_questions) and answer with answer (item_id, question_id).` };
    }
    case "add_evidence":
      return call(observationRoute, { id: uc!.id }, "POST", { kind: s("kind") ?? "observation", text: s("text") });
    case "start_use_case": {
      const created = await call(createUseCase as unknown as Handler<Record<string, never>>, {}, "POST", {
        customer: access.customer || s("customer") || "",
        name: s("name") ?? "",
        businessArea: s("business_area") ?? "",
        summary: s("summary") ?? "",
        description: s("description") ?? "",
        author: { name: access.person || "", role: access.role },
      });
      return { use_case_id: created.id, name: created.name, next: `${ASSISTANT_NAME} is opening it with one question. Ask for the brief in a minute.` };
    }
    case "item_trace": {
      const raw = s("item_id") ?? "";
      const node = /^(backlog|move):/.test(raw) ? raw : (await nodesForIds(uc!.id, [raw]))[0];
      if (!node || !/^(backlog|move):/.test(node)) throw new ToolError("No such backlog item or card in this use case.");
      const t = await itemTrace(uc!.id, node);
      return {
        item_id: node,
        open_question: t.question ? { question_id: t.question.messageId, from: t.question.who, ...questionOf(brand(t.question.text)) } : null,
        working_on_it: t.working,
        counts: t.counts,
        timeline: t.entries.map((e) => ({ at: e.at, what: e.kind, who: e.who, text: brand(e.text).slice(0, 1500), ...(e.detail?.loaded ? { skills_loaded: e.detail.loaded, skills_used: e.detail.skills, specialists_sent: e.detail.agents, studio_actions: e.detail.tools, status: e.detail.status } : {}) })),
      };
    }
    case "answer": {
      const item = s("item_id");
      const about = item ? (/^(backlog|move):/.test(item) ? [item] : await nodesForIds(uc!.id, [item])) : [];
      await call(messageRoute, { id: uc!.id }, "POST", { content: s("text"), source: client.slice(0, 80), ...(input.to ? { to: s("to") } : {}), ...(about.length ? { about } : {}), ...(input.question_id ? { replyTo: s("question_id") } : {}), author: { name: access.person || "", role: access.role } });
      return { said: s("text"), next: `${ASSISTANT_NAME} is answering. Ask for the brief to read the reply.` };
    }
    case "decide": {
      const r = await call(decisionRoute, { id: uc!.id, did: s("decision_id")! }, "PATCH", { status: input.decision === "approve" ? "approved" : "rejected", ...(input.comment ? { answer: s("comment") } : {}), by: by(access, client) });
      const d = (r.decision ?? {}) as { text?: string; status?: string };
      return { decision: brand(d.text ?? ""), status: d.status, touches: r.impact, next: `${ASSISTANT_NAME} carries it through the spec.` };
    }
    case "change_item": {
      const item = s("item_id")!;
      const who = by(access, client);
      if (input.action === "edit") {
        if (!input.text) throw new ToolError("Give the new wording in text.");
        await call(backlogRoute, { id: uc!.id, itemId: item }, "PATCH", { title: s("text"), note: s("why") ?? "", by: who });
        return { edited: s("text") };
      }
      if (input.action === "withdraw") {
        await call(backlogRoute, { id: uc!.id, itemId: item }, "PATCH", { withdraw: true, note: s("why") ?? "", by: who });
        return { withdrawn: item };
      }
      if (input.action === "set_kind") {
        if (!input.kind) throw new ToolError("Say which kind: capture, epic or distraction.");
        await call(backlogRoute, { id: uc!.id, itemId: item }, "PATCH", { kind: s("kind"), by: who });
        return { item, kind: s("kind") };
      }
      if (input.action === "pull_recommendation") return call(backlogRoute, { id: uc!.id, itemId: item }, "PATCH", { pull: true, by: who });
      if (input.action === "include_in_build" || input.action === "exclude_from_build") {
        const include = input.action === "include_in_build";
        const isDecision = await prisma.decision.findFirst({ where: { id: item, useCaseId: uc!.id }, select: { id: true } });
        if (isDecision) await call(decisionRoute, { id: uc!.id, did: item }, "PATCH", { includeInBuild: include, by: who });
        else await call(backlogRoute, { id: uc!.id, itemId: item }, "PATCH", { includeInBuild: include, by: who });
        return { item, in_next_build: include };
      }
      if (input.action === "edit_decision") {
        if (!input.text) throw new ToolError("Give the new wording in text.");
        await call(decisionRoute, { id: uc!.id, did: item }, "PATCH", { text: s("text"), by: who });
        return { decision: item, now: s("text") };
      }
      if (input.action === "undo_approval") {
        await call(undoRoute, { id: uc!.id }, "PATCH", { undo: item, author: { name: access.person || "", role: access.role } });
        return { undone: item };
      }
      if (input.action === "reopen_decision") {
        await call(decisionRoute, { id: uc!.id, did: item }, "PATCH", { status: "open", by: who });
        return { reopened: item };
      }
      await call(moveRoute, { id: uc!.id, mid: item }, "PATCH", { status: "ready", by: who, why: s("why") ?? "Sent back through the connector" });
      return { sent_back: item };
    }
    case "build": {
      const r = await call(generateRoute, { id: uc!.id }, "POST", { redesign: input.mode === "redesign", fresh: input.mode === "fresh" });
      return { status: r.status, next: "Claude Code is building. Ask for the brief or what's waiting to see when it reaches human review." };
    }
    case "my_access": {
      const level = effectiveLevel(access);
      return {
        acts_as: access.person || "no name set",
        role: access.role,
        level: LEVEL_LABEL[level],
        customers: access.customer || "every customer",
        may_use: TOOL_NAMES.filter((t) => gate(t, access).ok),
        may_not_use: TOOL_NAMES.filter((t) => !gate(t, access).ok),
        roles: ROLE_RULES.map((r) => ({ role: r.role, kind: r.kind, most: LEVEL_LABEL[r.max], note: r.note })),
      };
    }
    case "open_use_case": {
      const id = uc!.id;
      const [members, decisions, backlog, moves, documents, versions] = await Promise.all([
        prisma.member.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } }),
        prisma.decision.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "asc" } }),
        prisma.backlogItem.findMany({ where: { useCaseId: id, kind: { not: "distraction" } }, orderBy: { createdAt: "asc" } }),
        prisma.move.findMany({ where: { useCaseId: id }, orderBy: { position: "asc" } }),
        prisma.document.findMany({ where: { useCaseId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
        prisma.specRevision.count({ where: { useCaseId: id } }),
      ]);
      const screen = (process.env.STUDIO_SCREEN_URL || "http://localhost:3000").replace(/\/+$/, "");
      return {
        id,
        name: uc!.name,
        customer: uc!.customer,
        business_area: uc!.businessArea,
        summary: uc!.summary,
        what_it_is: uc!.validatedUseCase || uc!.statement || uc!.description.slice(0, 600),
        category: uc!.category,
        stage: uc!.stageLabel,
        lens: uc!.lens,
        focus: uc!.focus,
        archived: uc!.archivedAt ? day(uc!.archivedAt) : undefined,
        open_in_studio: `${screen}/use-cases/${id}`,
        open_note: "The Studio's screens open in a browser on the computer that runs the Studio; from anywhere else, use these tools.",
        people: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
        decisions: decisions.map((d) => ({ id: d.id, text: brand(d.text), status: d.status, from: brand(d.agent) })),
        held_thoughts: backlog.map((b) => ({ id: b.id, title: b.title, state: b.state, group: b.group })),
        board: moves.map((m) => ({ id: m.id, title: m.title, column: BOARD_LABEL[m.status as BoardStatus] ?? m.status, why: m.moveReason })),
        documents: documents.map((d) => ({ id: d.id, file: d.fileName, status: d.status, card_id: d.moveId || undefined })),
        spec_versions: versions,
        build: { versions_built: uc!.generateCount, last_built: day(uc!.lastGeneratedAt), running: uc!.generateBusy, status: uc!.generateStatus, preview_port: uc!.previewPort || undefined },
        socra: { busy: uc!.agentBusy, status: uc!.agentStatus, error: uc!.agentError || undefined },
        git: { repo: uc!.repoUrl, branch: uc!.gitBranch, status: uc!.gitStatus },
        linear: { team: uc!.linearTeam, status: uc!.linearStatus },
        created: day(uc!.createdAt),
        updated: day(uc!.updatedAt),
      };
    }
    case "read_card": {
      const r = await call(cardRoute, { id: uc!.id, mid: s("card_id")! }, "GET");
      const m = r.move as { id: string; title: string; status: string; capability: string; decision: string; prompt: string; owner: string; movedBy: string; moveReason: string };
      return {
        id: m.id,
        title: m.title,
        column: BOARD_LABEL[m.status as BoardStatus] ?? m.status,
        capability: m.capability,
        decision: brand(m.decision),
        build_prompt: m.prompt,
        owner: m.owner,
        moved_by: brand(m.movedBy),
        why: m.moveReason,
        history: (r.history as { summary: string; by: string; createdAt: string }[]).map((h) => ({ what: brand(h.summary), by: brand(h.by), when: day(new Date(h.createdAt)) })),
        files: r.files,
      };
    }
    case "update_use_case": {
      if (access.customer && input.customer !== undefined && !inScope(access.customer, String(input.customer))) throw new ToolError("This access covers one customer, so it can't move a use case to another customer.");
      const map: Record<string, string> = { name: "name", customer: "customer", business_area: "businessArea", summary: "summary", prfaq: "prfaq", lens: "lens", focus: "focus", repo_url: "repoUrl", git_branch: "gitBranch", linear_team: "linearTeam" };
      const body = Object.fromEntries(Object.entries(map).filter(([k]) => input[k] !== undefined).map(([k, v]) => [v, input[k]]));
      if (!Object.keys(body).length) throw new ToolError("Send at least one field to change.");
      await call(useCaseRoute, { id: uc!.id }, "PATCH", body);
      return { changed: Object.keys(map).filter((k) => input[k] !== undefined) };
    }
    case "board_card": {
      const who = by(access, client);
      const cardId = s("card_id");
      if (input.action === "create") {
        if (!input.title) throw new ToolError("Give the card a title.");
        const r = await call(newCardRoute, { id: uc!.id }, "POST", { title: s("title"), capability: s("capability") ?? "", prompt: s("prompt") ?? "", status: s("column") ?? "queued", by: who });
        return { card_id: (r.id as string) ?? (r.move as { id?: string } | undefined)?.id, created: s("title") };
      }
      if (!cardId) throw new ToolError("Give the card_id (see open_use_case or read_spec part board).");
      if (input.action === "edit") {
        const body = Object.fromEntries((["title", "capability", "decision", "prompt", "owner"] as const).filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
        if (!Object.keys(body).length) throw new ToolError("Send what to change: title, capability, decision, prompt or owner.");
        await call(moveRoute, { id: uc!.id, mid: cardId }, "PATCH", { ...body, by: who, why: s("why") ?? "" });
        return { card_id: cardId, changed: Object.keys(body) };
      }
      if (input.action === "move") {
        if (!input.column) throw new ToolError("Say which column: queued, ready, building, review or done.");
        await call(moveRoute, { id: uc!.id, mid: cardId }, "PATCH", { status: s("column"), by: who, why: s("why") || "Moved through the connector" });
        return { card_id: cardId, column: BOARD_LABEL[s("column") as BoardStatus] };
      }
      const name = s("file_name");
      if (!name || (input.file_text === undefined && input.file_base64 === undefined)) throw new ToolError("Give file_name and file_text (or file_base64).");
      const bytes = input.file_base64 !== undefined ? Buffer.from(String(input.file_base64), "base64") : Buffer.from(String(input.file_text), "utf8");
      if (bytes.length > 600 * 1024) throw new ToolError("That file is over 600 KB. Attach it on screen instead.");
      const form = new FormData();
      form.append("by", who);
      form.append("files", new Blob([new Uint8Array(bytes)], { type: input.file_base64 !== undefined ? "application/octet-stream" : "text/plain" }), name);
      return call(cardFilesRoute, { id: uc!.id, mid: cardId }, "POST", form);
    }
    case "review_spec": {
      const body: Record<string, unknown> = { note: s("note") ?? "" };
      if (input.review !== undefined) body.review = input.review;
      if (input.content !== undefined) Object.assign(body, { content: input.content, review: input.review ?? "revise" });
      if (input.status !== undefined) body.status = input.status;
      if (input.review === undefined && input.content === undefined && input.status === undefined) throw new ToolError("Send a review, new content or a status.");
      await call(specRoute, { id: uc!.id, key: s("section")! }, "PATCH", body);
      return { section: s("section"), done: Object.keys(body).filter((k) => k !== "note"), next: `${ASSISTANT_NAME} carries it through the spec.` };
    }
    case "restore_spec":
      await call(restoreRoute, { id: uc!.id }, "POST", { version: Number(input.version) });
      return { restored: Number(input.version) };
    case "story_map": {
      const author = { name: access.person || "", role: access.role };
      if (input.action === "suggest") return call(storyMapRoute, { id: uc!.id }, "POST", { action: "suggest", author });
      if (input.action === "connect") {
        if (!input.from || !input.to || !input.kind) throw new ToolError("Give from, to and kind (depends_on, split_from or related).");
        return call(storyMapRoute, { id: uc!.id }, "POST", { action: "connect", from: s("from"), to: s("to"), kind: s("kind"), author });
      }
      if (!input.link_id) throw new ToolError("Give the link_id (see read_spec part story_map).");
      return call(storyMapRoute, { id: uc!.id }, "POST", { action: s("action"), link: s("link_id"), author });
    }
    case "people": {
      if (input.action === "add") {
        if (!input.name || !input.role) throw new ToolError("Give a name and a role.");
        const m = await call(memberAdd, { id: uc!.id }, "POST", { name: s("name"), role: s("role") });
        return { member_id: m.id, name: m.name, role: m.role };
      }
      const m = await prisma.member.findFirst({ where: { useCaseId: uc!.id, OR: [{ id: s("member_id") ?? "" }, { name: s("name") ?? "" }] } });
      if (!m) throw new ToolError("Nobody by that id or name on this use case.");
      await call(memberRemove, { id: uc!.id }, "DELETE", undefined, `?member=${encodeURIComponent(m.id)}`);
      return { removed: m.name };
    }
    case "agent_control": {
      const who = by(access, client);
      if (input.action === "switch") {
        if (!input.agent_key || (input.on === undefined && input.persona === undefined)) throw new ToolError("Give agent_key and on and/or persona.");
        await call(agentRoute, { id: uc!.id, key: s("agent_key")! }, "PATCH", { ...(input.on !== undefined ? { on: input.on } : {}), ...(input.persona !== undefined ? { persona: input.persona } : {}), by: who });
        return { agent: s("agent_key"), on: input.on, persona: input.persona };
      }
      if (!input.approval_id) throw new ToolError("Give the approval_id (see agent_status).");
      return call(agentApprovalRoute, { id: uc!.id, aid: s("approval_id")! }, "POST", { decision: s("action"), comment: s("comment") ?? "", by: who });
    }
    case "preview": {
      await startPreview(uc!.id);
      const after = await prisma.useCase.findUniqueOrThrow({ where: { id: uc!.id }, select: { previewPort: true, generateCount: true } });
      if (!after.generateCount) return { started: false, note: "Nothing is built yet. Build first." };
      return { started: true, runs_at: after.previewPort ? `http://localhost:${after.previewPort}` : "starting", note: "The preview opens in a browser on the computer that runs the Studio." };
    }
    case "mark_up":
      await call(feedbackRoute, { id: uc!.id }, "POST", { comment: s("comment"), pageUrl: s("page") ?? "/", target: s("element") ?? "", shape: "full-screen" });
      return { marked: true, next: `${ASSISTANT_NAME} sorts it into a new requirement, a change or a bug.` };
    case "retry_socra":
      return call(retryRoute, { id: uc!.id }, "POST", {});
    case "sync":
      return call(syncRoute, { id: uc!.id }, "POST", { kind: s("to") });
    case "archive_use_case": {
      const archive = input.action === "archive";
      if (archive) await stopPreview(uc!.id).catch(() => undefined);
      await prisma.useCase.update({ where: { id: uc!.id }, data: { archivedAt: archive ? new Date() : null, updatedAt: uc!.updatedAt } });
      return archive ? { archived: uc!.name, restore: "archive_use_case with action restore brings it back." } : { restored: uc!.name };
    }
    case "delete_use_case": {
      if (String(input.confirm_name ?? "").trim() !== uc!.name.trim()) throw new ToolError(`confirm_name must be the use case's exact name: “${uc!.name}”. Nothing was deleted.`);
      await stopPreview(uc!.id).catch(() => undefined);
      await prisma.useCase.delete({ where: { id: uc!.id } });
      return { deleted: uc!.name, note: "Gone for good. The connector log keeps a line that it was deleted." };
    }
    case "call_log": {
      const rows = await prisma.connectorCall.findMany({ orderBy: { createdAt: "desc" }, take: Number(input.limit ?? 40) });
      return rows.map((r) => ({ when: day(r.createdAt), who: r.person, tool: r.tool, use_case_id: r.useCaseId || undefined, via: r.via, outcome: r.outcome, note: r.note || undefined }));
    }
  }
}
