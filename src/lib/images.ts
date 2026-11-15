import { promises as fs } from "fs";
import path from "path";

// AI images for generated apps, made with OpenAI's image model on the owner's OPENAI_API_KEY.
// The key stays in the accelerator: Generate asks for an image through a tool and gets back a file.
const MODELS = [process.env.BACC_IMAGE_MODEL || "gpt-image-2", "gpt-image-1"].filter((m, i, a) => a.indexOf(m) === i);
export const IMAGE_LIMIT = Number(process.env.BACC_IMAGE_LIMIT || 12);
export const imagesConfigured = () => Boolean(process.env.OPENAI_API_KEY) && process.env.BACC_IMAGES !== "off";

export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export async function makeImage(prompt: string, size: ImageSize, file: string) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const format = ext === "jpg" ? "jpeg" : ext;
  if (!["png", "webp", "jpeg"].includes(format)) throw new Error("Use a .png, .webp or .jpg file name.");
  let lastError = "";
  for (const model of MODELS) {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size, n: 1, quality: process.env.BACC_IMAGE_QUALITY || "medium", output_format: format }),
      signal: AbortSignal.timeout(180_000),
    });
    const body = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (r.ok && body.data?.[0]?.b64_json) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, Buffer.from(body.data[0].b64_json, "base64"));
      return model;
    }
    lastError = body.error?.message || `HTTP ${r.status}`;
    // A model this key can't use (retired or not enabled): try the next one. Anything else stops here.
    if (!(r.status === 404 || /model/i.test(lastError))) break;
  }
  throw new Error(`Image not made: ${lastError}`);
}
