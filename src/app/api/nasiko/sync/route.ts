import { NextResponse } from "next/server";
import { syncToNasiko } from "@/lib/nasiko/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Registers the Studio's agents in Nasiko. Safe to run again; never changes how the Studio's own agents run.
// Optional body { "studio_base": "http://host.containers.internal:3000" }: the address Nasiko uses to reach this Studio
// (Podman and Docker name the host differently). Only http(s) addresses are taken.
export async function POST(req: Request) {
  let base: string | undefined;
  try {
    const b = (await req.json()) as { studio_base?: unknown };
    if (typeof b.studio_base === "string" && /^https?:\/\/[^\s]+$/.test(b.studio_base)) base = b.studio_base;
  } catch {
    // no body: use the default address
  }
  return NextResponse.json(await syncToNasiko(base));
}
