import { NextResponse } from "next/server";
import { jevCostUsd, jevStats } from "@/lib/jev";

export const dynamic = "force-dynamic";

// What Jev (TypeSafe) is doing for the Studio: calls, agreement with the old method, what people did
// afterwards, speed and cost. Settings > Jev.
export async function GET() {
  const s = await jevStats();
  const cost = Object.fromEntries(Object.entries(s.features).map(([k, f]) => [k, jevCostUsd(f.tokens)]));
  return NextResponse.json({ ...s, cost });
}
