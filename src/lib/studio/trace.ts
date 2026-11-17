import { prisma } from "@/lib/db";
import { cleanTrace, type TraceStep } from "./spec";
export { SESSION_EDGES, clip58 } from "./edges";

/** Appends real-event steps to a section's trace; `once` skips steps already there (same label and detail). */
export async function addTrace(useCaseId: string, key: string, steps: TraceStep[], opts: { once?: boolean } = {}) {
  const s = await prisma.specSection.findUnique({ where: { useCaseId_key: { useCaseId, key } } });
  if (!s) return;
  const have = cleanTrace(s.trace);
  const add = opts.once ? steps.filter((n) => !have.some((h) => h.label === n.label && h.detail === n.detail)) : steps;
  if (!add.length) return;
  await prisma.specSection.update({ where: { id: s.id }, data: { trace: cleanTrace([...have, ...add]) } });
}
