import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; mid: string; did: string }> };

// Opens or downloads a file attached to a card.
export async function GET(_req: Request, { params }: Ctx) {
  const { id, mid, did } = await params;
  const doc = await prisma.document.findFirst({ where: { id: did, useCaseId: id, moveId: mid } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await fs.readFile(doc.storagePath).catch(() => null);
  if (!data) return NextResponse.json({ error: "The file is missing from the workspace." }, { status: 404 });
  const inline = /^(image\/|application\/pdf|text\/)/.test(doc.mimeType);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
