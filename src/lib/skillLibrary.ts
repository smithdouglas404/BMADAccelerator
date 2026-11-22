import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { ECC_SKILLS } from "@/lib/skills";
import { STUDIO_SKILLS_DIR, VENDOR_DIR } from "@/lib/provision";
import { CORE_SKILLS } from "@/lib/agent/instructions";
import { STUDIO_TEAM } from "@/lib/agent/team";
import { SPECIALISTS } from "@/lib/studio/core";

// One skill library: the open-source ECC library (Everything Claude Code, MIT, pinned in vendor/ecc), the
// Studio's own skills (written in ECC's skill format, origin "Working Backwards Studio") and the skills
// people upload. Every skill is a folder with a SKILL.md, so all three travel the same way into a product.

export type LibrarySource = "studio" | "ecc" | "yours";
export type LibrarySkill = {
  id: string; // studio:<name> | ecc:<name> | yours:<db id>
  name: string;
  description: string;
  source: LibrarySource;
  origin: string;
  alwaysOn: boolean; // the Studio's own skills, and the design skill every build reads
  core: boolean; // loaded into Socra's instructions on every turn
  allProducts: boolean;
  useCases: string[];
  valid: boolean;
  report: string;
  /** Which agents are told to read it, taken from their real instructions (never typed in). */
  usedBy: string[];
};

// ECC skills every build reads, whatever is switched on.
export const ECC_ALWAYS = ["frontend-design-direction"];

export function frontmatterOf(md: string) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  // ECC writes origin under "metadata:" (indented); the Studio's skills may use either.
  const get = (k: string) => m?.[1].match(new RegExp(`^\\s*${k}:\\s*['"]?(.*?)['"]?\\s*$`, "m"))?.[1] ?? "";
  return { name: get("name"), description: get("description"), origin: get("origin") };
}

export async function studioSkills(dir = STUDIO_SKILLS_DIR) {
  const out: { name: string; description: string; origin: string }[] = [];
  for (const name of (await fs.readdir(dir).catch(() => [] as string[])).sort()) {
    const md = await fs.readFile(path.join(dir, name, "SKILL.md"), "utf8").catch(() => "");
    if (!md) continue;
    const fm = frontmatterOf(md);
    out.push({ name: fm.name || name, description: fm.description, origin: fm.origin });
  }
  // Core skills first, in the order Socra loads them.
  const rank = (n: string) => {
    const i = (CORE_SKILLS as readonly string[]).indexOf(n);
    return i < 0 ? 99 : i;
  };
  return out.sort((a, b) => rank(a.name) - rank(b.name));
}

/** The agents whose instructions name a skill: Socra (core skills, and any skill her own skill names), and each team member's prompt. */
export function skillUsers(name: string, socraText = ""): string[] {
  const nice = (key: string) => SPECIALISTS.find((s) => s.agent === key)?.name ?? key.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const users: string[] = [];
  if ((CORE_SKILLS as readonly string[]).includes(name) || socraText.includes(name)) users.push("Socra");
  for (const [key, def] of Object.entries(STUDIO_TEAM)) if (def.prompt.includes(`skills/${name}/`) || def.prompt.includes(name)) users.push(nice(key));
  return users;
}

export async function librarySkills(): Promise<LibrarySkill[]> {
  const [studio, prefs, picks, custom] = await Promise.all([
    studioSkills(),
    prisma.preferences.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } }),
    prisma.useCaseSkill.findMany(),
    prisma.customSkill.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const byProduct = new Map<string, string[]>();
  for (const p of picks) byProduct.set(p.skillId, [...(byProduct.get(p.skillId) ?? []), p.useCaseId]);
  const all = new Set(prefs.eccAllProducts);
  const socraText = (await Promise.all(["studio-reimagine", "studio-muse"].map((n) => fs.readFile(path.join(STUDIO_SKILLS_DIR, n, "SKILL.md"), "utf8").catch(() => "")))).join("\n");
  return [
    ...studio.map((s) => ({
      id: `studio:${s.name}`, name: s.name, description: s.description, source: "studio" as const,
      origin: s.origin || "Working Backwards Studio", alwaysOn: true,
      core: (CORE_SKILLS as readonly string[]).includes(s.name), allProducts: true, useCases: [], valid: true, report: "", usedBy: skillUsers(s.name, socraText),
    })),
    ...ECC_SKILLS.map((s) => ({
      id: `ecc:${s.id}`, name: s.id, description: s.description, source: "ecc" as const, origin: "ECC",
      alwaysOn: ECC_ALWAYS.includes(s.id), core: false, allProducts: ECC_ALWAYS.includes(s.id) || all.has(s.id),
      useCases: byProduct.get(s.id) ?? [], valid: true, report: "", usedBy: [],
    })),
    ...custom.map((c) => ({
      id: `yours:${c.id}`, name: c.name, description: c.description, source: "yours" as const, origin: "Yours",
      alwaysOn: false, core: false, allProducts: c.enabled && c.valid, useCases: [], valid: c.valid, report: c.report, usedBy: [],
    })),
  ];
}

// Switch an ECC skill on for every product, for chosen products, or off.
export async function setEccScope(skillId: string, scope: { allProducts: boolean; useCases: string[] }) {
  if (!ECC_SKILLS.some((s) => s.id === skillId)) throw new Error(`${skillId} is not in the ECC library.`);
  if (ECC_ALWAYS.includes(skillId)) throw new Error(`${skillId} is always on: every build reads it.`);
  const prefs = await prisma.preferences.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } });
  const next = new Set(prefs.eccAllProducts);
  if (scope.allProducts) next.add(skillId);
  else next.delete(skillId);
  await prisma.preferences.update({ where: { id: "global" }, data: { eccAllProducts: [...next].sort() } });
  await prisma.useCaseSkill.deleteMany({ where: { skillId } });
  if (!scope.allProducts && scope.useCases.length) {
    await prisma.useCaseSkill.createMany({ data: scope.useCases.map((useCaseId) => ({ useCaseId, skillId })), skipDuplicates: true });
  }
}

// The ECC skills a product gets: the ones every build reads, the ones on for every product, its own picks.
export async function eccSkillsFor(useCaseId: string) {
  const [prefs, picks] = await Promise.all([
    prisma.preferences.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } }),
    prisma.useCaseSkill.findMany({ where: { useCaseId } }),
  ]);
  const ids = new Set([...ECC_ALWAYS, ...prefs.eccAllProducts, ...picks.map((p) => p.skillId)]);
  const out: { name: string; dir: string }[] = [];
  for (const id of ids) {
    const dir = path.join(VENDOR_DIR, "ecc", "skills", id);
    if (await fs.access(path.join(dir, "SKILL.md")).then(() => true, () => false)) out.push({ name: id, dir });
  }
  return out;
}
