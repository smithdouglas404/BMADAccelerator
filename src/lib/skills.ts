import catalog from "@/data/ecc-skills.json";

// Skills library. Claude Code's .claude/skills/ is always loaded; Codex and Cursor
// read .agents/skills/; Antigravity gets its own folder (path to confirm against
// Antigravity's docs). These targets map onto BMAD's `npx skills add` tool choice.
export const SKILL_TARGETS = [
  { key: "claude", label: "Claude Code", dir: ".claude/skills/", locked: true },
  { key: "codex", label: "Codex", dir: ".agents/skills/", locked: false },
  { key: "cursor", label: "Cursor", dir: ".agents/skills/", locked: false },
  { key: "antigravity", label: "Antigravity", dir: ".agent/skills/", locked: false },
] as const;

export type Skill = { id: string; description: string };

// Full ECC (Everything Claude Code, MIT) catalog, generated from
// github.com/affaan-m/everything-claude-code at d2ef268.
export const ECC_SKILLS: Skill[] = catalog as Skill[];

// Featured picks shown first in the picker, grouped for non-technical users.
export const FEATURED_GROUPS: { group: string; ids: string[] }[] = [
  { group: "Experience", ids: ["frontend-design-direction", "design-system", "accessibility", "frontend-patterns"] },
  { group: "Engineering", ids: ["backend-patterns", "api-design", "postgres-patterns", "security-review"] },
  { group: "Quality and delivery", ids: ["tdd-workflow", "e2e-testing", "coding-standards", "deployment-patterns"] },
];

export function skillById(id: string): Skill | undefined {
  return ECC_SKILLS.find((s) => s.id === id);
}

export function humanize(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
