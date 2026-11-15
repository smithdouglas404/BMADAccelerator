import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { pullForward } from "@/lib/studio/actions";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const Body = z.object({
  kind: z.enum(["capture", "epic", "distraction"]).optional(),
  group: z.string().max(120).optional(),
  pull: z.boolean().optional(),
  includeInBuild: z.boolean().optional(),
});

// The owner curates a thought (group it into a capability, park it), pulls a recommendation forward,
// or ticks it for the next build. Nothing here turns a suggestion into a requirement silently.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, itemId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const item = await prisma.backlogItem.findFirst({ where: { id: itemId, useCaseId: id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.pull) return NextResponse.json(await pullForward(id, itemId));
  const { kind, group, includeInBuild } = parsed.data;
  const data: Record<string, unknown> = {};
  if (kind) {
    data.kind = kind;
    data.group = kind === "distraction" ? "Parked by Muse" : (group ?? item.group);
    if (kind === "distraction") data.state = "held";
  }
  if (includeInBuild !== undefined) {
    data.includeInBuild = includeInBuild;
    if (includeInBuild && item.state !== "built") data.state = "ready";
  }
  return NextResponse.json(await prisma.backlogItem.update({ where: { id: itemId }, data }));
}
