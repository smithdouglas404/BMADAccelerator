import { NextResponse } from "next/server";
import { z } from "zod";
import { loadSettingsIntoEnv, removeKey, saveKey, saveModel, settingsStatus } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Keys are write-only: the page sees whether one is set and its last four characters, never the key.
export async function GET() {
  await loadSettingsIntoEnv();
  return NextResponse.json(await settingsStatus());
}

const Body = z.union([
  z.object({ action: z.literal("key"), env: z.string().max(60), value: z.string().max(500) }),
  z.object({ action: z.literal("removeKey"), env: z.string().max(60) }),
  z.object({ action: z.literal("model"), role: z.string().max(60), model: z.string().max(120).nullable() }),
]);

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await loadSettingsIntoEnv();
  const b = parsed.data;
  try {
    if (b.action === "key") await saveKey(b.env, b.value);
    else if (b.action === "removeKey") await removeKey(b.env);
    else await saveModel(b.role, b.model);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json(await settingsStatus());
}
