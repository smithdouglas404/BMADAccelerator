import { NextResponse } from "next/server";
import { recordChange } from "@/lib/studio/truthlog";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { ensureWorkspace, workspacePath } from "@/lib/workspace";
import { describeDocument } from "@/lib/docAgent";
import { writeIntake } from "@/lib/provision";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { cleanTrace } from "@/lib/studio/spec";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB per file

// Research and evidence: interviews, PDFs, competitive research, screenshots, documents, design
// references, analytics exports, customer feedback. Each upload is stored in studio/uploads/, shown as
// evidence straight away, read by the document agent (claims, contradictions, questions, potential
// requirements, confidence) and handed to Socra. Research never silently becomes a requirement.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });
  const kind = String(form.get("kind") || "uploaded");
  const opening = form.get("opening") === "1";
  // Added on the PRD or TRD screen (Doug, Nov 21): for one section (its key) or for the whole document ("prd" | "trd").
  const forSpec = String(form.get("section") || "");
  const section = forSpec && forSpec !== "prd" && forSpec !== "trd" ? await prisma.specSection.findUnique({ where: { useCaseId_key: { useCaseId: id, key: forSpec } } }) : null;
  const forDoc = section ? section.tab : forSpec === "prd" || forSpec === "trd" ? forSpec : "";
  await ensureWorkspace(uc.slug);
  const created: { id: string; storagePath: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) continue;
    const safeName = path.basename(file.name).replace(/[^\w.\- ]/g, "_");
    const storagePath = workspacePath(uc.slug, "studio", "uploads", `${randomUUID().slice(0, 8)}-${safeName}`);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
    const doc = await prisma.document.create({
      data: { useCaseId: id, fileName: safeName, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, storagePath, kind, status: "approved", approved: true },
    });
    await prisma.evidence.create({
      data: { useCaseId: id, documentId: doc.id, source: safeName, type: ["interview", "research"].includes(kind) ? kind : "uploaded", insight: "New source uploaded — Socra will extract the product signal next.", confidence: "open", trace: "Awaiting synthesis" },
    });
    created.push(doc);
    if (section) {
      const trace = cleanTrace([...(Array.isArray(section.trace) ? section.trace : []), { label: "Document added", detail: safeName, type: "evidence" }]).slice(-12);
      await prisma.specSection.update({ where: { id: section.id }, data: { related: [...new Set([...section.related, doc.id])], trace: trace as object } });
    }
    await recordChange(id, { node: `doc:${doc.id}`, kind: "added", summary: `${safeName} was added to the evidence library`, by: "Owner" });
  }
  await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  void Promise.all(created.map((d) => describeDocument(d.id).catch((e) => console.error("document agent", e)))).then(async () => {
    if (uc.provisioned) await writeIntake(id);
    if (!opening && agentsEnabled() && created.length)
      await enqueue(
        id,
        "evidence",
        `The owner added ${created.length === 1 ? "a source" : `${created.length} sources`} to the evidence library${section ? ` for ${section.tab.toUpperCase()} section ${section.ref} ${section.title} (${section.key})` : forDoc ? ` for the ${forDoc.toUpperCase()}` : ""}: ${created.map((d) => `studio/uploads/${path.basename(d.storagePath)}`).join(", ")}. The document agent already filed its signals, contradictions and questions as evidence and its potential requirements as suggestions. Read them, raise the floor or the spec where the evidence supports it (set_spec_section with an evidence trace step${section ? `, starting with ${section.key}; open the ${section.tab === "prd" ? "studio-prd" : "studio-trd"} skill first` : forDoc ? `, ${forDoc.toUpperCase()} sections first; open the ${forDoc === "prd" ? "studio-prd" : "studio-trd"} skill first` : ""}), ask the owner the one question the document leaves open if there is one, and tell them in one line what it changed.`,
        section ? `spec:${section.key}` : created[0] ? `doc:${created[0].id}` : "",
      );
  });
  return NextResponse.json(created, { status: 201 });
}
