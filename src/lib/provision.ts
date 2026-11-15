import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { inspirationMarkdown } from "@/lib/inspire";
import { workspacePath, WORKSPACES_DIR } from "@/lib/workspace";
import { AGENTS, BMAD_DOC_TYPES, DOC_STAGES, type Routing } from "@/lib/bmad";

const run = promisify(execFile);

// Pinned BMAD v7 and ECC copies live in vendor/ (scripts/fetch-vendor.sh).
export const VENDOR_DIR = process.env.BACC_VENDOR_DIR || path.join(process.cwd(), "vendor");
export const BMAD_MODULES = ["core-tools", "method", "toolsmith"] as const;
export const CONCIERGE_DIR = path.join(process.cwd(), "bmad-module");
export const CUSTOM_SKILLS_DIR = path.join(WORKSPACES_DIR, "_custom-skills");
const UV = process.env.UV_BIN || "uv";

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

export async function bmadPinnedVersion() {
  try {
    return (await fs.readFile(path.join(VENDOR_DIR, "bmad", ".pinned"), "utf8")).trim().slice(0, 7);
  } catch {
    return "";
  }
}

// Skill folders a use case gets: BMAD (unmodified), the concierge, chosen ECC skills,
// and enabled team uploads.
async function skillSources(useCaseId: string) {
  const sources: { name: string; dir: string }[] = [];
  for (const mod of BMAD_MODULES) {
    const modDir = path.join(VENDOR_DIR, "bmad", "skills", mod);
    if (!(await exists(modDir))) continue;
    for (const name of await fs.readdir(modDir)) sources.push({ name, dir: path.join(modDir, name) });
  }
  // Extension modules: Test Architect (production readiness) and Creative Intelligence Suite.
  for (const mod of ["tea", "cis"]) {
    const modDir = path.join(VENDOR_DIR, mod, "skills");
    if (!(await exists(modDir))) continue;
    for (const name of await fs.readdir(modDir)) sources.push({ name, dir: path.join(modDir, name) });
  }
  for (const name of await fs.readdir(CONCIERGE_DIR)) sources.push({ name, dir: path.join(CONCIERGE_DIR, name) });
  // Design skills Generate always uses: Anthropic's frontend-design and ECC's design direction.
  for (const [name, dir] of [
    ["frontend-design", path.join(VENDOR_DIR, "anthropic", "skills", "frontend-design")],
    ["frontend-design-direction", path.join(VENDOR_DIR, "ecc", "skills", "frontend-design-direction")],
  ] as const) {
    if (await exists(dir)) sources.push({ name, dir });
  }
  const chosen = await prisma.useCaseSkill.findMany({ where: { useCaseId } });
  for (const s of chosen) {
    const dir = path.join(VENDOR_DIR, "ecc", "skills", s.skillId);
    if (await exists(dir)) sources.push({ name: s.skillId, dir });
  }
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

// The accelerator's own skills (concierge, expert advisor), refreshed in every workspace before each
// turn so a rule added later reaches use cases created before it.
export async function syncAcceleratorSkills(slug: string) {
  const ws = workspacePath(slug);
  for (const name of await fs.readdir(CONCIERGE_DIR)) {
    for (const t of await skillTargets()) await copyDir(path.join(CONCIERGE_DIR, name), path.join(ws, t, name));
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

export async function shadcnLookupDir(slug: string) {
  const dir = workspacePath(slug, "bacc", "shadcn");
  const file = path.join(dir, "components.json");
  if (!(await exists(file))) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(SHADCN_LOOKUP, null, 2) + "\n");
  }
  return dir;
}

async function uvRun(cwd: string, args: string[]) {
  const { stdout } = await run(UV, ["run", "--no-cache", ...args], {
    cwd,
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, UV_NO_PROGRESS: "1" },
  });
  return stdout;
}

