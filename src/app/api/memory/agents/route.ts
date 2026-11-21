import { NextResponse } from "next/server";
import { LOCAL_ONLY_MESSAGE, isLocalRequest } from "@/lib/localOnly";
import { listAgents } from "@/lib/memory/inspect";

export const dynamic = "force-dynamic";

// Settings > Agent memory: every agent whose memory can be read, filtered by customer or use case.
export async function GET(req: Request) {
  if (!isLocalRequest(req.headers)) return NextResponse.json({ error: LOCAL_ONLY_MESSAGE, localOnly: true }, { status: 403 });
  const u = new URL(req.url);
  return NextResponse.json(await listAgents({ customer: u.searchParams.get("customer") ?? "", useCaseId: u.searchParams.get("useCase") ?? "" }));
}
