import { NextResponse } from "next/server";
import { LOCAL_ONLY_MESSAGE, isLocalRequest } from "@/lib/localOnly";
import { mem0Client } from "@/lib/memory";

export const dynamic = "force-dynamic";

// How one Mem0 record changed over time (Mem0's own history), for Settings > Agent memory. Read-only.
export async function GET(req: Request) {
  if (!isLocalRequest(req.headers)) return NextResponse.json({ error: LOCAL_ONLY_MESSAGE, localOnly: true }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return NextResponse.json({ error: "Unknown record" }, { status: 400 });
  const client = mem0Client();
  if (!client) return NextResponse.json({ error: "Mem0 is not configured here." }, { status: 503 });
  try {
    const raw = await client.history(id);
    const rows = Array.isArray(raw) ? raw : ((raw as { results?: unknown[] } | null)?.results ?? []);
    return NextResponse.json({ history: rows });
  } catch (e) {
    return NextResponse.json({ error: `Mem0 could not give its history: ${e instanceof Error ? e.message.slice(0, 200) : e}` }, { status: 502 });
  }
}
