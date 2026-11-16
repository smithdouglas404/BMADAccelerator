import { workingName } from "@/lib/studio/core";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { pickPartners } from "@/lib/shadcnPartners";
import { workspacePath, WORKSPACES_DIR } from "@/lib/workspace";
import { eccSkillsFor } from "@/lib/skillLibrary";
import { ECC_SKILLS } from "@/lib/skills";

const run = promisify(execFile);

// Pinned copies of the design skills, the ECC skills library and the AgentKit docs live in vendor/
// (scripts/fetch-vendor.sh).
export const VENDOR_DIR = process.env.BACC_VENDOR_DIR || path.join(process.cwd(), "vendor");
// The Studio's own skills: Socra, the Studio rulebook (working-backwards-studio) and AgentKit.
export const STUDIO_SKILLS_DIR = path.join(process.cwd(), "studio-skills");
export const CUSTOM_SKILLS_DIR = path.join(WORKSPACES_DIR, "_custom-skills");

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string) {
  await fs.cp(src, dest, { recursive: true, force: true });
}


// Skill folders a product gets, all from the one skill library: the Studio's own skills, the design
// skills, the ECC skills switched on for it, and every uploaded skill that is switched on.
async function skillSources(useCaseId: string) {
  const sources: { name: string; dir: string }[] = [];
  for (const name of await fs.readdir(STUDIO_SKILLS_DIR)) sources.push({ name, dir: path.join(STUDIO_SKILLS_DIR, name) });
  // Anthropic's frontend-design, which Generate always uses.
  const fd = path.join(VENDOR_DIR, "anthropic", "skills", "frontend-design");
  if (await exists(fd)) sources.push({ name: "frontend-design", dir: fd });
  // From the ECC library: the design direction every build reads, the skills switched on for every
  // product, and this product's own picks (Settings > Skills).
  sources.push(...(await eccSkillsFor(useCaseId)));
  const custom = await prisma.customSkill.findMany({ where: { enabled: true, valid: true } });
  for (const c of custom) sources.push({ name: c.name, dir: c.path });
  return sources;
}

// Where skills go: .claude/skills always; Codex and Cursor .agents/skills; Antigravity .agent/skills.
async function skillTargets() {
  const prefs = await prisma.preferences.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } });
  const targets = [".claude/skills"];
  if (prefs.targetCodex || prefs.targetCursor) targets.push(".agents/skills");
  if (prefs.targetAntigravity) targets.push(".agent/skills");
  return targets;
}

export async function installSkills(useCaseId: string, slug: string) {
  const ws = workspacePath(slug);
  const sources = await skillSources(useCaseId);
  for (const t of await skillTargets()) {
    const dir = path.join(ws, t);
    await fs.mkdir(dir, { recursive: true });
    for (const s of sources) await copyDir(s.dir, path.join(dir, s.name));
  }
}

// The Studio's skills and the switched-on uploads, refreshed in every workspace before each turn so a
// rule added later (or a skill switched on in Settings) reaches products created before it.
export async function syncStudioSkills(useCaseId: string, slug: string) {
  const ws = workspacePath(slug);
  const targets = await skillTargets();
  for (const s of await skillSources(useCaseId)) {
    for (const t of targets) await copyDir(s.dir, path.join(ws, t, s.name));
  }
  // Skills switched off or removed in Settings leave the workspace too.
  const off = await prisma.customSkill.findMany({ where: { OR: [{ enabled: false }, { valid: false }] } });
  for (const c of off) for (const t of targets) await fs.rm(path.join(ws, t, c.name), { recursive: true, force: true });
  // So do ECC library skills switched off for this product.
  const keep = new Set((await eccSkillsFor(useCaseId)).map((s) => s.name));
  const custom = new Set((await prisma.customSkill.findMany({ select: { name: true } })).map((c) => c.name));
  for (const id of ECC_SKILLS.map((s) => s.id)) {
    if (keep.has(id) || custom.has(id)) continue;
    for (const t of targets) await fs.rm(path.join(ws, t, id), { recursive: true, force: true });
  }
  // The AgentKit library (its docs and the examples the reference names) goes with the studio-agentkit skill.
  const ak = path.join(VENDOR_DIR, "agentkit");
  if (!(await exists(ak))) return;
  const pinned = (await fs.readFile(path.join(ak, ".pinned"), "utf8").catch(() => "")).trim();
  for (const t of targets) {
    const dest = path.join(ws, t, "studio-agentkit", "library");
    const mark = path.join(dest, ".library");
    if ((await fs.readFile(mark, "utf8").catch(() => "")).trim() === pinned) continue;
    await copyDocs(path.join(ak, "docs"), path.join(dest, "docs"));
    for (const ex of AGENTKIT_EXAMPLES) await copyDocs(path.join(ak, "examples", ex), path.join(dest, "examples", ex));
    await fs.copyFile(path.join(ak, "LICENSE.md"), path.join(dest, "LICENSE.md")).catch(() => {});
    await fs.writeFile(mark, pinned + "\n");
  }
}

const AGENTKIT_EXAMPLES = ["agentkit-starter", "support-agent-human-in-the-loop", "mem0-memory", "realtime-ui-nextjs", "use-agent", "mcp-neon-agent", "quick-start"];

// Text files only (no images, lockfiles or node_modules): the library is for reading.
async function copyDocs(src: string, dest: string) {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "graphics" || e.name.startsWith(".")) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) await copyDocs(from, to);
    else if (/\.(mdx?|tsx?|jsx?|mjs|json|css|sql|txt|example)$/.test(e.name) && !/lock\.json$/.test(e.name)) {
      await fs.mkdir(dest, { recursive: true });
      await fs.copyFile(from, to);
    }
  }
}

