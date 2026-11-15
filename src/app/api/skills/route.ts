import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUploadedSkill } from "@/lib/customSkills";

export async function GET() {
  return NextResponse.json(await prisma.customSkill.findMany({ orderBy: { createdAt: "desc" } }));
}

// Upload a skill (.zip of its folder, or a SKILL.md). It is validated with BMAD's own
// validator and stays off until someone switches it on.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Skill is over 20 MB." }, { status: 400 });
  try {
    const skill = await saveUploadedSkill(file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(skill, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
