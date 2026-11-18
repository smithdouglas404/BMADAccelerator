import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string; name: string }> };

// One file of the latest assembled Claude Code package (studio/package/), as the Brief lists it.
// ?as=download downloads it; otherwise it opens as text.
export async function GET(req: Request, { params }: Ctx) {
  const { id, name } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = path.basename(decodeURIComponent(name));
  const data = await fs.readFile(workspacePath(uc.slug, "studio", "package", file)).catch(() => null);
  if (!data) return NextResponse.json({ error: "That file isn't in the latest package. Build or download the package to assemble it." }, { status: 404 });
  const download = new URL(req.url).searchParams.get("as") === "download";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.replace(/[^\w.\- ]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "no-store",
    },
  });
}