// The design skills Generate reads, copied into workspaces made before they were added.
export async function installDesignSkills(slug: string) {
  const ws = workspacePath(slug);
  for (const [name, dir] of [
    ["frontend-design", path.join(VENDOR_DIR, "anthropic", "skills", "frontend-design")],
    ["frontend-design-direction", path.join(VENDOR_DIR, "ecc", "skills", "frontend-design-direction")],
  ] as const) {
    if (await exists(dir)) await copyDir(dir, path.join(ws, ".claude/skills", name));
  }
}

// The shadcn MCP server reads a components.json in its folder. This one only serves look-ups
// (registry search, examples, add commands); the app keeps its own in app/.
const SHADCN_LOOKUP = {
  $schema: "https://ui.shadcn.com/schema.json",
  style: "new-york",
  rsc: false,
  tsx: true,
  tailwind: { config: "", css: "src/index.css", baseColor: "neutral", cssVariables: true, prefix: "" },
  aliases: { components: "@/components", utils: "@/lib/utils", ui: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
  iconLibrary: "lucide",
};

// Partner registries the UX / Component Mapper searches beside @shadcn (Doug, Nov 15: bring what the
// marketplaces offer). Their addresses come from shadcn's own registry index, never typed by hand.
// BACC_SHADCN_REGISTRIES: a comma-separated list of namespaces, "all" for every listed registry, or "off".
let partnerIndex: Promise<Record<string, string>> | null = null;

async function partnerRegistries(): Promise<Record<string, string>> {
  partnerIndex ??= fetch("https://ui.shadcn.com/r/registries.json", { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, string>) : {}))
    .catch(() => {
      partnerIndex = null; // try again next turn
      return {};
    });
  return pickPartners(await partnerIndex);
}

export async function shadcnLookupDir(slug: string) {
  const dir = workspacePath(slug, "studio", "shadcn");
  const file = path.join(dir, "components.json");
  const current = JSON.parse((await fs.readFile(file, "utf8").catch(() => "")) || "null");
  let registries = await partnerRegistries();
  // If the index can't be reached, keep what the last turn found.
  if (!Object.keys(registries).length && process.env.BACC_SHADCN_REGISTRIES !== "off") registries = current?.registries ?? {};
  const merged = { ...SHADCN_LOOKUP, registries };
  if (!current || JSON.stringify(current.registries ?? {}) !== JSON.stringify(merged.registries)) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(merged, null, 2) + "\n");
  }
  return dir;
}

const TEXT_EXT = new Set([".md", ".txt", ".csv", ".json", ".toml", ".yaml", ".yml", ".html"]);

// A text version of an upload so the Studio's agents can read it (PowerPoint, Excel, Word, PDF).
export async function convertToText(file: string) {
  const ext = path.extname(file).toLowerCase();
  const target = `${file}.md`;
  if (TEXT_EXT.has(ext)) {
    await fs.copyFile(file, target);
    return target;
  }
  try {
    const { stdout } = await run(process.env.MARKITDOWN_BIN || "markitdown", [file], {
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    await fs.writeFile(target, stdout);
    return target;
  } catch {
    return "";
  }
}

// studio/intake.md: the owner's own first words and what they brought, for Socra to read as input.
export async function writeIntake(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({
    where: { id: useCaseId },
    include: { documents: true, skills: true },
  });
  const ws = workspacePath(uc.slug);
  const docs = uc.documents
    .filter((d) => d.status !== "declined")
    .map((d) => {
      const text = d.textPath ? path.relative(ws, d.textPath) : "(no text version)";
      return `- **${d.fileName}** (${d.kind}): ${d.description || d.summary || "not read yet"}\n  - File: \`${path.relative(ws, d.storagePath)}\`, text: \`${text}\`${d.tags.length ? `\n  - Tags: ${d.tags.join(", ")}` : ""}`;
    })
    .join("\n");
  const working = uc.name === workingName(uc.description);
  const md = `# ${uc.name}
${working ? "\n(This is only a working name taken from their first words: give the product a real name with set_product.)\n" : ""}
What the owner told the Studio about their product, in their own words. Treat it as input: it is part of the floor, never the ceiling.

## In their words

${uc.description || "(nothing yet)"}
${uc.repoUrl ? `\n## Repository\n\n${uc.repoUrl}\n` : ""}
## Documents they brought

${docs || "(none)"}

## Extra skills switched on for this product

${uc.skills.map((s) => `- ${s.skillId}`).join("\n") || "(none)"}
`;
  await fs.mkdir(path.join(ws, "studio", "uploads"), { recursive: true });
  await fs.writeFile(path.join(ws, "studio", "intake.md"), md);
}

// Sets up a product's workspace: git repo, skills, intake.
export async function provisionWorkspace(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const ws = workspacePath(uc.slug);
  await fs.mkdir(path.join(ws, "studio", "uploads"), { recursive: true });
  if (!(await exists(path.join(ws, ".git")))) {
    await run("git", ["init", "-q"], { cwd: ws });
    await fs.writeFile(path.join(ws, ".gitignore"), "node_modules/\n.env*\napp/node_modules/\n");
  }
  await installSkills(useCaseId, uc.slug);
  await syncStudioSkills(useCaseId, uc.slug);
  await writeIntake(useCaseId);
  await prisma.useCase.update({ where: { id: useCaseId }, data: { provisioned: true } });
}
