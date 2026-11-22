import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanSpeech } from "@/lib/docAgent";

const Body = z.object({ text: z.string().max(40000), useCaseId: z.string().max(60).optional() });

// Turns what someone said (any length) into clean natural language before it goes to Socra.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.text.trim()) return NextResponse.json({ error: "Nothing was heard." }, { status: 400 });
  return NextResponse.json({ text: await cleanSpeech(parsed.data.text, parsed.data.useCaseId), raw: parsed.data.text });
}
