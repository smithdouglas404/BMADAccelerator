import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreSpec } from "@/lib/studio/state";

type Ctx = { params: Promise<{ id: string }> };

// Rollback: brings the spec's text and states back to an earlier version, as a new version.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = z.object({ version: z.number().int().min(1) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const rev = await restoreSpec(id, parsed.data.version);
  if (!rev) return NextResponse.json({ error: "No such version" }, { status: 404 });
  return NextResponse.json(rev);
}
