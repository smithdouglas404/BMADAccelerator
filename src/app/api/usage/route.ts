import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rollup } from "@/lib/agent/usageCore";

export const dynamic = "force-dynamic";

// What the Studio's Claude runs used and cost, per agent and per product, from Claude Code's own report at the end of each run.
// Not covered yet: document reading, the spoken-words cleaner, Letta and Mem0 (they run elsewhere); Jev has its own record.
export async function GET() {
  const rows = await prisma.llmUsage.findMany({ orderBy: { at: "desc" }, take: 5000 });
  const r = rollup(rows);
  const names = new Map((await prisma.useCase.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const recent = rows.filter((x) => !x.baseline).slice(0, 8).map((x) => ({ at: x.at, agent: x.agent, product: names.get(x.useCaseId) ?? "", model: x.model, tokens: x.inputTokens + x.outputTokens + x.cacheTokens, usd: x.costUsd, kind: x.kind }));
  return NextResponse.json({ ...r, byProduct: r.byProduct.map((p) => ({ ...p, name: names.get(p.useCaseId) ?? "Removed product" })), recent });
}
