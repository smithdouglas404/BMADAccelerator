import { NextResponse } from "next/server";
import { z } from "zod";
import { librarySkills, readLibrarySkill, setEccScope, studioSkillsHome } from "@/lib/skillLibrary";

// The one skill library: ECC, the Studio's own skills and uploaded ones, with where each is switched on.
// ?read=studio:<name> or ecc:<name> returns that skill's SKILL.md; ?home=1 says where the Studio's own live.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("home")) return NextResponse.json(await studioSkillsHome());
  const read = q.get("read");
  if (read) {
    const r = await readLibrarySkill(read);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await librarySkills());
}

const Body = z.object({
  skill: z.string().min(1).max(100),
  allProducts: z.boolean(),
  useCases: z.array(z.string().max(64)).max(500).default([]),
});

// Switch an ECC skill on for every product, for chosen products, or off (allProducts false, no products).
export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  try {
    await setEccScope(parsed.data.skill, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