// Runs BMAD's own setup script (what `bmad setup` runs), then makes the use case the
// active initiative, exactly as the `bmad` skill's initiative action does.
export async function bmadSetup(slug: string, name: string) {
  const ws = workspacePath(slug);
  const skill = path.join(ws, ".claude/skills/bmad");
  const base = [path.join(skill, "scripts/setup.py"), "--project-root", ws, "--skill", skill, "--root", path.join(ws, ".claude/skills")];
  // Modules such as TEA ask config questions. Answer each with BMAD's own recommended default.
  const answersFile = path.join(ws, ".bacc-module-answers.toml");
  const extra: string[] = [];
  try {
    const listed = await uvRun(ws, [...base, "--list-config-questions"]);
    const line = listed.trim().split("\n").reverse().find((l) => l.trim().startsWith("[")) || "[]";
    const questions = JSON.parse(line) as { module: string; key: string; default?: string }[];
    if (questions.length) {
      const byModule = new Map<string, string[]>();
      for (const q of questions) {
        const rows = byModule.get(q.module) ?? [];
        rows.push(`${JSON.stringify(q.key)} = ${JSON.stringify(String(q.default ?? ""))}`);
        byModule.set(q.module, rows);
      }
      const toml = [...byModule].map(([m, rows]) => `[modules.${JSON.stringify(m)}]\n${rows.join("\n")}\n`).join("\n");
      await fs.writeFile(answersFile, toml);
      extra.push("--module-answers", answersFile);
    }
  } catch (e) {
    console.error("bmad config questions", e);
  }
  let out: string;
  try {
    out = await uvRun(ws, [...base, ...extra]);
  } finally {
    await fs.rm(answersFile, { force: true });
  }
  const result = JSON.parse(out.trim().split("\n").pop() || "{}");
  const initiative = `initiative-${slug}`;
  const initDir = path.join(ws, "_bmad-output", initiative);
  await fs.mkdir(initDir, { recursive: true });
  const initFile = path.join(initDir, `${initiative}.md`);
  if (!(await exists(initFile))) {
    await fs.writeFile(initFile, `---\ntype: initiative\ntitle: ${JSON.stringify(name)}\nparent: none\n---\n`);
  }
  const userCfg = path.join(ws, "_bmad/custom/config.user.toml");
  let cfg = "";
  try {
    cfg = await fs.readFile(userCfg, "utf8");
  } catch {
    /* first time */
  }
  if (!/^active_initiative\s*=/m.test(cfg)) {
    cfg = /^\[core\]/m.test(cfg)
      ? cfg.replace(/^\[core\]\s*$/m, `[core]\nactive_initiative = "${initiative}"`)
      : `${cfg}${cfg && !cfg.endsWith("\n") ? "\n" : ""}[core]\nactive_initiative = "${initiative}"\n`;
    await fs.writeFile(userCfg, cfg);
  }
  return { initiative, version: String(result?.bmad?.version || "") };
}

const TEXT_EXT = new Set([".md", ".txt", ".csv", ".json", ".toml", ".yaml", ".yml", ".html"]);

// A text version of an upload so BMAD's agents can read it (PowerPoint, Excel, Word, PDF).
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

// intake.md: everything the person told us at the start, for BMAD to read as input.
export async function writeIntake(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({
    where: { id: useCaseId },
    include: { documents: true, skills: true },
  });
  const ws = workspacePath(uc.slug);
  const statusText: Record<string, string> = { approved: "approved", in_review: "in review, not approved yet" };
  const docs = uc.documents
    .filter((d) => d.status !== "declined")
    .map((d) => {
      const stage = DOC_STAGES.find((s) => s.key === d.stage)?.label ?? "General (any stage)";
      const type = BMAD_DOC_TYPES.find((t) => t.key === d.bmadType)?.label ?? d.bmadType;
      const text = d.textPath ? path.relative(ws, d.textPath) : "(no text version)";
      return `- **${d.fileName}** (${type}; ${stage}; ${statusText[d.status] ?? d.status}${(d.routing as Routing)?.length ? `; for ${(d.routing as Routing).map((r) => AGENTS[r.agent as keyof typeof AGENTS]?.name).join(", ")}` : ""}): ${d.description || d.summary}\n  - File: \`${path.relative(ws, d.storagePath)}\`, text: \`${text}\`${d.tags.length ? `\n  - Tags: ${d.tags.join(", ")}` : ""}`;
    })
    .join("\n");
  const md = `# ${uc.name}

What the client told the BMAD Accelerator at intake, in their own words. Treat it as input, like any document they bring.

## Description

${uc.description || "(none yet)"}

## What done looks like

${uc.intentDone || "(not said yet)"}

## Must keep

${uc.intentKeep || "(not said yet)"}

## Out of scope

${uc.intentOutScope || "(not said yet)"}

## Who it is for

${uc.customer || "(not said yet)"}

## The problem

${uc.problem || "(not said yet)"}

## Sizing

- Size: ${uc.size}
- Needs approvals: ${uc.needsApprovals ? "yes" : "no"}
- Client and vendor: ${uc.clientVendor ? "yes" : "no"}
- Regulated: ${uc.regulated ? "yes" : "no"}
- Idea stage: ${uc.ideaStage}${uc.repoUrl ? `\n- Existing repository: ${uc.repoUrl}` : ""}
- UX: ${uc.uxMode}, architecture: ${uc.archMode}

## Documents they brought

${docs || "(none)"}

## Extra skills they chose

${uc.skills.map((s) => `- ${s.skillId}`).join("\n") || "(none)"}
${inspirationMarkdown(uc.inspiration) ? `\n${inspirationMarkdown(uc.inspiration)}` : ""}`;
  await fs.mkdir(path.join(ws, "bacc"), { recursive: true });
  await fs.writeFile(path.join(ws, "bacc/intake.md"), md);
}

// Sets up a use case's BMAD workspace: git repo, skills, `bmad setup`, initiative, intake.
export async function provisionWorkspace(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const ws = workspacePath(uc.slug);
  await fs.mkdir(path.join(ws, "bacc/uploads"), { recursive: true });
  if (!(await exists(path.join(ws, ".git")))) {
    await run("git", ["init", "-q"], { cwd: ws });
    await fs.writeFile(path.join(ws, ".gitignore"), "node_modules/\n.env*\napp/node_modules/\n");
  }
  await installSkills(useCaseId, uc.slug);
  const { initiative, version } = await bmadSetup(uc.slug, uc.name);
  await writeIntake(useCaseId);
  await prisma.useCase.update({
    where: { id: useCaseId },
    data: { provisioned: true, initiative, bmadVersion: version || (await bmadPinnedVersion()) },
  });
}
