import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { agentsEnabled } from "@/lib/agent/runner";
import { COMPARISON_FILE, runControlBuild, settleCompare } from "@/lib/compare";

type Ctx = { params: Promise<{ id: string }> };

// The comparison with plain Claude Code: where it stands, and the advisor's verdict once written.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = await settleCompare(uc.slug);
  const exists = await fs
    .access(workspacePath(uc.slug, COMPARISON_FILE))
    .then(() => true)
    .catch(() => false);
  return NextResponse.json({ ...status, comparison: exists ? COMPARISON_FILE : "" });
}

// Starts a control build (plain Claude Code from the client's own words) and the side-by-side review.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true, generateCount: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!agentsEnabled()) return NextResponse.json({ error: "Turn on the agents first (Settings > Models and keys)." }, { status: 503 });
  if (!uc.generateCount) return NextResponse.json({ error: "Build the app first, then compare it." }, { status: 409 });
  void runControlBuild(id);
  return NextResponse.json({ status: "started" }, { status: 202 });
}
