import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SESSION_EDGES, addTrace } from "@/lib/studio/trace";
import { workspacePath } from "@/lib/workspace";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { rememberFeedback } from "@/lib/memory";
import { clip } from "@/lib/studio/core";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  comment: z.string().trim().min(1).max(20000),
  image: z.string().startsWith("data:image/").max(30_000_000).optional(),
  pageUrl: z.string().max(2000).default("/"),
  target: z.string().max(400).default(""),
  shape: z.enum(["object", "circle", "full-screen"]).default("object"),
  region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  voice: z.boolean().default(false),
});

// Vibe review: the owner pointed at (object), circled (region) or captured (full screen) part of the
// live product and said what should change. The note becomes a backlog signal with its frame and region
// kept, ready for the next build, and the Muse confirms its meaning.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Say what should feel different." }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const d = parsed.data;
  const n = (await prisma.feedback.count({ where: { useCaseId: id } })) + 1;
  const dir = workspacePath(uc.slug, "studio", "annotations");
  await fs.mkdir(dir, { recursive: true });
  let imagePath = "";
  if (d.image) {
    imagePath = path.join(dir, `annotation-${n}.png`);
    await fs.writeFile(imagePath, Buffer.from(d.image.split(",")[1], "base64"));
  }
  await fs.writeFile(
    path.join(dir, `annotation-${n}.json`),
    JSON.stringify({ target: d.target, note: d.comment, shape: d.shape, region: d.region ?? null, page: d.pageUrl, voice: d.voice, frameFile: imagePath ? `annotation-${n}.png` : null, at: new Date().toISOString() }, null, 2) + "\n",
  );
  const fb = await prisma.feedback.create({ data: { useCaseId: id, comment: d.comment, imagePath, pageUrl: d.pageUrl, target: d.target, shape: d.shape } });
  for (const edge of SESSION_EDGES.annotation(d.shape, d.target || "selected product surface", d.comment)) await addTrace(id, ...edge);
  const focus = uc.focus ? await prisma.capability.findFirst({ where: { useCaseId: id, key: uc.focus } }) : null;
  const item = await prisma.backlogItem.create({
    data: {
      useCaseId: id,
      title: clip(d.comment, 140),
      note: `Visual annotation on ${d.target || "the product"} (${d.shape})`,
      kind: "capture",
      group: focus?.label ?? "Unsorted signal",
      source: d.voice ? "Screen annotation / voice" : "Screen annotation",
      state: "ready",
      includeInBuild: true,
      annotationId: fb.id,
    },
  });
  rememberFeedback(uc, `A${n}`, `On ${d.target || d.pageUrl} the owner said: "${d.comment}"`);
  if (agentsEnabled())
    await enqueue(
      id,
      "annotation",
      `Vibe review: the owner ${d.shape === "circle" ? "circled a region of" : d.shape === "full-screen" ? "captured the whole screen of" : "pointed at"} ${d.target || "the live product"} (page ${d.pageUrl}) and said: "${d.comment}".${imagePath ? ` The picture is studio/annotations/annotation-${n}.png (open it with Read).` : ""} It is in the backlog (item ${item.id}), ticked for the next build. Confirm the meaning in one line if it is unclear; otherwise record it as a decision, update the spec sections it touches with an annotation trace step, and suggest a build when enough has changed.`,
    );
  return NextResponse.json({ feedback: fb, item }, { status: 201 });
}
