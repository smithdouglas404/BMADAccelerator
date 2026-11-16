// Run: npm test. One skill library: the Studio's own skills are written in ECC's skill format, so they sit
// beside ECC's skills and travel the same way into every product.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";

const STUDIO = path.join(process.cwd(), "studio-skills");
const fm = (md) => {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const get = (k) => m?.[1].match(new RegExp(`^${k}:\\s*(.*?)\\s*$`, "m"))?.[1] ?? "";
  return { name: get("name"), description: get("description"), origin: get("origin") };
};

test("every Studio skill follows ECC's SKILL.md format", async () => {
  const names = await fs.readdir(STUDIO);
  assert.ok(names.includes("studio-reimagine") && names.includes("studio-muse"));
  for (const name of names) {
    const md = await fs.readFile(path.join(STUDIO, name, "SKILL.md"), "utf8");
    const f = fm(md);
    assert.equal(f.name, name, `${name}: name matches its folder`);
    assert.match(f.name, /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.ok(f.description.length >= 40 && f.description.length <= 1024, `${name}: description says what and when`);
    // Ours, or a vetted outside skill that names its origin and keeps its license text beside it.
    if (f.origin !== "Working Backwards Studio") {
      assert.match(md, /^license:\s*\S+/m, `${name}: an outside skill names its license`);
      await fs.access(path.join(STUDIO, name, "LICENSE"));
    }
    assert.ok(f.origin, `${name}: origin marks whose it is, beside ECC's`);
    assert.match(md, /^## When to Activate$/m, `${name}: has ECC's When to Activate section`);
  }
});

test("the ECC catalog lists skills by folder name, and the pinned copy has them when present", async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(process.cwd(), "src/data/ecc-skills.json"), "utf8"));
  assert.ok(catalog.length > 100);
  assert.ok(catalog.some((s) => s.id === "frontend-design-direction"), "the design skill every build reads is in ECC");
  const vendor = path.join(process.cwd(), "vendor/ecc/skills");
  const have = await fs.readdir(vendor).catch(() => null);
  if (!have) return; // vendor/ is fetched at build time
  const missing = catalog.filter((s) => !have.includes(s.id)).map((s) => s.id);
  assert.deepEqual(missing, []);
});

test("Settings lists one library with ECC, Studio and your skills, and products get switched-on ECC skills", async () => {
  const settings = await fs.readFile(path.join(process.cwd(), "src/studio/settings.tsx"), "utf8");
  assert.match(settings, /\/api\/skills\/library/);
  assert.match(settings, /\['studio', 'Studio'\], \['ecc', 'ECC'\], \['yours', 'Yours'\]/);
  const provision = await fs.readFile(path.join(process.cwd(), "src/lib/provision.ts"), "utf8");
  assert.match(provision, /eccSkillsFor\(useCaseId\)/);
});

test("TypeSafe's Jev skill is in the library with its license, and its key stays on the server", async () => {
  const md = await fs.readFile(path.join(STUDIO, "typesafe-ai", "SKILL.md"), "utf8");
  assert.match(md, /^license: MIT$/m);
  assert.match(await fs.readFile(path.join(STUDIO, "typesafe-ai", "LICENSE"), "utf8"), /Permission is hereby granted, free of charge/);
  assert.match(md, /No live test requests without a person's OK/);
  const catalog = await fs.readFile(path.join(process.cwd(), "src/lib/settingsCatalog.ts"), "utf8");
  assert.match(catalog, /env: "TYPESAFE_API_KEY"/, "saved like the other keys on Settings");
  const auth = await fs.readFile(path.join(process.cwd(), "src/lib/agent/auth.ts"), "utf8");
  assert.match(auth, /"TYPESAFE_API_KEY"\]\) delete env\[k\]/, "Claude Code runs never get the key");
  const preview = await fs.readFile(path.join(process.cwd(), "src/lib/preview.ts"), "utf8");
  assert.doesNotMatch(preview, /TYPESAFE/, "generated apps never get the Studio's key");
});
