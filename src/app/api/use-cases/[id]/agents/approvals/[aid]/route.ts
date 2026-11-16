import { NextResponse } from "next/server";
import { z } from "zod";
import { decideApproval } from "@/lib/agentService";

type Ctx = { params: Promise<{ id: string; aid: string }> };

const Body = z.object({ decision: z.enum(["approve", "reject"]), comment: z.string().max(2000).default(""), by: z.string().max(80).default("") });

// Approve or Reject what an agent is waiting on, from the Studio's Agents view.
export async function POST(req: Request, { params }: Ctx) {
  const { id, aid } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success || !/^apv_[\w-]+$/.test(aid)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  try {
    return NextResponse.json(await decideApproval(id, aid, parsed.data.decision, parsed.data.comment, parsed.data.by));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
