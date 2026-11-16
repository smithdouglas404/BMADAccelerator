import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureWorkspace, slugify } from "@/lib/workspace";
import { validationScore, workingName, type Validation } from "@/lib/studio/core";
import { explainReadiness } from "@/lib/studio/spec";
import { ensureRoutes, ensureSpec } from "@/lib/studio/state";
import { ensureStarted } from "@/lib/studio/actions";

// Every product the team is shaping, newest first.
export async function GET() {
  const rows = await prisma.useCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { capabilities: { select: { readiness: true } }, spec: true, decisions: { select: { status: true, includeInBuild: true } }, moves: { select: { status: true } }, _count: { select: { backlog: true, decisions: true, evidence: true } } },
  });
  return NextResponse.json(
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      statement: u.statement || u.description.slice(0, 200),
      category: u.category,
      stageLabel: u.stageLabel,
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
      versions: u.generateCount,
      thoughts: u._count.backlog,
      decisions: u._count.decisions,
      busy: u.agentBusy || u.generateBusy,
      updatedAt: u.updatedAt,
    })),
  );
}

const CreateBody = z.object({
  // Optional: Socra names the product from what they said; until then it has a working name.
  name: z.string().trim().max(120).default(""),
  description: z.string().max(20000).default(""),
  author: z.object({ name: z.string().max(80).default(""), role: z.string().max(60).default("Product owner") }).optional(),
});

// A new product: the owner's own words. Socra opens it straight away.
export async function POST(req: Request) {
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Say a few words about the product." }, { status: 400 });
  const { description, author } = parsed.data;
  if (!parsed.data.name && !description.trim()) return NextResponse.json({ error: "Say a few words about the product." }, { status: 400 });
  const name = parsed.data.name || workingName(description);
  const slug = slugify(name);
  await ensureWorkspace(slug);
  const uc = await prisma.useCase.create({
    data: {
      slug,
      name,
      description,
      messages: description ? { create: { role: "user", agent: "You", content: description, author: author?.name ?? "", authorRole: author?.role ?? "" } } : undefined,
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
