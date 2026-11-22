import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { closeoutSummary } from "@/lib/studio/archive";
import { ensureWorkspace, slugify } from "@/lib/workspace";
import { validationScore, workingName, type Validation } from "@/lib/studio/core";
import { explainReadiness } from "@/lib/studio/spec";
import { ensureRoutes, ensureSpec } from "@/lib/studio/state";
import { ensureStarted } from "@/lib/studio/actions";
import { journey, needsTriage, hasDetail, idleDays, questionTally } from "@/lib/studio/journey";

// Every product the team is shaping, newest first. ?archived=1 adds the archived ones; ?archived=only lists just those.
export async function GET(req: Request) {
  const archived = new URL(req.url).searchParams.get("archived");
  const rows = await prisma.useCase.findMany({
    where: archived === "only" ? { archivedAt: { not: null } } : archived === "1" ? {} : { archivedAt: null },
    orderBy: archived === "only" ? { archivedAt: "desc" } : { updatedAt: "desc" },
    include: { capabilities: { select: { readiness: true } }, spec: true, decisions: { select: { status: true, includeInBuild: true } }, moves: { select: { status: true, prompt: true } }, backlog: { select: { triage: true, state: true, kind: true, deferUntil: true } }, _count: { select: { backlog: true, decisions: true, evidence: true, feedback: true, messages: { where: { role: "user" } } } } },
  });
  // Every question asked and answered, per product, for the same "answered of asked" the product's screens show.
  const talk = await prisma.message.findMany({ where: { useCaseId: { in: rows.map((r) => r.id) }, role: { in: ["user", "muse", "agent"] } }, select: { id: true, useCaseId: true, role: true, content: true, createdAt: true, replyTo: true } });
  const tally = (id: string) => questionTally(talk.filter((m) => m.useCaseId === id));
  return NextResponse.json(
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      statement: u.statement || u.description.slice(0, 200),
      category: u.category,
      stageLabel: u.stageLabel,
      customer: u.customer,
      businessArea: u.businessArea,
      lastView: u.lastView,
      // The same one number the product's own screens show.
      readiness: explainReadiness({
        sections: u.spec,
        evidenceCount: u._count.evidence,
        decisions: u.decisions,
        validation: validationScore((u.validation ?? {}) as Validation),
        capabilities: u.capabilities,
        movesTotal: u.moves.length,
        movesDone: u.moves.filter((m) => m.status === "review" || m.status === "done").length,
      }).overall,
      // How far it has come and the one step that moves it on (same rules as the use case's own screens).
      ...(() => {
        const j = journey({
          userMessages: u._count.messages,
          openDecisions: u.decisions.filter((d) => d.status === "open").length,
          approvedDecisions: u.decisions.filter((d) => d.status === "approved").length,
          needsYou: u.backlog.filter((b) => needsTriage(b)).length,
          reviewedSections: u.spec.filter((x) => (x.basis === "inferred" || x.basis === "recommended") && x.review).length,
          unreviewedSections: u.spec.filter((x) => (x.basis === "inferred" || x.basis === "recommended") && !x.review).length,
          detailedCards: u.moves.filter((m) => m.status !== "queued" && hasDetail(m.prompt)).length,
          builds: u.generateCount,
          markups: u._count.feedback,
          validationScore: validationScore((u.validation ?? {}) as Validation),
          ...(() => { const q = tally(u.id); return { questionsAsked: q.asked, questionsAnswered: q.answered } })(),
          resolvedDecisions: u.decisions.filter((d) => d.status === "approved" || d.status === "rejected").length,
          triagedItems: u.backlog.filter((b) => !needsTriage(b) && !!b.triage).length,
        });
        return { progress: j.percent, nextStep: j.next ? { label: j.next.label, view: j.next.view, gain: j.next.weight } : null, needsYou: u.backlog.filter((b) => needsTriage(b)).length + u.decisions.filter((d) => d.status === "open").length, idleDays: idleDays(u.updatedAt) };
      })(),
      versions: u.generateCount,
      thoughts: u._count.backlog,
      decisions: u._count.decisions,
      busy: u.agentBusy || u.generateBusy,
      updatedAt: u.updatedAt,
      archivedAt: u.archivedAt,
      createdBy: u.createdBy,
      closeout: u.archivedAt ? { by: u.archivedBy, ...closeoutSummary({ outcome: (u.archiveOutcome as "approved" | "rejected" | "") || "", comments: u.archiveComments, cost: u.archiveCostEstimate, benefits: u.archiveBenefits }), outcome: u.archiveOutcome } : null,
    })),
  );
}

const CreateBody = z.object({
  // Optional: Socra names the product from what they said; until then it has a working name.
  name: z.string().trim().max(120).default(""),
  description: z.string().max(20000).default(""),
  // The new use case form: who it is for, where in their business, and a short description.
  customer: z.string().trim().max(120).default(""),
  businessArea: z.string().trim().max(120).default(""),
  summary: z.string().trim().max(2000).default(""),
  author: z.object({ name: z.string().max(80).default(""), role: z.string().max(60).default("Product owner") }).optional(),
});

// A new product: the owner's own words. Socra opens it straight away.
export async function POST(req: Request) {
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Say a few words about the product." }, { status: 400 });
  const { author, customer, businessArea, summary } = parsed.data;
  // What Socra reads first: their own words, with the form's facts in front of them.
  const facts = [customer && `Customer: ${customer}`, businessArea && `Business area: ${businessArea}`, parsed.data.name && `Use case: ${parsed.data.name}`, summary && `In short: ${summary}`].filter(Boolean).join("\n");
  const description = [facts, parsed.data.description.trim()].filter(Boolean).join("\n\n");
  if (!parsed.data.name && !description.trim()) return NextResponse.json({ error: "Say a few words about the product." }, { status: 400 });
  const name = parsed.data.name || workingName(summary || parsed.data.description || description);
  const slug = slugify(customer ? `${customer} ${name}` : name);
  await ensureWorkspace(slug);
  const uc = await prisma.useCase.create({
    data: {
      slug,
      name,
      description,
      customer,
      businessArea,
      summary,
      messages: description ? { create: { role: "user", agent: "You", content: description, author: author?.name ?? "", authorRole: author?.role ?? "" } } : undefined,
      createdBy: author?.name ?? "",
      members: author?.name ? { create: { name: author.name, role: author.role } } : undefined,
    },
  });
  await ensureRoutes(uc.id);
  await ensureSpec(uc.id);
  return NextResponse.json(uc, { status: 201 });
}

// Uploads are added right after creation; the client calls this to open the product for Socra.
export async function PUT(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing product" }, { status: 400 });
  await ensureStarted(id);
  return NextResponse.json({ ok: true });
}
