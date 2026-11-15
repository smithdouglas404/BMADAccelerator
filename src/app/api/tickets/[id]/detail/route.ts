import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { parse } from "smol-toml";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };
type Entry = Record<string, unknown>;

function entries(doc: Record<string, unknown>): Entry[] {
  for (const key of ["entry", "entries", "ticket", "tickets", "epic", "epics", "story", "stories"]) {
    const v = doc[key];
    if (Array.isArray(v)) return v as Entry[];
  }
  return [];
}
async function readToml(file: string): Promise<Entry[]> {
  try {
    return entries(parse(await fs.readFile(file, "utf8")) as Record<string, unknown>);
  } catch {
    return [];
  }
}
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
async function mdFiles(dir: string, out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 4) return out;
  const list = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of list) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await mdFiles(full, out, depth + 1);
    else if (e.name.endsWith(".md") && !e.name.startsWith(".") && !/\.(memlog|template)\.md$/.test(e.name)) out.push(full);
  }
  return out;
}
function facts(e: Entry | undefined): [string, string][] {
  if (!e) return [];
  return Object.entries(e)
    .map(([k, v]) => [k, Array.isArray(v) ? v.map(str).filter(Boolean).join(", ") : str(v)] as [string, string])
    .filter(([k, v]) => v && !["title"].includes(k));
}

// What a board card is: the epic's own document, or the story's entry in the ticket tree and its plan.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const t = await prisma.ticket.findUnique({ where: { id }, include: { useCase: { select: { slug: true } } } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const root = workspacePath(t.useCase.slug);
  const outDir = path.join(root, "_bmad-output");
  const inits = (await fs.readdir(outDir).catch(() => [] as string[])).filter((d) => d.startsWith("initiative-"));
  const docs: { title: string; path: string; content: string }[] = [];
  let entry: Entry | undefined;

  const read = async (file: string, title: string) => {
    const content = await fs.readFile(file, "utf8").catch(() => "");
    if (content) docs.push({ title, path: path.relative(root, file).split(path.sep).join("/"), content: content.slice(0, 200_000) });
  };

  for (const init of inits) {
    const ticketsDir = path.join(outDir, init, "tickets");
    const epics = await readToml(path.join(ticketsDir, "tickets.toml"));
    const epicRef = t.kind === "epic" ? t.ref : t.epicRef;
    const epic = epics.find((e, i) => (str(e.id) || String(i + 1)) === epicRef);
    if (!epic) continue;
    const slugPart = str(epic.slug) || str(epic.id);
    const epicDir = path.join(ticketsDir, `epic-${slugPart}`);
    if (t.kind === "epic") {
      entry = epic;
      await read(path.join(epicDir, `epic-${slugPart}.md`), `Epic ${t.ref}: ${t.title}`);
    } else {
      const stories = await readToml(path.join(epicDir, "tickets", "tickets.toml"));
      entry = stories.find((s) => str(s.id) === t.ref);
      const keys = [t.ref, str(entry?.id), str(entry?.slug)].filter(Boolean).map((k) => k.toLowerCase());
      for (const f of await mdFiles(epicDir)) {
        const name = path.basename(f).toLowerCase();
        if (name.startsWith("epic-")) continue;
        if (keys.some((k) => name.includes(`-${k}-`) || name.includes(`-${k}.`) || name.includes(`story-${k}`) || (k.length > 3 && name.includes(k))))
          await read(f, /plan/.test(name) ? "Story plan" : path.basename(f, ".md"));
      }
      if (!docs.length) await read(path.join(epicDir, `epic-${slugPart}.md`), `Part of epic ${epicRef}: ${str(epic.title) || slugPart}`);
    }
    break;
  }
  return NextResponse.json({ ref: t.ref, kind: t.kind, title: t.title, status: t.status, bmadStatus: t.bmadStatus, facts: facts(entry), docs });
}
