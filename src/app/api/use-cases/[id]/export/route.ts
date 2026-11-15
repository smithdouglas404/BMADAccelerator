import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exportToJira, syncUseCaseToLinear } from "@/lib/trackers";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ target: z.enum(["jira", "linear"]), projectKey: z.string().trim().min(1).max(40) });

// Publishes a use case's epics and stories to a tracker. The person confirms in the UI first.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Pick a tracker and a project key." }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const created =
      parsed.data.target === "jira" ? await exportToJira(id, parsed.data.projectKey) : await syncUseCaseToLinear(id);
    return NextResponse.json({ created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
