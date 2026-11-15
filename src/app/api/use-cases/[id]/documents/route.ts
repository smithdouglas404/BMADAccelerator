import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { BMAD_DOC_TYPES, guessDocType } from "@/lib/bmad";
import { ensureWorkspace, workspacePath } from "@/lib/workspace";
import { describeDocument } from "@/lib/docAgent";
import { writeIntake } from "@/lib/provision";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB per file

// Uploads documents for a use case. Each file is stored in the use case workspace,
// given a suggested BMAD document type, and queued for review so the user can
// confirm its summary, tags and type before it is handed to BMAD.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const useCase = await prisma.useCase.findUnique({ where: { id } });
  if (!useCase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });

  await ensureWorkspace(useCase.slug);
  const created = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) continue;
    const safeName = path.basename(file.name).replace(/[^\w.\- ]/g, "_");
    const stored = `${randomUUID()}-${safeName}`;
    const storagePath = workspacePath(useCase.slug, "bacc", "uploads", stored);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
    const bmadType = guessDocType(safeName);
    const typeLabel = BMAD_DOC_TYPES.find((t) => t.key === bmadType)?.label ?? "Other";
    const doc = await prisma.document.create({
      data: {
        useCaseId: id,
        fileName: safeName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storagePath,
        bmadType,
        tags: [],
      },
    });
    await prisma.reviewItem.create({
      data: {
        useCaseId: id,
        kind: "document",
        title: `Confirm "${safeName}"`,
        detail: `Suggested type: ${typeLabel}. Add tags and a one-line description, then approve so BMAD knows what this document covers.`,
        reason: "New upload",
        source: "Document agent",
        targetId: doc.id,
      },
    });
    created.push(doc);
  }
  await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  // The document agent reads each upload in the background; the card updates when it is done.
  void Promise.all(created.map((d) => describeDocument(d.id).catch((e) => console.error("document agent", e)))).then(
    () => (useCase.provisioned ? writeIntake(id) : undefined),
  );
  return NextResponse.json(created, { status: 201 });
}
