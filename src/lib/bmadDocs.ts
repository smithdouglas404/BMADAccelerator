// Which BMAD document a workspace file is, so the stage cards can show the real
// files instead of a fixed "Not started". Pure: no imports, so tests can load it.

export type DocKey =
  | "intake"
  | "brief"
  | "prfaq"
  | "research"
  | "prd"
  | "ux"
  | "architecture"
  | "tickets"
  | "plans"
  | "tests"
  | "retro"
  | "readiness";

export type DocFile = {
  key: DocKey;
  path: string; // relative to the workspace folder, always with "/"
  title: string;
  role: "main" | "supporting" | "review";
  updatedAt: string;
  status: "draft" | "approved";
};

export type DocStatus = "missing" | "draft" | "approved";

// The sign-off gate that approves each document, matched against sign-off titles.
const GATES: Partial<Record<DocKey, RegExp>> = {
  brief: /\bbrief\b/i,
  prfaq: /\bprfaq\b/i,
  prd: /\bprd\b|product requirements/i,
  ux: /\bux\b|design|experience/i,
  architecture: /architecture/i,
  tickets: /ticket|epic|stor(y|ies)|breakdown/i,
  retro: /retro/i,
  readiness: /readiness|\btea\b/i,
};

function words(s: string) {
  return s
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Returns null for files that are not documents a client reads (memory logs, templates, HTML copies).
export function classifyDoc(rel: string): Omit<DocFile, "updatedAt" | "status"> | null {
  const p = rel.replace(/\\/g, "/");
  const name = p.split("/").pop() ?? "";
  const lower = p.toLowerCase();
  if (!/\.md$/i.test(name)) return null;
  if (/^\.|\.memlog\.md$|\.template\.md$/i.test(name)) return null;
  if (lower.startsWith("bacc/uploads/") || lower.includes("/imports/") || lower.includes("node_modules/")) return null;
  const review = /(^|\/)reviews?\//.test(lower) || /^review[-_]/i.test(name);

  if (lower === "bacc/intake.md") return { key: "intake", path: p, title: "Use-case brief", role: "main" };
  if (lower === "bacc/floor.md") return { key: "intake", path: p, title: "Product floor (everything this kind of product has)", role: "supporting" };
  if (lower.startsWith("bacc/design/")) {
    const base = name.toLowerCase();
    const title =
      base === "concept.md"
        ? "Design concept (advisor)"
        : base === "options.md"
          ? "Design options catalogue"
          : base === "picks.md"
            ? "Your picks"
            : base === "components.md"
              ? "Component list (shadcn)"
              : base === "direction.md"
                ? "Design direction (Generate)"
                : cap(words(name));
    return { key: "ux", path: p, title, role: "supporting" };
  }
  if (lower.startsWith("bacc/advisor/")) {
    const isMap = /agentic/i.test(name);
    return { key: isMap ? "architecture" : "brief", path: p, title: isMap ? "AI and agent map (advisor)" : `Advisor: ${words(name)}`, role: "supporting" };
  }
  if (!lower.startsWith("_bmad-output/")) return null;

  const segs = lower.split("/");
  const has = (re: RegExp) => segs.some((s) => re.test(s));
  const mk = (key: DocKey, title: string, main: boolean) => ({
    key,
    path: p,
    title: review ? `Review: ${words(name).replace(/^review /i, "")}` : title,
    role: review ? ("review" as const) : main ? ("main" as const) : ("supporting" as const),
  });

  if (/story.*plan\.md$/i.test(name)) return mk("plans", `Story plan ${words(name).replace(/^story /i, "").replace(/ plan$/i, "")}`, true);
  if (has(/^generate$/)) return mk("plans", cap(words(name)).replace(/^Generate notes (\d+)$/i, "Build notes, version $1"), false);
  if (has(/^prfaq/) || /prfaq/i.test(name)) return mk("prfaq", "PRFAQ", true);
  if (has(/^brief-/)) return mk("brief", "Product brief", /^brief-/i.test(name));
  if (has(/research|recon/)) return mk("research", cap(words(name)), true);
  if (has(/^prd-/) || /^prd[-.]/i.test(name)) return mk("prd", "PRD", /^prd/i.test(name));
  if (has(/^ux-/)) {
    const t = /^design\.md$/i.test(name) ? "DESIGN (how it looks)" : /^experience\.md$/i.test(name) ? "EXPERIENCE (how it behaves)" : "UX overview";
    return mk("ux", t, /^(design|experience)\.md$/i.test(name));
  }
  if (has(/^architecture/)) return mk("architecture", "Architecture spine", /^architecture/i.test(name));
  if (has(/^tickets$/)) {
    const epic = name.match(/^epic-(.+)\.md$/i);
    return mk("tickets", epic ? `Epic: ${words(epic[1])}` : cap(words(name)), !!epic);
  }
  if (/test/i.test(name) || has(/^tests?$/)) return mk("tests", cap(words(name)), true);
  if (/retro/i.test(name)) return mk("retro", "Retrospective", true);
  if (/readiness|^tea[-_.]/i.test(name)) return mk("readiness", "Production readiness", true);
  if (/^initiative-/i.test(name)) return mk("brief", "Initiative overview", false);
  return null;
}

// A document is approved once a matching sign-off was approved; otherwise a file on disk is a draft.
export function docApproved(key: DocKey, signoffs: { title: string; status: string }[]): boolean {
  const re = GATES[key];
  if (!re) return false;
  return signoffs.some((s) => (s.status === "approved" || s.status === "answered") && re.test(s.title.replace(/^Sign off:\s*/i, "")));
}

export function statusOf(key: DocKey, files: DocFile[]): DocStatus {
  const own = files.filter((f) => f.key === key && f.role !== "review");
  if (!own.length) return "missing";
  return own.some((f) => f.status === "approved") ? "approved" : "draft";
}

const ORDER = { main: 0, supporting: 1, review: 2 } as const;
export function sortDocs(files: DocFile[]): DocFile[] {
  return [...files].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.path.localeCompare(b.path, undefined, { numeric: true }));
}
