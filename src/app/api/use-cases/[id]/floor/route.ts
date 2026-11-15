import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { requestQuickBuild } from "@/lib/generate";
import { FLOOR_FILE, addFloorItem, floorItems, numberFloor, parseFloor, setFloorItem } from "@/lib/agent/advisorGates";

type Ctx = { params: Promise<{ id: string }> };

// The product map: the floor (everything this kind of product has) as the client sees it.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = workspacePath(uc.slug, FLOOR_FILE);
  const md = await fs.readFile(file, "utf8").catch(() => "");
  if (!md) return NextResponse.json({ exists: false });
  const numbered = numberFloor(md);
  if (numbered !== md) await fs.writeFile(file, numbered);
  const st = await fs.stat(file);
  return NextResponse.json({ exists: true, updatedAt: st.mtime.toISOString(), ...parseFloor(numbered) });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep"), id: z.string().regex(/^F\d+$/i) }),
  z.object({ action: z.literal("remove"), id: z.string().regex(/^F\d+$/i), note: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("change"), id: z.string().regex(/^F\d+$/i), note: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("restore"), id: z.string().regex(/^F\d+$/i) }),
  z.object({ action: z.literal("add"), area: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(500) }),
]);

// The client keeps, changes, removes or adds a feature. The floor file changes at once, the
// conversation records it, the concierge carries it into BMAD's documents, and a small build
// shows it in the preview within a couple of minutes.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say what to do with the item" }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id }, select: { slug: true, generateCount: true } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = workspacePath(uc.slug, FLOOR_FILE);
  const md = numberFloor(await fs.readFile(file, "utf8").catch(() => ""));
  if (!md.trim()) return NextResponse.json({ error: "The product floor isn't written yet" }, { status: 409 });

  const b = parsed.data;
  let next = md;
  let said = "";
  let build = "";
  if (b.action === "add") {
    const r = addFloorItem(md, b.area, b.text, "confirmed");
    next = r.md;
    said = `On the product map I added ${r.id} under ${b.area}: ${b.text}`;
    build = `Add ${r.id} (${b.area}): ${b.text}`;
  } else {
    const it = floorItems(md).find((i) => i.id === b.id.toUpperCase());
    if (!it) return NextResponse.json({ error: "That item isn't on the floor any more" }, { status: 404 });
    if (b.action === "keep") {
      next = setFloorItem(md, it.id, "confirmed");
      said = `On the product map I kept ${it.id}: ${it.text}`;
    } else if (b.action === "remove") {
      next = setFloorItem(md, it.id, "out", b.note || "removed on the product map");
      said = `On the product map I removed ${it.id}: ${it.text}${b.note ? `. Why: ${b.note}` : ""}`;
      build = `Remove ${it.id}: ${it.text}${b.note ? ` (client: ${b.note})` : ""}`;
    } else if (b.action === "change") {
      next = setFloorItem(md, it.id, "confirmed", b.note);
      said = `On the product map I changed ${it.id} (${it.text}): ${b.note}`;
      build = `Change ${it.id} (${it.text}) as the client asks: ${b.note}`;
    } else {
      next = setFloorItem(md, it.id, "assumed");
      said = `On the product map I brought back ${it.id}: ${it.text}`;
      build = `Bring back ${it.id}: ${it.text}`;
    }
  }
  await fs.writeFile(file, next);
  await prisma.message.create({ data: { useCaseId: id, role: "user", content: said } });
  if (agentsEnabled()) {
    await enqueue(
      id,
      "user",
      `${said}. ${FLOOR_FILE} already says so. As the client's advisor: carry it into any BMAD document that covers this item (through the owning agent's update workflow, citing the item id), and if it opens a real question for this kind of product (a rule, a price, a law, a follow-on feature the leaders have), ask it, one question, with a suggested answer. Otherwise reply in one line.${build && uc.generateCount ? " A small build is already updating the preview; don't start Generate." : ""}`,
    );
  }
  if (build && uc.generateCount > 0) requestQuickBuild(id, build);
  await prisma.useCase.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true, building: !!build && uc.generateCount > 0, ...parseFloor(next) });
}
