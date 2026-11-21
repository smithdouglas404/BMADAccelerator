import { NextResponse } from "next/server";
import { syncToNasiko } from "@/lib/nasiko/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Registers the Studio's agents in Nasiko. Safe to run again; never changes how the Studio's own agents run.
export async function POST() {
  return NextResponse.json(await syncToNasiko());
}
