import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pendingWhere, pushPendingUsage } from "@/lib/nasiko/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// How many recorded Claude runs Nasiko has been sent, and a way to send the rest now.
export async function GET() {
  const [sent, pending] = await Promise.all([prisma.llmUsage.count({ where: { sentToNasiko: true } }), prisma.llmUsage.count({ where: pendingWhere })]);
  return NextResponse.json({ sent, pending });
}

export async function POST() {
  let total = { sent: 0, failed: 0, error: "" };
  for (let i = 0; i < 20; i++) {
    const r = await pushPendingUsage();
    total = { sent: total.sent + r.sent, failed: r.failed, error: r.error };
    if (r.sent === 0 || r.pending === 0) break;
  }
  return NextResponse.json({ ...total, pending: await prisma.llmUsage.count({ where: pendingWhere }) });
}
