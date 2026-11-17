import { NextResponse } from "next/server";
import { exchange } from "@/lib/connect/oauth";

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const params = type.includes("json") ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>)) : new URLSearchParams(await req.text());
  const r = await exchange(params);
  return NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
