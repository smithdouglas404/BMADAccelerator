import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { snapshot } from "@/lib/snapshot";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  path: z.string().max(2000).default("/"),
  width: z.number().int().min(320).max(2400),
  height: z.number().int().min(240).max(2400),
  full: z.boolean().default(false),
  scrollY: z.number().min(0).max(100000).default(0),
  point: z.object({ x: z.number().min(0), y: z.number().min(0) }).optional(),
});

// Vibe review: a picture of the live product at the size the owner sees it, and the name of the part
// they clicked, to attach to their annotation.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc?.previewPort) return NextResponse.json({ error: "Build the product first." }, { status: 409 });
  const p = parsed.data.path.startsWith("/") ? parsed.data.path : `/${parsed.data.path}`;
  try {
    const { image, target } = await snapshot(`http://127.0.0.1:${uc.previewPort}${p}`, parsed.data.width, parsed.data.height, parsed.data);
    return NextResponse.json({ image: `data:image/png;base64,${image.toString("base64")}`, target });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
