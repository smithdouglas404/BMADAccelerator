import { prisma } from "@/lib/db";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";
import { rememberDecision } from "@/lib/memory";
import { recordChange } from "./truthlog";

// A person edited something on a screen in their own words. Every such edit is kept with who made it
// (Why did this change?), remembered as their decision, and handed to Socra so the rest of the product
// follows it. Their words win: Socra carries the change outward and never rewrites what they wrote.
export async function ownerEdited(
  useCaseId: string,
  e: { node: string; what: string; before: string; after: string; by?: string; cause?: string; logged?: boolean },
) {
  if (e.before === e.after) return;
  const who = (e.by || "").trim() || "The owner";
  if (!e.logged) await recordChange(useCaseId, { node: e.node, kind: "changed", summary: `${who} edited ${e.what} in their own words`, before: e.before, after: e.after, by: who });
  const uc = await prisma.useCase.findUnique({ where: { id: useCaseId } });
  if (uc) rememberDecision(uc, "muse", `${who} edited ${e.what}. Now: ${e.after.slice(0, 1500)}`, "studio:owner-edit");
  if (agentsEnabled())
    await enqueue(
      useCaseId,
      "user",
      `${who} edited ${e.what} directly on the screen, in their own words. Before: "${e.before.slice(0, 1200)}". Now: "${e.after.slice(0, 2000)}". Their text stands as written: do not rewrite it. Carry the change into whatever it touches (spec sections with set_spec_section, the PRFAQ, cards, open decisions), and tell them in one line what it changed, or that nothing else needed to change.`,
      e.cause ?? e.node,
    );
}
