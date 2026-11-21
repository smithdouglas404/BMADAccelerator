// The PRD's and TRD's sections and walkthroughs come from their skills (studio-prd, studio-trd), read from
// studio-skills/ when the server starts. Nothing about the method lives in code (Doug, Nov 20 and Nov 21).
import { readFileSync } from "fs";
import path from "path";
import { specDefsFrom, specWalkFrom, skillPart, type SpecDef, type SpecTab } from "./spec";

const DIR = path.join(process.cwd(), "studio-skills");
export const SPEC_SKILL: Record<SpecTab, string> = { prd: "studio-prd", trd: "studio-trd" };

/** A spec skill's text (re-read each time, so an edited skill applies without a rebuild). */
export function specSkill(tab: SpecTab): string {
  try {
    return readFileSync(path.join(DIR, SPEC_SKILL[tab], "SKILL.md"), "utf8");
  } catch {
    return "";
  }
}

/** The sections, read once at start (the agent's tool schema is built from them). */
export const SPEC_DEFS: SpecDef[] = specDefsFrom(specSkill("prd"), specSkill("trd"));
if (!SPEC_DEFS.length) console.error("studio-prd / studio-trd skills are missing: the PRD and TRD have no sections");

export const specWalkSteps = (tab: SpecTab) => specWalkFrom(specSkill(tab));
export const specExplainer = (tab: SpecTab) => skillPart(specSkill(tab), tab === "prd" ? "What a PRD is" : "What a TRD is");
export const specWalkIntro = (tab: SpecTab) => skillPart(specSkill(tab), "Walkthrough").split("\n|")[0].trim();
