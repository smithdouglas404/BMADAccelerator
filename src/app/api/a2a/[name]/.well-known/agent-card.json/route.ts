import { NextRequest, NextResponse } from "next/server";
import { a2aAllowed, agentCard } from "@/lib/nasiko/core";
import { specByName, studioBaseForNasiko } from "@/lib/nasiko/agents";

export const dynamic = "force-dynamic";

// The agent's card, A2A's open description of an agent. Local callers only, like the door itself.
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!a2aAllowed(req.headers)) return NextResponse.json({ error: "Local callers only." }, { status: 403 });
  const spec = await specByName((await params).name);
  if (!spec) return NextResponse.json({ error: "No such agent." }, { status: 404 });
  return NextResponse.json(agentCard(spec, studioBaseForNasiko()));
}
