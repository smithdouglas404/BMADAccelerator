#!/usr/bin/env node
// Rebuilds the ECC catalog the Skills screen lists (src/data/ecc-skills.json) and the pin it shows
// (src/data/ecc-pin.json) from the pinned open-source copy in vendor/ecc, so the list is always exactly
// what is imported. fetch-vendor.sh runs it after every fetch; the Docker build runs fetch-vendor.sh.
import { promises as fs } from "fs";
import path from "path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const ecc = path.join(root, "vendor", "ecc");
const [repo, sha] = process.argv.slice(2);
const dirs = (await fs.readdir(path.join(ecc, "skills"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const out = [];
for (const id of dirs) {
  const md = await fs.readFile(path.join(ecc, "skills", id, "SKILL.md"), "utf8").catch(() => "");
  if (!md) continue;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  let d = (fm.match(/^description:\s*['"]?(.*?)['"]?\s*$/m)?.[1] ?? "").trim();
  // YAML block scalars (description: > or |): the indented lines that follow.
  if (/^[>|][-+]?$/.test(d)) d = (fm.match(/^description:.*\n((?:[ \t]+.*(?:\n|$))+)/m)?.[1] ?? "").split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
  if (d.length > 180) d = `${d.slice(0, 177).trimEnd()}...`;
  out.push({ id, description: d });
}
const version = (await fs.readFile(path.join(ecc, "VERSION"), "utf8").catch(() => "")).trim();
const license = (await fs.readFile(path.join(ecc, "LICENSE"), "utf8").catch(() => "")).split("\n")[0].trim();
await fs.writeFile(path.join(root, "src/data/ecc-skills.json"), `${JSON.stringify(out, null, 2)}\n`);
await fs.writeFile(path.join(root, "src/data/ecc-pin.json"), `${JSON.stringify({ repo, sha, version, license, skills: out.length }, null, 2)}\n`);
console.log(`ECC catalog: ${out.length} skills from ${sha.slice(0, 7)} (version ${version}, ${license})`);
