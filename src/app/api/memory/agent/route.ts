import { NextResponse } from "next/server";
import { latestNarrative, readAgentMemory } from "@/lib/memory/inspect";
import { parseRef } from "@/lib/memory/inspectCore";

export const dynamic = "force-dynamic";

// One agent's memory as Letta and Mem0 hold it now, and the latest narrative written from it. Read-only.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ref = parseRef(u.searchParams.get("ref") ?? "");
  if (!ref) return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  const f = { customer: u.searchParams.get("customer") ?? "", useCaseId: u.searchParams.get("useCase") ?? "" };
  const q = u.searchParams.get("q") ?? "";
  const m = await readAgentMemory(ref, f, q);
  if (!m) return NextResponse.json({ error: "No such agent" }, { status: 404 });
  const narrative = await latestNarrative(ref, f);
  // A search shows fewer records, so it never marks the narrative out of date.
  return NextResponse.json({ ...m, searched: q, narrative, narrativeStale: Boolean(!q && narrative && narrative.fingerprint !== m.fingerprint) });
}
