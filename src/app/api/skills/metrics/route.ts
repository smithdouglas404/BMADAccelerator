import { NextResponse } from "next/server";
import { z } from "zod";
import { skillMetrics, logSkillEvents } from "@/lib/skillMetrics";

export const dynamic = "force-dynamic";

// Settings > Skills: real usage per skill, and a record that someone opened one.
export async function GET() {
  return NextResponse.json(await skillMetrics());
}

const Body = z.object({ skill: z.string().min(1).max(120) });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await logSkillEvents([{ skill: parsed.data.skill, kind: "viewed", agent: "a person on the Skills page" }]);
  return NextResponse.json({ ok: true });
}
