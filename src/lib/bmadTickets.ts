import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { parse } from "smol-toml";
import { prisma } from "@/lib/db";
import { workspacePath, type TreeTicket } from "@/lib/workspace";

const run = promisify(execFile);
const UV = process.env.UV_BIN || "uv";

// The board reads and writes BMAD's ticket tree only through Sofia's own script,
// `bmad-agent-po/scripts/tickets.py`, so BMAD stays the source of truth.
function ticketsScript(slug: string) {
  return workspacePath(slug, ".claude/skills/bmad-agent-po/scripts/tickets.py");
}

async function tickets(slug: string, args: string[]) {
  const { stdout } = await run(UV, ["run", "--no-cache", ticketsScript(slug), "--project-root", workspacePath(slug), ...args], {
    cwd: workspacePath(slug),
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

// BMAD status -> board column. Board states per BMAD: none/draft/ready-for-dev are
// backlog, in-progress/blocked in progress, in-review/built review, then done.
export function columnFor(status: string): string {
  switch (status) {
    case "ready-for-dev":
      return "ready";
    case "in-progress":
    case "blocked":
      return "in_progress";
    case "in-review":
    case "built":
      return "built";
    case "done":
      return "done";
    default:
      return "backlog";
  }
}

// Board column -> the status `tickets.py mark` writes when a person moves a card.
export const STATUS_FOR_COLUMN: Record<string, string> = {
  backlog: "draft",
  ready: "ready-for-dev",
  in_progress: "in-progress",
  built: "in-review",
  done: "done",
};

type StatusRow = {
  ref: string;
  id: number | string;
  type: string;
  title: string;
  status: string;
  state: string;
  after?: (string | number)[];
  unknown?: string;
  verify?: string;
  blocked_reason?: string;
  tracker_status?: string;
  epic?: string;
};

async function epicTitles(slug: string, initiative: string) {
  const titles = new Map<string, { id: string; title: string }>();
  try {
    const doc = parse(
      await fs.readFile(workspacePath(slug, "_bmad-output", initiative, "tickets", "tickets.toml"), "utf8"),
    ) as { epic?: { id: number | string; slug?: string; title?: string }[] };
    for (const e of doc.epic ?? []) {
      titles.set(String(e.slug ?? e.id), { id: String(e.id), title: String(e.title ?? e.slug ?? e.id) });
    }
  } catch {
    /* no epics yet */
  }
  return titles;
}

export type BoardTicket = TreeTicket & { bmadStatus: string; blocked: boolean; column: string };

export async function readBoard(slug: string, initiative: string): Promise<BoardTicket[]> {
  try {
    await fs.access(ticketsScript(slug));
    await fs.access(workspacePath(slug, "_bmad-output", initiative, "tickets", "tickets.toml"));
  } catch {
    return [];
  }
  const status = await tickets(slug, ["status"]);
  const titles = await epicTitles(slug, initiative);
  const out: BoardTicket[] = [];
  const epics: { slug: string; id: number | string; refined?: boolean; status?: string }[] = status.epics ?? [];
  epics.forEach((e, i) => {
    const t = titles.get(e.slug) ?? titles.get(String(e.id));
    out.push({
      ref: String(e.id),
      kind: "epic",
      title: t?.title ?? e.slug,
      epicRef: "",
      after: [],
      unknown: "",
      verify: "",
      refined: e.refined !== false,
      position: i,
      bmadStatus: e.status ?? "",
      blocked: false,
      column: columnFor(e.status ?? ""),
    });
  });
  const rows: StatusRow[] = status.tickets ?? [];
  const epicIdBySlug = new Map(epics.map((e) => [e.slug, String(e.id)]));
  rows.forEach((r, i) => {
    if (r.status === "dropped") return;
    const epicRef = r.epic ? (epicIdBySlug.get(r.epic) ?? "") : "";
    out.push({
      ref: String(r.ref),
      kind: r.type || "story",
      title: r.title,
      epicRef,
      after: (r.after ?? []).map((a) => (typeof a === "number" && epicRef ? `${epicRef}.${a}` : String(a))),
      unknown: r.unknown ?? "",
      verify: r.verify ?? "",
      refined: true,
      position: i,
      bmadStatus: r.status || r.state || "",
      blocked: r.status === "blocked",
      column: columnFor(r.status),
    });
  });
  return out;
}

export async function markTicket(slug: string, ref: string, column: string) {
  const status = STATUS_FOR_COLUMN[column];
  if (!status) throw new Error(`Unknown column ${column}`);
  return tickets(slug, ["mark", ref, status]);
}

// Mirrors BMAD's tree into the database for the live board. Returns new unknowns.
export async function syncBoard(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  if (!uc.initiative) return { count: 0, newUnknowns: 0 };
  const tree = await readBoard(uc.slug, uc.initiative);
  let newUnknowns = 0;
  const seen = new Set<string>();
  for (const t of tree) {
    seen.add(t.ref);
    const existing = await prisma.ticket.findUnique({ where: { useCaseId_ref: { useCaseId, ref: t.ref } } });
    const data = {
      kind: t.kind,
      title: t.title,
      epicRef: t.epicRef,
      after: t.after,
      unknown: t.unknown,
      verify: t.verify,
      refined: t.refined,
      position: t.position,
      status: t.column,
      bmadStatus: t.bmadStatus,
      blocked: t.blocked,
    };
    if (existing) await prisma.ticket.update({ where: { id: existing.id }, data });
    else await prisma.ticket.create({ data: { useCaseId, ref: t.ref, ...data } });
    if (t.unknown && (!existing || existing.unknown !== t.unknown)) {
      newUnknowns++;
      await prisma.reviewItem.create({
        data: {
          useCaseId,
          kind: "unknown",
          title: t.unknown,
          detail: `${t.kind} ${t.ref}: ${t.title}`,
          reason: "Sofia needs this answered before the ticket can start.",
          source: "Sofia, Product Owner",
          targetId: t.ref,
        },
      });
    }
  }
  // Tickets BMAD no longer lists (dropped or moved) leave the board; feedback cards stay.
  await prisma.ticket.deleteMany({ where: { useCaseId, ref: { notIn: [...seen] }, kind: { not: "feedback" } } });
  const { syncUseCaseToLinear } = await import("@/lib/trackers");
  await syncUseCaseToLinear(useCaseId).catch((e) => console.error("linear sync", e));
  return { count: tree.length, newUnknowns };
}

export function initiativeDir(slug: string, initiative: string) {
  return path.join(workspacePath(slug), "_bmad-output", initiative);
}
