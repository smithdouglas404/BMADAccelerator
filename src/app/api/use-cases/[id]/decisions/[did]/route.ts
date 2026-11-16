import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { rememberDecision } from "@/lib/memory";
import { changeImpact } from "@/lib/studio/impact";
import { recordChange } from "@/lib/studio/truthlog";
import { syncAgents } from "@/lib/agentService";

type Ctx = { params: Promise<{ id: string; did: string }> };

const Body = z.object({
  status: z.enum(["approved", "assumed", "open", "rejected"]).optional(),
  // Who decided, for the record (several people can work on one product).
  by: z.string().max(80).optional(),
  answer: z.string().max(4000).optional(),
  text: z.string().trim().min(2).max(2000).optional(),
  includeInBuild: z.boolean().optional(),
});

// The owner answers, approves, corrects or reopens a decision. A change tells the Muse what it touches.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, did } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const before = await prisma.decision.findFirst({ where: { id: did, useCaseId: id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { by, ...d } = parsed.data;
  // A checkpoint is approved or rejected with an optional comment (kept as the answer).
  const status = d.status === "rejected" ? "rejected" : d.answer && !d.status ? "approved" : d.status;
  const after = await prisma.decision.update({
    where: { id: did },
    data: { ...d, ...(status ? { status } : {}), ...(status === "approved" || status === "rejected" ? { resolvedAt: new Date(), builtInVersion: 0 } : {}), ...(status === "rejected" ? { includeInBuild: false } : {}) },
  });
  // A proposed agent's checkpoint: Approve registers it with the shared agent service; Reject switches it off.
  if (status === "approved" || status === "rejected") {
    const agent = await prisma.appAgent.findFirst({ where: { useCaseId: id, decisionId: did } });
    if (agent) {
      await prisma.appAgent.update({ where: { id: agent.id }, data: { status: status === "approved" ? "approved" : "off" } });
      void syncAgents(id).catch((e) => console.error("agent sync", e));
    }
  }
  const meaningChanged = (status && status !== before.status) || (d.text && d.text !== before.text) || (d.answer && d.answer !== before.answer);
  if (meaningChanged) {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id } });
    rememberDecision(uc, "muse", `Decision ${after.status}: ${after.text}${after.answer ? ` (answer: ${after.answer})` : ""}`, "studio:decision");
    const kind = status === "rejected" ? "rejected" : status === "approved" && before.status !== "approved" ? "approved" : "changed";
    await recordChange(id, { node: `decision:${did}`, kind, summary: `${by || "The owner"} ${kind === "changed" ? "changed" : kind} the decision${after.answer ? `: “${after.answer}”` : ""}`, before: `${before.text} (${before.status})`, after: `${after.text} (${after.status})`, by: by || "Owner" });
    const impact = await changeImpact(id, { decisionId: did });
    if (agentsEnabled()) {
      const touched = impact ? [...impact.prd, ...impact.trd].map((s) => `${s.ref} ${s.title}`).join(", ") : "";
      await enqueue(
        id,
        "decision",
        `${by ? by : "The owner"} ${status === "rejected" ? "rejected" : "changed"} a decision (id ${did}): "${before.text}" (${before.status}) is now "${after.text}" (${after.status})${after.answer ? `, ${status === "rejected" ? "comment" : "answer"}: "${after.answer}"` : ""}. ${status === "rejected" ? "Do not build it; propose a better option if their comment points to one. " : ""}Carry it through the product truth: update the affected spec sections${touched ? ` (${touched})` : ""}, capabilities and backlog, and tell the owner in one line what it changed.`,
        `decision:${did}`,
      );
    }
    return NextResponse.json({ decision: after, impact });
  }
  return NextResponse.json({ decision: after, impact: null });
}
