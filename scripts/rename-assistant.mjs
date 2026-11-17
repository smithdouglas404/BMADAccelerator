#!/usr/bin/env node
// Renames the assistant everywhere people and agents see it: node scripts/rename-assistant.mjs <NewName> [OldName]
// Changes ASSISTANT_NAME in src/lib/brand.ts (and adds the old name to its list, so stored records show the
// new one), and the whole word in the Studio's code text, prompts, skills, docs and tests. It leaves alone
// the design team's files (byte-identical by rule; brand() renames their text on screen), code identifiers
// (only the whole capitalised word changes), migrations, vendor and node_modules.
import { promises as fs } from "node:fs";
import path from "node:path";

const [to, fromArg] = process.argv.slice(2);
if (!to || !/^[A-Z][A-Za-z]{1,30}$/.test(to)) {
  console.error("Usage: node scripts/rename-assistant.mjs <NewName> [OldName]");
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const brandFile = path.join(root, "src/lib/brand.ts");
const brandSrc = await fs.readFile(brandFile, "utf8");
const from = fromArg || brandSrc.match(/ASSISTANT_NAME = "([^"]+)"/)?.[1];
if (!from || from === to) process.exit(0);

const TEAM = new Set(["src/studio/styles.css", "src/studio/data.ts", "src/studio/spec.ts", "src/studio/generation.ts", "src/studio/graph.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "vendor", "migrations", ".git", "workspaces"]);
const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".md", ".py", ".css", ".html", ".json", ".yml", ".yaml"]);
const word = new RegExp(`\\b${from}\\b`, "g");
let changed = 0;

async function walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await walk(full);
      continue;
    }
    if (!EXT.has(path.extname(e.name)) || TEAM.has(rel) || rel === "src/lib/brand.ts" || rel.endsWith("package-lock.json") || rel.startsWith("scripts/rename-assistant")) continue;
    const s = await fs.readFile(full, "utf8");
    const t = s.replace(word, to);
    if (t !== s) {
      await fs.writeFile(full, t);
      changed++;
    }
  }
}
for (const d of ["src", "studio-skills", "tests", "docs", "agent-service/src", "scripts"]) await walk(path.join(root, d)).catch(() => undefined);
for (const f of ["CLAUDE.md", "README.md"]) {
  const p = path.join(root, f);
  const s = await fs.readFile(p, "utf8").catch(() => "");
  if (s && s.replace(word, to) !== s) {
    await fs.writeFile(p, s.replace(word, to));
    changed++;
  }
}
let b = brandSrc.replace(/ASSISTANT_NAME = "[^"]+"/, `ASSISTANT_NAME = "${to}"`);
b = b.replace(/const OLD_NAMES = \[([^\]]*)\]/, (_m, list) => {
  const names = new Set(list.split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean));
  names.add(from);
  return `const OLD_NAMES = [${[...names].map((n) => `"${n}"`).join(", ")}]`;
});
await fs.writeFile(brandFile, b);
console.log(`Renamed ${from} to ${to} in ${changed} files, and in src/lib/brand.ts.`);
