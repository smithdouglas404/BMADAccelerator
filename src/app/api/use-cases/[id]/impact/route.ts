import { NextResponse } from "next/server";
import { changeImpact } from "@/lib/studio/impact";

type Ctx = { params: Promise<{ id: string }> };

// What a decision or a spec section touches: ?decision=<id> or ?section=<key>.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = new URL(req.url);
  const impact = await changeImpact(id, { decisionId: u.searchParams.get("decision") || undefined, sectionKey: u.searchParams.get("section") || undefined });
  if (!impact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(impact);
}
