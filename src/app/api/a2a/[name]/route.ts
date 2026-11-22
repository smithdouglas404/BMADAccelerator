import { NextRequest, NextResponse } from "next/server";
import { a2aAllowed, rpcErr } from "@/lib/nasiko/core";
import { specByName } from "@/lib/nasiko/agents";
import { handleRpc } from "@/lib/nasiko/a2a";

export const dynamic = "force-dynamic";

// The Studio's A2A door for one agent (see src/lib/nasiko/a2a.ts). For the Nasiko server beside the Studio only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!a2aAllowed(req.headers)) return NextResponse.json(rpcErr(null, -32600, "This door is for the Nasiko server beside the Studio, not the public address."), { status: 403 });
  const { name } = await params;
  const spec = await specByName(name);
  if (!spec) return NextResponse.json(rpcErr(null, -32001, "No such agent."), { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json(rpcErr(null, -32700, "The body is not JSON."), { status: 400 });
  return NextResponse.json(await handleRpc(spec, body));
}
