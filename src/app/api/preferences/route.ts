import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET() {
  const prefs = await prisma.preferences.upsert({ where: { id: "global" }, create: {}, update: {} });
  return NextResponse.json(prefs);
}

const Body = z
  .object({
    targetCodex: z.boolean(),
    targetCursor: z.boolean(),
    targetAntigravity: z.boolean(),
    tracker: z.enum(["builtin", "linear", "jira", "github", "notion", "trello"]),
    trackerProjectKey: z.string().max(100),
  })
  .partial();

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const prefs = await prisma.preferences.upsert({
    where: { id: "global" },
    create: parsed.data,
    update: parsed.data,
  });
  return NextResponse.json(prefs);
}
