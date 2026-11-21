import { agentConfig } from "@/lib/agentService";
import { brand } from "@/lib/brand";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { syncPreviewState } from "@/lib/preview";
import { ROUTE_AGENTS, overallReadiness, validationScore, type Validation } from "./core";
import { assemblePackage, type PackageInput } from "./package";
import { prfaqMarkers, prfaqWithFootnotes, type Source } from "./prfaqDraft";
import { truthExport } from "./truthlog";
import { readInterpretation } from "./truth";
import { truthGraphSchema } from "@/studio/graph";
import { SPEC_DEFS, explainReadiness, specDiff, type SpecSnapshot } from "./spec";
import { withDocuments } from "./evidenceDocs";

/** The four routes exist for every product, in order. */
export async function ensureRoutes(useCaseId: string) {
  const have = await prisma.agentRoute.findMany({ where: { useCaseId } });
  for (const [i, r] of ROUTE_AGENTS.entries()) {
    if (have.some((h) => h.agent === r.agent)) continue;
    await prisma.agentRoute.create({ data: { useCaseId, agent: r.agent, action: r.action, position: i, state: i === 0 ? "active" : "waiting" } }).catch(() => {});
  }
}

/** Every PRD and TRD section exists for every product from the start, as "Not yet researched". */
export async function ensureSpec(useCaseId: string) {
  const rows = await prisma.specSection.findMany({ where: { useCaseId }, select: { id: true, key: true, title: true } });
  // Section names follow the current definitions (a renamed section keeps its content and trace).
  for (const r of rows) {
    const def = SPEC_DEFS.find((d) => d.key === r.key);
    if (def && def.title !== r.title) await prisma.specSection.update({ where: { id: r.id }, data: { title: def.title, kicker: def.kicker } });
  }
  const have = new Set(rows.map((s) => s.key));
  const missing = SPEC_DEFS.filter((d) => !have.has(d.key));
  if (!missing.length) return;
  await prisma.specSection.createMany({
    data: missing.map((d) => ({ useCaseId, tab: d.tab, key: d.key, ref: d.ref, title: d.title, kicker: d.kicker, position: d.position })),
    skipDuplicates: true,
  });
}

