import { NextResponse } from "next/server";
import { z } from "zod";
import { writeNarrative } from "@/lib/memory/inspect";
import { parseRef } from "@/lib/memory/inspectCore";

export const dynamic = "force-dynamic";

const Body = z.object({ ref: z.string(), customer: z.string().default(""), useCase: z.string().default(""), by: z.string().max(80).default("") });

// A person pressed Explain: the document model reads this agent's records and writes the narrative.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const ref = parsed.success ? parseRef(parsed.data.ref) : null;
  if (!parsed.success || !ref) return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  const r = await writeNarrative(ref, { customer: parsed.data.customer, useCaseId: parsed.data.useCase }, parsed.data.by);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json(r.narrative);
}
