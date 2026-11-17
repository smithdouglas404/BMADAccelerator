import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSkill, setSkillEnabled } from "@/lib/customSkills";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  try {
    return NextResponse.json(await setSkillEnabled(id, parsed.data.enabled));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteSkill(id).catch(() => null);
  return NextResponse.json({ ok: true });
}
