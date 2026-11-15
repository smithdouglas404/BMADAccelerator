import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { classifyDoc, docApproved, sortDocs, type DocFile } from "@/lib/bmadDocs";

type Ctx = { params: Promise<{ id: string }> };

async function walk(root: string, dir: string, out: string[], depth = 0) {
  if (depth > 8) return;
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(root, full, out, depth + 1);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
}

// GET lists the BMAD documents in the use case's workspace with their status.
// GET ?path=<relative path> returns one document's Markdown (only files the list would show).
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const root = workspacePath(uc.slug);
  const wanted = new URL(req.url).searchParams.get("path");

  if (wanted) {
    const doc = classifyDoc(wanted);
    const full = path.resolve(root, wanted);
    if (!doc || !full.startsWith(path.resolve(root) + path.sep)) return NextResponse.json({ error: "Not a BMAD document" }, { status: 400 });
    try {
      const [content, st] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
      return NextResponse.json({ ...doc, content: content.slice(0, 400_000), updatedAt: st.mtime.toISOString() });
    } catch {
      return NextResponse.json({ error: "That document isn't there any more" }, { status: 404 });
    }
  }

  const rels: string[] = [];
  await walk(root, path.join(root, "_bmad-output"), rels);
  await walk(root, path.join(root, "bacc"), rels);
  const signoffs = await prisma.reviewItem.findMany({ where: { useCaseId: id, kind: "signoff" }, select: { title: true, status: true } });
  const docs: DocFile[] = [];
  for (const rel of rels) {
    const c = classifyDoc(rel);
    if (!c) continue;
    const st = await fs.stat(path.join(root, rel)).catch(() => null);
    if (!st) continue;
    docs.push({ ...c, updatedAt: st.mtime.toISOString(), status: c.role !== "review" && docApproved(c.key, signoffs) ? "approved" : "draft" });
  }
  return NextResponse.json({ docs: sortDocs(docs) });
}
