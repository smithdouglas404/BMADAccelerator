import { NextResponse } from "next/server";
import { connectStudioMcp } from "@/lib/nasiko/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Registers the Studio's own MCP connector in Nasiko's MCP gateway (look only). Safe to run again.
export async function POST() {
  return NextResponse.json(await connectStudioMcp());
}
