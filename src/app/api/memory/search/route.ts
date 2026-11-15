import { NextResponse } from "next/server";
import { searchMemory } from "@/lib/memory";

export const dynamic = "force-dynamic";

// Searches what every use case taught: decisions, answers, lessons, feedback and builds.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ hits: [] });
  const hits = await searchMemory(q, { limit: 12 });
  return NextResponse.json({
    hits: hits.map((h) => {
      const md = (h.metadata ?? {}) as Record<string, unknown>;
      return { id: h.id, memory: h.memory, score: h.score ?? null, kind: md.kind ?? "", role: md.agent_role ?? "", useCase: md.use_case_title ?? "" };
    }),
  });
}
