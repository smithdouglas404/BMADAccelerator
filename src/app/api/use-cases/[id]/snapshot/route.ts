import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { snapshot } from "@/lib/snapshot";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  path: z.string().max(2000).default("/"),
  width: z.number().int().min(320).max(2400),
  height: z.number().int().min(240).max(2400),
});

// A picture of the generated screen, at the size the person sees it, to mark up.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc?.previewPort) return NextResponse.json({ error: "Generate the app first." }, { status: 409 });
  const p = parsed.data.path.startsWith("/") ? parsed.data.path : `/${parsed.data.path}`;
  try {
    const png = await snapshot(`http://127.0.0.1:${uc.previewPort}${p}`, parsed.data.width, parsed.data.height);
    return NextResponse.json({ image: `data:image/png;base64,${png.toString("base64")}` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
