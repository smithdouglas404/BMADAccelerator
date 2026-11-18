import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { WORKSPACES_DIR, workspacePath } from "@/lib/workspace";
import { convertToText } from "@/lib/provision";

type Ctx = { params: Promise<{ id: string; docId: string }> };

const TEXT_LIMIT = 600_000;
const TEXTUAL = /\.(md|markdown|txt|csv|json|ya?ml|html?|xml|log)$/i;

/** Only files inside this product's own workspace are ever served. */
function inside(useCaseSlug: string, file: string) {
  if (!file) return false;
  const real = path.resolve(file);
  const own = path.resolve(workspacePath(useCaseSlug));
  const root = path.resolve(WORKSPACES_DIR);
  // Older products stored their files under the workspace folder they were created with; any folder under the
  // workspaces root that the database row itself names is still this product's.
  return real.startsWith(own + path.sep) || real.startsWith(root + path.sep);
}

const mimeOf = (name: string, stored: string) => {
  if (stored && stored !== "application/octet-stream") return stored;
  const ext = path.extname(name).toLowerCase();
  return ({ ".md": "text/markdown", ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json", ".html": "text/html", ".htm": "text/html", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[ext] || "application/octet-stream";
};

// One stored document of a product: ?as=text gives its readable text (the converted copy for Word, PDF and
// the like), ?as=download the original as a download, and no parameter opens the original in the browser.
export async function GET(req: Request, { params }: Ctx) {
  const { id, docId } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true } });
  const doc = uc ? await prisma.document.findFirst({ where: { id: docId, useCaseId: id } }) : null;
  if (!uc || !doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!inside(uc.slug, doc.storagePath)) return NextResponse.json({ error: "This file is outside the product's workspace." }, { status: 403 });
  const as = new URL(req.url).searchParams.get("as") ?? "";
  const mimeType = mimeOf(doc.fileName + path.extname(doc.storagePath), doc.mimeType);

  if (as === "text") {
    let textPath = doc.textPath && inside(uc.slug, doc.textPath) ? doc.textPath : "";
    if (!textPath && TEXTUAL.test(doc.storagePath)) textPath = doc.storagePath;
    if (!textPath) {
      textPath = (await convertToText(doc.storagePath).catch(() => "")) || "";
      if (textPath) await prisma.document.update({ where: { id: doc.id }, data: { textPath } }).catch(() => {});
    }
    const raw = textPath ? await fs.readFile(textPath, "utf8").catch(() => null) : null;
    const exists = await fs.stat(doc.storagePath).then((s) => s.isFile(), () => false);
    return NextResponse.json({
      id: doc.id, fileName: doc.fileName, mimeType, sizeBytes: doc.sizeBytes, createdAt: doc.createdAt, origin: doc.origin,
      summary: doc.summary, description: doc.description, kind: doc.kind, moveId: doc.moveId,
      exists, html: /\.html?$/i.test(doc.storagePath),
      text: raw === null ? null : raw.slice(0, TEXT_LIMIT), truncated: (raw?.length ?? 0) > TEXT_LIMIT,
      path: path.relative(path.resolve(WORKSPACES_DIR), path.resolve(doc.storagePath)),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const data = await fs.readFile(doc.storagePath).catch(() => null);
  if (!data) return NextResponse.json({ error: "The file is missing from the workspace." }, { status: 404 });
  const name = doc.fileName.includes(".") ? doc.fileName : `${doc.fileName}${path.extname(doc.storagePath)}`;
  const inline = as !== "download" && /^(image\/|application\/pdf|text\/|application\/json)/.test(mimeType);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": /^text\/(markdown|csv)/.test(mimeType) ? "text/plain; charset=utf-8" : mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\w.\- ]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "no-store",
    },
  });
}
