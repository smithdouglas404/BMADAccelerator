import { promises as fs } from "fs";
import path from "path";

/**
 * The Studio's core skills, loaded into Socra's instructions on every turn (not left for the model to
 * find): studio-reimagine is the central theme (reimagine, rethink, reinvent, accelerate), studio-muse is
 * how the conversation works. Every specialist is told to read studio-reimagine too (src/lib/agent/team.ts).
 * A missing core skill stops the turn rather than letting Socra run without its stance.
 */
export const CORE_SKILLS = ["studio-reimagine", "studio-muse"] as const;

export async function coreInstructions(skillsDir = path.join(process.cwd(), "studio-skills")): Promise<string> {
  const parts: string[] = [];
  for (const name of CORE_SKILLS) {
    const md = await fs.readFile(path.join(skillsDir, name, "SKILL.md"), "utf8").catch(() => "");
    if (!md.trim()) throw new Error(`The Studio's core skill ${name} is missing from ${skillsDir}.`);
    parts.push(`<core_skill name="${name}">\n${md.replace(/^---[\s\S]*?---\s*/, "").trim()}\n</core_skill>`);
  }
  return parts.join("\n\n");
}
