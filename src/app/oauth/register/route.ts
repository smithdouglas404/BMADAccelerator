import { NextResponse } from "next/server";
import { registerClient } from "@/lib/connect/oauth";

// Dynamic client registration (RFC 7591): an assistant registers itself before asking to connect.
export async function POST(req: Request) {
  const r = await registerClient((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!r) return NextResponse.json({ error: "invalid_redirect_uri", error_description: "Give https redirect URIs (or http on localhost)." }, { status: 400 });
  return NextResponse.json(r, { status: 201, headers: { "access-control-allow-origin": "*" } });
}
