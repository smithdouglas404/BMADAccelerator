import { promises as fs } from "fs";
import path from "path";
import { parse } from "smol-toml";

// Each use case gets its own workspace folder. BMAD writes its documents and the
// ticket tree under `_bmad-output/initiative-<slug>/` inside it.
export const WORKSPACES_DIR = process.env.WORKSPACES_DIR || path.join(process.cwd(), "workspaces");

export function workspacePath(slug: string, ...parts: string[]) {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  return path.join(WORKSPACES_DIR, safe, ...parts);
}

export async function ensureWorkspace(slug: string) {
  await fs.mkdir(workspacePath(slug, "uploads"), { recursive: true });
  return workspacePath(slug);
}

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "use-case"}-${Math.random().toString(36).slice(2, 6)}`;
}

export type TreeTicket = {
  ref: string;
  kind: string;
  title: string;
  epicRef: string;
  after: string[];
  unknown: string;
  verify: string;
  refined: boolean;
  position: number;
};

type TomlEntry = Record<string, unknown>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function entriesOf(doc: Record<string, unknown>): TomlEntry[] {
  // tickets.toml lists entries as an array of tables; accept common key names.
  for (const key of ["entry", "entries", "ticket", "tickets", "epic", "epics", "story", "stories"]) {
    const v = doc[key];
    if (Array.isArray(v)) return v as TomlEntry[];
  }
  return [];
}

// Reads BMAD's ticket tree for one initiative and returns a flat list for the Kanban.
// Initiative tickets.toml lists epics in build order; each epic's tickets.toml lists
// stories, bugs and spikes.
export async function readTicketTree(slug: string): Promise<TreeTicket[]> {
  const out: TreeTicket[] = [];
  const outputDir = workspacePath(slug, "_bmad-output");
  let initiatives: string[] = [];
  try {
    initiatives = (await fs.readdir(outputDir)).filter((d) => d.startsWith("initiative-"));
  } catch {
    return out;
  }
  for (const init of initiatives) {
    const initDir = path.join(outputDir, init);
    const epicsFile = path.join(initDir, "tickets", "tickets.toml");
    let epics: TomlEntry[] = [];
    try {
      epics = entriesOf(parse(await fs.readFile(epicsFile, "utf8")) as Record<string, unknown>);
    } catch {
      /* no epics yet */
    }
    let epicPos = 0;
    for (const e of epics) {
      const epicRef = asString(e.id) || String(epicPos + 1);
      const slugPart = asString(e.slug) || asString(e.id);
      const epicDir = path.join(initDir, "tickets", `epic-${slugPart}`);
      let refined = true;
      try {
        const md = await fs.readFile(path.join(epicDir, `epic-${slugPart}.md`), "utf8");
        if (/^refined:\s*false/m.test(md)) refined = false;
      } catch {
        /* epic file not written yet */
      }
      out.push({
        ref: epicRef,
        kind: "epic",
        title: asString(e.title) || slugPart,
        epicRef: "",
        after: Array.isArray(e.after) ? (e.after as string[]) : [],
        unknown: asString(e.unknown),
        verify: "",
        refined,
        position: epicPos++,
      });
      let stories: TomlEntry[] = [];
      try {
        stories = entriesOf(
          parse(await fs.readFile(path.join(epicDir, "tickets", "tickets.toml"), "utf8")) as Record<string, unknown>,
        );
      } catch {
        /* not sliced yet */
      }
      stories.forEach((s, i) => {
        out.push({
          ref: asString(s.id) || `${epicRef}.${i + 1}`,
          kind: asString(s.type) || "story",
          title: asString(s.title) || asString(s.id),
          epicRef,
          after: Array.isArray(s.after) ? (s.after as string[]) : [],
          unknown: asString(s.unknown),
          verify: asString(s.verify) || asString(s.Verify),
          refined: true,
          position: i,
        });
      });
    }
  }
  return out;
}
