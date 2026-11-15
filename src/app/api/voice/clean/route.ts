import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanSpeech } from "@/lib/docAgent";

const Body = z.object({ text: z.string().max(40000) });

// Turns what someone said (any length) into clean natural language before it goes to the Muse.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.text.trim()) return NextResponse.json({ error: "Nothing was heard." }, { status: 400 });
  return NextResponse.json({ text: await cleanSpeech(parsed.data.text), raw: parsed.data.text });
}
