import { NextResponse } from "next/server";
import { startPreview } from "@/lib/preview";

type Ctx = { params: Promise<{ id: string }> };

// "Start the preview": brings back a product's preview that stopped (a restart, a crash).
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  void startPreview(id).catch((e) => console.error("preview", e));
  return NextResponse.json({ starting: true });
}
