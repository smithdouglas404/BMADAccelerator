import { NextResponse } from "next/server";
import { LOCAL_ONLY_MESSAGE, isLocalRequest } from "@/lib/localOnly";
import { letta, memoryStatus, promoteAllLessons } from "@/lib/memory";
import { ROLES } from "@/lib/memory/lettaCore";

export const dynamic = "force-dynamic";

// The memory services' health, each role's top lessons and the shared use-case block.
export async function GET(req: Request) {
  if (!isLocalRequest(req.headers)) return NextResponse.json({ error: LOCAL_ONLY_MESSAGE, localOnly: true }, { status: 403 });
  const status = await memoryStatus();
  const lessons = status.letta.up ? await letta.topLessons().catch(() => []) : [];
  const portfolio = status.letta.up ? await letta.portfolio().catch(() => []) : [];
  return NextResponse.json({
    ...status,
    roles: ROLES.map((r) => ({
      key: r.key,
      name: r.name,
      title: r.title,
      agent: status.letta.agents.find((a) => a.role === r.key)?.id ?? null,
      lessons: lessons.find((l) => l.role.key === r.key)?.lessons ?? "",
    })),
    portfolio,
  });
}

// Copies each role's best lessons from Mem0 into its Letta block now, instead of waiting for the daily run.
export async function POST(req: Request) {
  if (!isLocalRequest(req.headers)) return NextResponse.json({ error: LOCAL_ONLY_MESSAGE, localOnly: true }, { status: 403 });
  const promoted = await promoteAllLessons();
  return NextResponse.json({ promoted });
}
