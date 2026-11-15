import { chromium } from "playwright-core";

// Takes a full-page screenshot of the generated app so the person can draw on it.
export async function snapshot(url: string, width: number, height: number) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => page.waitForTimeout(1500));
    await page.waitForTimeout(400);
    return await page.screenshot({ fullPage: true, type: "png" });
  } finally {
    await browser.close();
  }
}
