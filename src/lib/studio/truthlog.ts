import { prisma } from "@/lib/db";
import { withDocuments } from "./evidenceDocs";
import { buildTruthGraph, explainChanges, caseConfidence, exportGraph, type GraphInput } from "./truth";

// Writes the "why did this change?" timeline and reads the Product Truth Graph for a product.

/** What caused Socra turn now running for each product (msg:…, ann:…, evidence:…). */
const turnCauses = new Map<string, string[]>();
export function setTurnCauses(useCaseId: string, causes: string[]) {
  if (causes.length) turnCauses.set(useCaseId, [...new Set(causes)]);
  else turnCauses.delete(useCaseId);
}
export function currentCauses(useCaseId: string) {
  return turnCauses.get(useCaseId) ?? [];
}

/** The AgentTurn now running for each product, so what it says is stamped with it. */
const turnIds = new Map<string, string>();
export function setTurnId(useCaseId: string, id: string) {
  if (id) turnIds.set(useCaseId, id);
  else turnIds.delete(useCaseId);
}
export function currentTurnId(useCaseId: string) {
  return turnIds.get(useCaseId) ?? "";
}

/** The backlog items and Board cards a running turn is about (its causes), for messages that name none. */
export function currentItems(useCaseId: string) {
  return currentCauses(useCaseId).filter((c) => /^(backlog|move):/.test(c));
}

const clip = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Logs one real change to a node. `causes` are other node ids; the running Socra turn's causes are added
 * when `fromTurn` is set (changes Socra or its team make while answering something).
 */
export async function recordChange(
  useCaseId: string,
  c: { node: string; kind: string; summary: string; before?: string; after?: string; causes?: string[]; by?: string; fromTurn?: boolean },
) {
  const causes = [...new Set([...(c.causes ?? []), ...(c.fromTurn ? currentCauses(useCaseId) : [])])].filter((x) => x && x !== c.node);
  await prisma.truthChange
    .create({ data: { useCaseId, node: c.node, kind: c.kind, summary: clip(c.summary, 400), before: clip(c.before ?? ""), after: clip(c.after ?? ""), causes, by: c.by ?? "" } })
    .catch((e) => console.error("truth change", e));
}

/** Ids a set_spec_section / record call names (decision, backlog, evidence, move ids) as node ids. */
export async function nodesForIds(useCaseId: string, ids: string[]) {
  const clean = ids.filter((x) => /^[a-z0-9]{20,32}$/i.test(x));
  if (!clean.length) return [];
  const [d, b, e, m, f] = await Promise.all([
    prisma.decision.findMany({ where: { useCaseId, id: { in: clean } }, select: { id: true } }),
    prisma.backlogItem.findMany({ where: { useCaseId, id: { in: clean } }, select: { id: true } }),
    prisma.evidence.findMany({ where: { useCaseId, id: { in: clean } }, select: { id: true } }),
    prisma.move.findMany({ where: { useCaseId, id: { in: clean } }, select: { id: true } }),
    prisma.feedback.findMany({ where: { useCaseId, id: { in: clean } }, select: { id: true } }),
  ]);
  return [...d.map((x) => `decision:${x.id}`), ...b.map((x) => `backlog:${x.id}`), ...e.map((x) => `evidence:${x.id}`), ...m.map((x) => `move:${x.id}`), ...f.map((x) => `ann:${x.id}`)];
}

export async function graphInput(useCaseId: string): Promise<GraphInput | null> {
  const uc = await prisma.useCase.findUnique({
    where: { id: useCaseId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      evidence: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, createdAt: true, summary: true, storagePath: true, textPath: true, origin: true } },
      decisions: { orderBy: { createdAt: "asc" } },
      capabilities: { orderBy: { position: "asc" } },
      backlog: { orderBy: { createdAt: "asc" } },
      spec: { orderBy: [{ tab: "asc" }, { position: "asc" }] },
      feedback: { orderBy: { createdAt: "asc" } },
      moves: { orderBy: { position: "asc" } },
      specRevisions: { orderBy: { version: "asc" }, select: { version: true, reason: true, createdAt: true } },
      truthChanges: { orderBy: { createdAt: "asc" }, take: 2000 },
    },
  });
  if (!uc) return null;
  return {
    id: uc.id,
    name: uc.name,
    statement: uc.statement,
    validatedUseCase: uc.validatedUseCase,
    audience: uc.audience,
    createdAt: uc.createdAt,
    validation: (uc.validation ?? {}) as GraphInput["validation"],
    messages: uc.messages,
    evidence: withDocuments(uc.evidence, uc.documents),
    documents: uc.documents,
    decisions: uc.decisions,
    capabilities: uc.capabilities,
    backlog: uc.backlog,
    spec: uc.spec,
    feedback: uc.feedback,
    moves: uc.moves,
    revisions: uc.specRevisions,
    changes: uc.truthChanges,
  };
}

/** The whole graph view: nodes, edges, the explained timeline and the use case's confidence. */
export async function truthView(useCaseId: string) {
  const g = await graphInput(useCaseId);
  if (!g) return null;
  const { nodes, edges } = buildTruthGraph(g);
  return { nodes, edges, timeline: explainChanges(g.changes, nodes, edges, 300), confidence: caseConfidence(g, nodes, edges) };
}

/** TRUTH_GRAPH.json for the package. */
export async function truthExport(useCaseId: string) {
  const g = await graphInput(useCaseId);
  if (!g) return { nodes: [], edges: [] };
  const { nodes, edges } = buildTruthGraph(g);
  return exportGraph(nodes, edges);
}
