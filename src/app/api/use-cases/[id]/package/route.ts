import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assemblePackage } from "@/lib/studio/package";
import { SESSION_EDGES, addTrace } from "@/lib/studio/trace";
import { packageInput, writePackage } from "@/lib/studio/state";

type Ctx = { params: Promise<{ id: string }> };

// Assembles a fresh package (a new iteration, with a spec snapshot) and returns its files, with each
// annotation's captured frame embedded, for the browser to zip and download.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { iteration } = await writePackage(id);
  const files = assemblePackage(await packageInput(id, { frames: true, iteration }));
  // The export itself is a real event: the next package records it (the design team's v6 behaviour).
  await addTrace(id, ...SESSION_EDGES.packaged(), { once: true });
  return NextResponse.json({ iteration, files });
}
