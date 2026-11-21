import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { itemTrace } from "@/lib/studio/itemTrace";

type Ctx = { params: Promise<{ id: string }> };

// One backlog item's or Board card's Traceability: ?node=backlog:<id> or ?node=move:<id>. Real records only.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const node = new URL(req.url).searchParams.get("node") ?? "";
  const m = node.match(/^(backlog|move):([a-z0-9]{8,40})$/i);
  if (!m) return NextResponse.json({ error: "Name the item as backlog:<id> or move:<id>." }, { status: 400 });
  const exists = m[1] === "backlog" ? await prisma.backlogItem.findFirst({ where: { id: m[2], useCaseId: id }, select: { id: true } }) : await prisma.move.findFirst({ where: { id: m[2], useCaseId: id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await itemTrace(id, node));
}