/** Everything the Studio's screens show, in one read. */
export async function studioState(id: string) {
  const uc = await prisma.useCase.findUnique({
    where: { id },
    include: {
      capabilities: { orderBy: { position: "asc" } },
      decisions: { orderBy: { createdAt: "asc" } },
      backlog: { orderBy: { createdAt: "desc" } },
      evidence: { orderBy: { createdAt: "desc" } },
      moves: { orderBy: [{ position: "asc" }, { updatedAt: "asc" }] },
      routes: { orderBy: { position: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      feedback: { orderBy: { createdAt: "desc" } },
      spec: { orderBy: [{ tab: "asc" }, { position: "asc" }] },
      specRevisions: { orderBy: { version: "desc" }, take: 20, select: { id: true, version: true, reason: true, diff: true, createdAt: true } },
      skills: true,
      members: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!uc) return null;
  if (uc.spec.length < SPEC_DEFS.length) {
    await ensureSpec(id);
    return studioState(id);
  }
  const preview = await syncPreviewState(uc);
  const validation = (uc.validation ?? {}) as Validation;
  const pkgDir = workspacePath(uc.slug, "studio", "package");
  const packageFiles = (await fs.readdir(pkgDir).catch(() => [] as string[])).sort();
  const pending = await prisma.agentEvent.count({ where: { useCaseId: id, status: { in: ["queued", "running"] } } });
  // Records written before the assistant was renamed show its current name; people's own words never change.
  const b = brand;
  // The agent service's token and callback secret never leave the server (the screens only need to know whether one exists).
  const { agentToken, agentSecret, ...safe } = uc;
  return {
    ...safe,
    agentRegistered: Boolean(agentToken && agentSecret),
    messages: uc.messages.map((m) => (m.role === "user" ? m : { ...m, agent: b(m.agent), content: b(m.content) })),
    decisions: uc.decisions.map((d) => ({ ...d, agent: b(d.agent), text: d.agent ? b(d.text) : d.text })),
    backlog: uc.backlog.map((x) => ({ ...x, group: b(x.group), source: b(x.source), ...(x.recKind ? { title: b(x.title), note: b(x.note) } : {}) })),
    routes: uc.routes.map((r) => ({ ...r, agent: b(r.agent), detail: b(r.detail) })),
    moves: uc.moves.map((m) => ({ ...m, movedBy: b(m.movedBy), moveReason: b(m.moveReason) })),
    // Each evidence card points at the stored document it came from, wherever that can be found.
    evidence: withDocuments(uc.evidence, uc.documents),
    // Whether each stored file is still in the workspace, so the screens never offer an original that is gone.
    documents: await Promise.all(uc.documents.map(async (d) => ({ ...d, exists: await fs.stat(d.storagePath).then((st) => st.isFile(), () => false) }))),
    validation,
    validationScore: validationScore(validation),
    overallReadiness: overallReadiness(uc.capabilities),
    readiness: explainReadiness({
      sections: uc.spec,
      evidenceCount: uc.evidence.length,
      decisions: uc.decisions,
      validation: validationScore(validation),
      capabilities: uc.capabilities,
      movesTotal: uc.moves.length,
      movesDone: uc.moves.filter((m) => (m.status === "review" || m.status === "done")).length,
    }),
    preview,
    packageFiles,
    pending,
    feedback: uc.feedback.map((f) => ({ ...f, imagePath: undefined, imageUrl: `/api/feedback/${f.id}/image` })),
  };
}

export type StudioState = NonNullable<Awaited<ReturnType<typeof studioState>>>;

/** Collects the product truth into the package input. Frames are included when asked (the ZIP). */
export async function packageInput(useCaseId: string, opts: { frames?: boolean; iteration?: number } = {}): Promise<PackageInput> {
  const uc = await prisma.useCase.findUniqueOrThrow({
    where: { id: useCaseId },
    include: {
      capabilities: { orderBy: { position: "asc" } },
      decisions: { orderBy: { createdAt: "asc" } },
      backlog: { orderBy: { createdAt: "asc" } },
      evidence: { orderBy: { createdAt: "asc" } },
      moves: { orderBy: { position: "asc" } },
      routes: { orderBy: { position: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      feedback: { orderBy: { createdAt: "asc" } },
      spec: { orderBy: [{ tab: "asc" }, { position: "asc" }] },
      specRevisions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  const annotations = [];
  for (const f of uc.feedback) {
    let frame: string | undefined;
    if (opts.frames && f.imagePath) {
      const buf = await fs.readFile(f.imagePath).catch(() => null);
      if (buf) frame = `data:image/png;base64,${buf.toString("base64")}`;
    }
    annotations.push({
      target: f.target || f.pageUrl || "product preview",
      note: f.comment,
      shape: f.shape,
      ...(frame ? { frame } : { frameFile: f.imagePath ? path.relative(workspacePath(uc.slug), f.imagePath) : undefined }),
    });
  }
  const components = ((uc.components ?? []) as { name: string; why?: string }[]).map((c) => c.name);
  return {
    iteration: opts.iteration ?? uc.packageCount,
    productName: uc.name,
    statement: uc.statement,
    category: uc.category,
    audience: uc.audience,
    customerQuote: uc.customerQuote,
    useCase: uc.validatedUseCase,
    readiness: overallReadiness(uc.capabilities),
    validationScore: validationScore((uc.validation ?? {}) as Validation),
    repositoryUrl: uc.repoUrl,
    gitBranch: uc.gitBranch,
    prfaq: await prfaqForPackage(uc.id, uc.prfaq, uc.prfaqSources),
    capabilities: uc.capabilities.map((c) => ({ key: c.key, label: c.label, readiness: c.readiness, description: c.description, items: (c.items ?? []) as { id: string; text: string; state: string }[] })),
    decisions: uc.decisions.map((d) => ({ id: d.id, text: d.text, status: d.status, capability: d.capability, words: d.words, agent: d.agent, answer: d.answer })),
    backlog: uc.backlog.map((b) => ({ id: b.id, title: b.title, note: b.note, kind: b.kind, group: b.group, source: b.source, recKind: b.recKind, state: b.state, hidden: b.hidden, includeInBuild: b.includeInBuild })),
    evidence: uc.evidence.map((e) => ({ source: e.source, type: e.type, insight: e.insight, confidence: e.confidence, trace: e.trace })),
    moves: uc.moves.map((m) => ({ id: m.id, title: m.title, capability: m.capability, decision: m.decision, status: m.status, owner: m.owner, hidden: m.hidden, components: m.components, routes: m.routes, prompt: m.prompt })),
    routes: uc.routes.map((r) => ({ agent: r.agent, action: r.action, state: r.state, detail: r.detail })),
    agents: {
      useCase: uc.id,
      customer: (uc as { customer?: string }).customer ?? "",
      name: uc.name,
      agents: (await prisma.appAgent.findMany({ where: { useCaseId: uc.id, status: "approved" }, orderBy: { createdAt: "asc" } })).map(agentConfig),
    },
    messages: uc.messages.map((m) => ({ role: m.role, agent: m.agent, content: m.content, createdAt: m.createdAt.toISOString() })),
    annotations,
    components,
    technicalNotes: uc.techNotes,
    spec: uc.spec.map((x) => ({
      key: x.key, ref: x.ref, tab: x.tab, title: x.title, content: x.content, completeness: x.completeness, confidence: x.confidence, basis: x.basis,
      status: x.status, review: x.review, capability: x.capability, related: x.related, trace: (x.trace ?? []) as { label: string; detail: string; type: string }[],
    })),
    specVersion: uc.specRevisions[0]?.version ?? 0,
    specDiff: uc.specRevisions[0]?.diff ?? "",
    truthGraph: { schema: truthGraphSchema, ...(await truthExport(useCaseId)) },
    vibeLoop: uc.feedback.map((f) => {
      const it = readInterpretation(f.interpretation);
      const changes = [...(it.prd ?? []), ...(it.trd ?? [])];
      const stage = f.status === "built" ? "regenerate" : changes.length && it.behaviour ? "shape" : it.behaviour ? "interpret" : f.comment ? "describe" : "select";
      return { annotation: f.id, target: f.target || f.pageUrl || "product preview", shape: f.shape, stage, observation: it.observation || f.comment, behaviour: it.behaviour ?? "", acceptance: it.acceptance ?? [], component: it.component ?? "", changes, question: it.question ?? "" };
    }),
  };
}

export function snapshotOf(spec: { key: string; ref: string; tab: string; title: string; content: string; basis: string; status: string; review: string }[]): SpecSnapshot {
  return spec.map((s) => ({ key: s.key, ref: s.ref, tab: s.tab, title: s.title, content: s.content, basis: s.basis, status: s.status, review: s.review }));
}

/** A versioned snapshot of the spec with the plain diff from the one before (one per package). */
export async function reviseSpec(useCaseId: string, reason: string) {
  await ensureSpec(useCaseId);
  const sections = await prisma.specSection.findMany({ where: { useCaseId }, orderBy: [{ tab: "asc" }, { position: "asc" }] });
  const last = await prisma.specRevision.findFirst({ where: { useCaseId }, orderBy: { version: "desc" } });
  const snap = snapshotOf(sections);
  const diff = specDiff(((last?.snapshot ?? []) as SpecSnapshot) || [], snap);
  return prisma.specRevision.create({ data: { useCaseId, version: (last?.version ?? 0) + 1, reason, snapshot: snap, diff } });
}

/** Restores the spec's text, basis and status to an earlier version. Reviews and traces stay. */
export async function restoreSpec(useCaseId: string, version: number) {
  const rev = await prisma.specRevision.findUnique({ where: { useCaseId_version: { useCaseId, version } } });
  if (!rev) return null;
  for (const s of rev.snapshot as SpecSnapshot) {
    await prisma.specSection.updateMany({ where: { useCaseId, key: s.key }, data: { content: s.content, basis: s.basis, status: s.status, updatedBy: `Restored version ${version}` } });
  }
  return reviseSpec(useCaseId, `Restored version ${version}`);
}

/** Assembles a fresh package (a new iteration) into the workspace's studio/package/ folder. */
export async function writePackage(useCaseId: string) {
  const uc = await prisma.useCase.update({ where: { id: useCaseId }, data: { packageCount: { increment: 1 } } });
  const rev = await reviseSpec(useCaseId, `Package iteration ${uc.packageCount}`);
  const files = assemblePackage(await packageInput(useCaseId, { iteration: uc.packageCount }));
  const dir = workspacePath(uc.slug, "studio", "package");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(dir, name), content);
  return { iteration: uc.packageCount, version: rev.version, dir, files };
}

/** The PRFAQ for the package: its line markers become footnotes with the words each line rests on. */
async function prfaqForPackage(useCaseId: string, prfaq: string, meta: unknown) {
  const sources = ((meta && typeof meta === "object" ? (meta as { sources?: Record<string, Source> }).sources : undefined) ?? {});
  const ids = prfaqMarkers(prfaq).filter((k) => k.startsWith("m:")).map((k) => k.slice(2));
  const answers = ids.length ? await prisma.message.findMany({ where: { useCaseId, id: { in: ids } }, select: { id: true, content: true } }) : [];
  return prfaqWithFootnotes(prfaq, sources, Object.fromEntries(answers.map((a) => [a.id, a.content])));
}
