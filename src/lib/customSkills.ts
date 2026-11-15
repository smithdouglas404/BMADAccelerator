import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { CUSTOM_SKILLS_DIR, VENDOR_DIR } from "@/lib/provision";
import { workspacePath } from "@/lib/workspace";

const run = promisify(execFile);

type Finding = { rule: string; severity: string; detail: string };

// BMAD's own deterministic validator (tools/validate_skills.py). Its naming rule asks
// for a bmad- prefix and its description rule for "Use when"; for a team's own skill
// those are advice, not blockers.
const ADVISORY = new Set(["SKILL-04", "SKILL-06"]);

export async function validateSkill(dir: string) {
  const { stdout } = await run(
    process.env.UV_BIN || "uv",
    ["run", "--no-cache", "--python", "3.11", path.join(VENDOR_DIR, "bmad/tools/validate_skills.py"), "--json", dir],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  ).catch((e) => ({ stdout: (e as { stdout?: string }).stdout ?? "[]" }));
  let findings: Finding[] = [];
  try {
    findings = JSON.parse(stdout);
  } catch {
    findings = [{ rule: "PARSE", severity: "HIGH", detail: "The validator could not read this skill." }];
  }
  const blocking = findings.filter((f) => ["CRITICAL", "HIGH"].includes(f.severity) && !ADVISORY.has(f.rule));
  return { valid: blocking.length === 0, findings };
}

function frontmatter(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const get = (k: string) => m?.[1].match(new RegExp(`^${k}:\\s*['"]?(.*?)['"]?\\s*$`, "m"))?.[1] ?? "";
  return { name: get("name"), description: get("description") };
}

// Accepts a .zip of a skill folder, or a single SKILL.md.
export async function saveUploadedSkill(fileName: string, data: Buffer) {
  const tmp = path.join(CUSTOM_SKILLS_DIR, `.upload-${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  if (fileName.toLowerCase().endsWith(".zip")) {
    const zip = path.join(tmp, "skill.zip");
    await fs.writeFile(zip, data);
    await run("unzip", ["-q", "-o", zip, "-d", path.join(tmp, "x")]);
  } else {
    await fs.mkdir(path.join(tmp, "x"), { recursive: true });
    await fs.writeFile(path.join(tmp, "x", "SKILL.md"), data);
  }
  // Find the folder that holds SKILL.md.
  async function find(dir: string, depth = 0): Promise<string | null> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === "SKILL.md")) return dir;
    if (depth > 2) return null;
    for (const e of entries) if (e.isDirectory() && e.name !== "__MACOSX") {
      const f = await find(path.join(dir, e.name), depth + 1);
      if (f) return f;
    }
    return null;
  }
  const src = await find(path.join(tmp, "x"));
  if (!src) {
    await fs.rm(tmp, { recursive: true, force: true });
    throw new Error("No SKILL.md found in the upload.");
  }
  const fm = frontmatter(await fs.readFile(path.join(src, "SKILL.md"), "utf8"));
  const name = (fm.name || path.basename(src)).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const dest = path.join(CUSTOM_SKILLS_DIR, name);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(src, dest, { recursive: true });
  await fs.rm(tmp, { recursive: true, force: true });
  const { valid, findings } = await validateSkill(dest);
  return prisma.customSkill.upsert({
    where: { name },
    create: { name, description: fm.description, path: dest, valid, report: JSON.stringify(findings), enabled: false },
    update: { description: fm.description, path: dest, valid, report: JSON.stringify(findings), enabled: false },
  });
}

// Switching a skill on copies it into every use case's skill folders.
export async function setSkillEnabled(id: string, enabled: boolean) {
  const skill = await prisma.customSkill.findUniqueOrThrow({ where: { id } });
  if (enabled && !skill.valid) throw new Error("Fix the validation problems before switching this skill on.");
  const updated = await prisma.customSkill.update({ where: { id }, data: { enabled } });
  const useCases = await prisma.useCase.findMany({ where: { provisioned: true } });
  for (const uc of useCases) {
    for (const t of [".claude/skills", ".agents/skills", ".agent/skills"]) {
      const dir = workspacePath(uc.slug, t);
      try {
        await fs.access(dir);
      } catch {
        continue;
      }
      const dest = path.join(dir, skill.name);
      if (enabled) await fs.cp(skill.path, dest, { recursive: true, force: true });
      else await fs.rm(dest, { recursive: true, force: true });
    }
  }
  return updated;
}
