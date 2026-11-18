import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerEdited } from "@/lib/studio/ownerEdits";

type Ctx = { params: Promise<{ id: string; eid: string }> };

const Body = z.object({
  insight: z.string().trim().min(2).max(4000).optional(),
  source: z.string().trim().max(600).optional(),
  trace: z.string().trim().max(1200).optional(),
  confidence: z.enum(["high", "medium", "open"]).optional(),
  by: z.string().max(80).default(""),
});

// A person corrects an evidence card in place: what it says, where it came from, what it supports, how sure it is.
// The card keeps its id and its links; the edit is logged with who made it and Socra carries it through.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, eid } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "That change isn't valid." }, { status: 400 });
  const ev = await prisma.evidence.findFirst({ where: { id: eid, useCaseId: id } });
  if (!ev) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { by, ...fields } = parsed.data;
  const after = await prisma.evidence.update({ where: { id: eid }, data: fields });
  const show = (e: typeof ev) => `${e.insight}\nSource: ${e.source}\nSupports: ${e.trace}\nConfidence: ${e.confidence}`;
  await ownerEdited(id, { node: `evidence:${eid}`, what: `the evidence card “${ev.insight.slice(0, 80)}”`, before: show(ev), after: show(after), by });
  return NextResponse.json(after);
}
