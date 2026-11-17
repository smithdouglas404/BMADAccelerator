import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";

const words = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
const STOP = new Set(["that", "this", "with", "from", "they", "their", "have", "will", "what", "when", "should", "would", "about", "only", "into", "every", "more", "than", "then", "there", "which", "your", "owner"]);
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

/**
 * Change impact: when a decision (or a spec section) changes, what else moves with it. Affected PRD and
 * TRD sections, backlog items, agent workflows, build moves, generated package files and Linear records.
 * Links are explicit first (related ids, the capability), then by shared meaning (several shared words).
 */
export async function changeImpact(useCaseId: string, target: { decisionId?: string; sectionKey?: string }) {
  const uc = await prisma.useCase.findUniqueOrThrow({
    where: { id: useCaseId },
    include: { spec: true, backlog: true, moves: true, decisions: true },
  });
  let text = "";
  let capability = "";
  let ids: string[] = [];
  if (target.decisionId) {
    const d = uc.decisions.find((x) => x.id === target.decisionId);
    if (!d) return null;
    text = `${d.text} ${d.words} ${d.answer}`;
    capability = d.capability;
    ids = [d.id];
  } else if (target.sectionKey) {
    const s = uc.spec.find((x) => x.key === target.sectionKey);
    if (!s) return null;
    text = `${s.title} ${s.content}`;
    capability = s.capability;
    ids = [s.key, s.ref, s.id, ...s.related];
  }
  const w = words(text);
  const linked = (rel: string[], cap: string, body: string) =>
    rel.some((r) => ids.includes(r)) || (!!capability && cap === capability) || overlap(w, words(body)) >= 3;

  const sections = uc.spec.filter((s) => s.key !== target.sectionKey && s.review !== "remove" && linked(s.related, s.capability, `${s.title} ${s.content}`));
  const backlog = uc.backlog.filter((b) => linked([b.id], b.group, `${b.title} ${b.note}`));
  const workflows = backlog.filter((b) => b.recKind === "workflow" || b.recKind === "hitl");
  const moves = uc.moves.filter((m) => (linked([m.id], m.capability, `${m.title} ${m.decision}`) || (!!target.decisionId && m.decision && overlap(w, words(m.decision)) >= 2)));
  const pkgDir = workspacePath(uc.slug, "studio", "package");
  const files: string[] = [];
  for (const f of await fs.readdir(pkgDir).catch(() => [] as string[])) {
    const body = await fs.readFile(path.join(pkgDir, f), "utf8").catch(() => "");
    if ((capability && body.includes(capability)) || overlap(w, words(body)) >= 4) files.push(f);
  }
  const linear = [...backlog, ...moves].filter((x) => x.trackerUrl).map((x) => ({ title: x.title, url: x.trackerUrl }));
  return {
    prd: sections.filter((s) => s.tab === "prd").map((s) => ({ key: s.key, ref: s.ref, title: s.title })),
    trd: sections.filter((s) => s.tab === "trd").map((s) => ({ key: s.key, ref: s.ref, title: s.title })),
    backlog: backlog.map((b) => ({ id: b.id, title: b.title })),
    workflows: workflows.map((b) => ({ id: b.id, title: b.title })),
    moves: moves.map((m) => ({ id: m.id, title: m.title, status: m.status })),
    artifacts: files,
    linear,
  };
}

export type ChangeImpact = NonNullable<Awaited<ReturnType<typeof changeImpact>>>;
