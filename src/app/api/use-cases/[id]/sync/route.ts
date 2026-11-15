import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { pushToGit, syncPreview, syncToLinear } from "@/lib/studio/sync";
import { writePackage } from "@/lib/studio/state";

type Ctx = { params: Promise<{ id: string }> };

// What would push from the Studio (backlog records and spec diffs), before anything is sent.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await syncPreview(id));
}

// Git: the package, backlog records and spec changes go to the product's branch. Linear: capabilities,
// backlog, build moves and spec changes as issues. Both repeatable and never destructive.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = z.object({ kind: z.enum(["git", "linear"]) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  if (!(await prisma.useCase.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    if (parsed.data.kind === "git") {
      await writePackage(id);
      return NextResponse.json(await pushToGit(id));
    }
    return NextResponse.json(await syncToLinear(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
