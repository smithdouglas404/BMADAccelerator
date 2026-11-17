import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { CUSTOM_SKILLS_DIR } from "@/lib/provision";
import { workspacePath } from "@/lib/workspace";

const run = promisify(execFile);

type Finding = { rule: string; severity: string; detail: string };

/**
 * Checks a skill's shape against the Agent Skills format before it can be switched on: a SKILL.md with
 * front matter, a lower-case hyphenated name (at most 64 characters, matching its folder), a description
 * that says what it does and when to use it (at most 1024 characters), instructions after the front
 * matter, and only references/, scripts/, assets/ and similar folders beside it.
 */
export async function validateSkill(dir: string) {
  const findings: Finding[] = [];
  const md = await fs.readFile(path.join(dir, "SKILL.md"), "utf8").catch(() => "");
  if (!md) return { valid: false, findings: [{ rule: "SKILL-01", severity: "CRITICAL", detail: "There is no SKILL.md." }] };
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) findings.push({ rule: "SKILL-02", severity: "CRITICAL", detail: "SKILL.md must start with front matter between --- lines." });
  const fm = frontmatter(md);
  if (!fm.name) findings.push({ rule: "SKILL-03", severity: "HIGH", detail: "The front matter has no name." });
  else {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(fm.name)) findings.push({ rule: "SKILL-04", severity: "HIGH", detail: "The name must be lower-case letters, numbers and dashes." });
    if (fm.name.length > 64) findings.push({ rule: "SKILL-05", severity: "HIGH", detail: "The name is longer than 64 characters." });
    if (path.basename(dir) !== fm.name) findings.push({ rule: "SKILL-06", severity: "LOW", detail: `The folder is called ${path.basename(dir)}; it is installed as ${fm.name}.` });
  }
  if (!fm.description) findings.push({ rule: "SKILL-07", severity: "HIGH", detail: "The front matter has no description, so the agents can't tell when to use it." });
  else {
    if (fm.description.length > 1024) findings.push({ rule: "SKILL-08", severity: "HIGH", detail: "The description is longer than 1024 characters." });
    if (fm.description.length < 40) findings.push({ rule: "SKILL-09", severity: "MEDIUM", detail: "The description is very short; say what it does and when to use it." });
    if (/[<>]/.test(fm.description)) findings.push({ rule: "SKILL-10", severity: "HIGH", detail: "The description can't contain angle brackets." });
  }
  if (m && m[2].trim().length < 40) findings.push({ rule: "SKILL-11", severity: "HIGH", detail: "SKILL.md has no instructions after the front matter." });
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) findings.push({ rule: "SKILL-12", severity: "HIGH", detail: `${e.name} is a link; skills must contain real files.` });
  }
  return { valid: !findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH"), findings };
}

function frontmatter(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const get = (k: string) => m?.[1].match(new RegExp(`^${k}:\\s*['"]?(.*?)['"]?\\s*$`, "m"))?.[1] ?? "";
  return { name: get("name"), description: get("description") };
}

// Accepts a .skill or .zip of a skill folder, or a single SKILL.md.
export async function saveUploadedSkill(fileName: string, data: Buffer) {
  const tmp = path.join(CUSTOM_SKILLS_DIR, `.upload-${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  if (/\.(zip|skill)$/i.test(fileName)) {
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
    for (const t of [".claude/skills"]) {
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

export async function deleteSkill(id: string) {
  const skill = await prisma.customSkill.findUniqueOrThrow({ where: { id } });
  if (skill.enabled) await setSkillEnabled(id, false);
  await fs.rm(skill.path, { recursive: true, force: true });
  await prisma.customSkill.delete({ where: { id } });
}
