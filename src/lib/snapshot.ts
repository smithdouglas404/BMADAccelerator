import { chromium } from "playwright-core";

// Takes a screenshot of the generated app at the size the owner sees it. With a point, it also names the
// part of the page under it (what the owner clicked in Vibe review), since the preview is another origin.
export async function snapshot(url: string, width: number, height: number, opts: { full?: boolean; scrollY?: number; point?: { x: number; y: number } } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => page.waitForTimeout(1500));
    if (opts.scrollY) await page.evaluate((y) => window.scrollTo(0, y), opts.scrollY);
    await page.waitForTimeout(400);
    let target = "";
    if (opts.point) {
      target = await page.evaluate(({ x, y }) => {
        let el = document.elementFromPoint(x, y) as HTMLElement | null;
        const name = (e: HTMLElement) =>
          (e.getAttribute("aria-label") || e.getAttribute("alt") || e.getAttribute("placeholder") || e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60);
        const kinds: Record<string, string> = { BUTTON: "Button", A: "Link", IMG: "Image", INPUT: "Field", TEXTAREA: "Field", SELECT: "Menu", H1: "Heading", H2: "Heading", H3: "Heading", NAV: "Navigation", HEADER: "Header", FOOTER: "Footer", FORM: "Form" };
        for (let i = 0; el && i < 6; i++, el = el.parentElement) {
          const kind = kinds[el.tagName] || (el.getAttribute("role") ? el.getAttribute("role")!.replace(/^\w/, (c) => c.toUpperCase()) : "");
          const label = name(el);
          if (kind && label) return `${kind}: “${label}”`;
          if (kind) return kind;
          if (i === 0 && label && label.length < 40) return `“${label}”`;
        }
        return "";
      }, opts.point);
    }
    const image = await page.screenshot({ fullPage: opts.full ?? true, type: "png" });
    return { image, target };
  } finally {
    await browser.close();
  }
}
