import { promises as fs } from "fs";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb) return new Response("Not found", { status: 404 });
  const png = await fs.readFile(fb.imagePath);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
