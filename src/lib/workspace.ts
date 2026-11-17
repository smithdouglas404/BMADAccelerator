import { promises as fs } from "fs";
import path from "path";

// Each product gets its own workspace folder: the Studio's files under `studio/` (intake, uploads,
// package, shots, builds, research), the pilot under `app/`, and the skills under `.claude/skills/`.
export const WORKSPACES_DIR = process.env.WORKSPACES_DIR || path.join(process.cwd(), "workspaces");

export function workspacePath(slug: string, ...parts: string[]) {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  return path.join(WORKSPACES_DIR, safe, ...parts);
}

export async function ensureWorkspace(slug: string) {
  await fs.mkdir(workspacePath(slug, "studio", "uploads"), { recursive: true });
  return workspacePath(slug);
}

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "product"}-${Math.random().toString(36).slice(2, 6)}`;
}
