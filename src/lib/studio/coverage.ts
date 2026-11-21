import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { SPECIALISTS, specialistByKey } from "@/lib/studio/core";
import { coverageOf, parseAreas, teamListens, type Area, type TeamMemberCoverage } from "@/lib/studio/coverageCore";

const SKILLS_DIR = path.join(process.cwd(), "studio-skills");

/** A specialist's question areas, read from its own skill (studio-skills/<skill>/SKILL.md). */
async function areasOf(skill: string): Promise<Area[]> {
  const md = await fs.readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf8").catch(() => "");
  return parseAreas(md);
}

/** Every specialist's areas and how far the people on this product have answered them. */
export async function teamCoverage(useCaseId: string): Promise<TeamMemberCoverage[]> {
  const [rows, team] = await Promise.all([
    prisma.coverage.findMany({ where: { useCaseId }, orderBy: { createdAt: "asc" } }),
    Promise.all(SPECIALISTS.map(async (s) => ({ key: s.key, name: s.name, skill: s.skill, areas: await areasOf(s.skill) }))),
  ]);
  return coverageOf(team, rows);
}

/** The "your team listens" part of Socra's prompt for a person's words. */
export async function teamListensFor(useCaseId: string, o: { about?: string[]; msg?: string } = {}) {
  return teamListens(await teamCoverage(useCaseId), { ...o, agentOf: (k) => specialistByKey(k)?.agent ?? k });
}
