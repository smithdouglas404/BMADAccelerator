import { prisma } from "@/lib/db";
import { brand, ASSISTANT_NAME } from "@/lib/brand";
import { isAffirmative, pickedNumbers } from "@/lib/studio/core";
import { changeImpact } from "@/lib/studio/impact";
import { truthView } from "@/lib/studio/truthlog";
import { BOARD_LABEL, type BoardStatus } from "@/lib/studio/board";
import { agentsView } from "@/lib/agentService";
import { TOOLS, gate, inScope, needsConfirm, type ToolName } from "./catalog";
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

// Runs the catalog's tools. Every write goes through the same route the Studio's own screens use, so the
// rules (a yes approves only a real proposal, changes ripple to Socra, the Truth Graph logs who and why)
// hold exactly as they do on screen.

export class ToolError extends Error {}
export type ToolResult = { ok: true; data: unknown } | { ok: false; needsConfirmation: true; preview: unknown; how: string } | { ok: false; error: string; status: number };

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;
async function call<P>(h: Handler<P>, params: P, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const req = new Request("http://studio.internal/connector", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  if (tool === "answer") return { would: `Say “${input.text}” to ${ASSISTANT_NAME}. A bare yes or a number approves what ${ASSISTANT_NAME} last proposed.`, lastFromSocra: await lastSocra(ucId) };
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

async function lastSocra(ucId: string) {
  const m = await prisma.message.findFirst({ where: { useCaseId: ucId, role: { in: ["muse", "agent"] } }, orderBy: { createdAt: "desc" } });
  return m ? brand(m.content).slice(0, 1500) : "";
}

async function run(tool: ToolName, input: Record<string, unknown>, uc: Awaited<ReturnType<typeof scopedUseCase>> | null, access: Access, client: string): Promise<unknown> {
  const s = (k: string) => (input[k] === undefined ? undefined : String(input[k]));
  switch (tool) {
    case "list_use_cases": {
      const rows = await prisma.useCase.findMany({ where: scopeWhere(access, s("customer")), orderBy: { updatedAt: "desc" }, take: 100 });
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
      }));
    }
    case "whats_waiting": {
      const rows = uc ? [uc] : await prisma.useCase.findMany({ where: scopeWhere(access), select: { id: true, name: true, customer: true, generateBusy: true, generateStatus: true } });
      const names = new Map(rows.map((r) => [r.id, `${r.customer ? `${r.customer} · ` : ""}${r.name}`]));
      const w = await waiting(rows.map((r) => r.id));
      return {
        decisions: w.open.map((d) => ({ use_case_id: d.useCaseId, use_case: names.get(d.useCaseId), decision_id: d.id, question: brand(d.text), from: brand(d.agent), options: d.options, since: day(d.createdAt) })),
        to_review: w.review.map((m) => ({ use_case_id: m.useCaseId, use_case: names.get(m.useCaseId), card_id: m.id, card: m.title, why: m.moveReason })),
        socra_asks: await socraAsks(rows.map((r) => r.id), names),
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
    case "capture":
      return call(captureRoute, { id: uc!.id }, "POST", { text: s("text"), source: by(access, client) });
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
    case "answer": {
      await call(messageRoute, { id: uc!.id }, "POST", { content: s("text"), source: client.slice(0, 80), author: { name: access.person || "", role: access.role } });
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
  }
}
