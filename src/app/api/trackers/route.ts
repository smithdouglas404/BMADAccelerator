import { NextResponse } from "next/server";
import { trackerStatus } from "@/lib/trackers";

// Which trackers have credentials on the server (never the credentials themselves).
export async function GET() {
  return NextResponse.json(trackerStatus());
}
