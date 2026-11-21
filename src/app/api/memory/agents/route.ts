import { NextResponse } from "next/server";
import { listAgents } from "@/lib/memory/inspect";

export const dynamic = "force-dynamic";

// Settings > Agent memory: every agent whose memory can be read, filtered by customer or use case.
export async function GET(req: Request) {
  const u = new URL(req.url);
  return NextResponse.json(await listAgents({ customer: u.searchParams.get("customer") ?? "", useCaseId: u.searchParams.get("useCase") ?? "" }));
}
