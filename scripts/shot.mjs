#!/usr/bin/env node
// Screenshots a running app at desktop and phone sizes, so Generate can look at what it built.
// Usage: node shot.mjs <base-url> <out-dir> [path ...]   e.g. node shot.mjs http://127.0.0.1:4999 bacc/shots / /shop
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import path from "path";

const [base, outDir = "shots", ...paths] = process.argv.slice(2);
if (!base) {
  console.error("Usage: node shot.mjs <base-url> <out-dir> [path ...]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sizes = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const p of paths.length ? paths : ["/"]) {
    for (const s of sizes) {
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(new URL(p, base).toString(), { waitUntil: "networkidle", timeout: 20_000 }).catch(() => page.waitForTimeout(2000));
      await page.waitForTimeout(600);
      const slug = p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
      const file = path.join(outDir, `${slug}-${s.name}.png`);
      // Long pages are cut at three screens: enough to judge the page, and quick to look at.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: s.width, height: Math.min(height, s.height * 3) } });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      console.log(`${file}${overflow ? "  (WARNING: content wider than the screen)" : ""}${errors.length ? `  (page errors: ${errors.slice(0, 3).join(" | ")})` : ""}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
