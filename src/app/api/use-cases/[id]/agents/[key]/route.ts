import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { syncAgents } from "@/lib/agentService";
import { recordChange } from "@/lib/studio/truthlog";
import { agentsEnabled, enqueue } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string; key: string }> };

const Body = z.object({ persona: z.boolean().optional(), on: z.boolean().optional(), by: z.string().max(80).default("") });

// A person switches an agent on or off, or its Letta persona (off only on their explicit say-so).
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, key } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const a = await prisma.appAgent.findUnique({ where: { useCaseId_key: { useCaseId: id, key } } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { persona, on, by } = parsed.data;
  const data: { persona?: boolean; status?: string } = {};
  if (persona !== undefined) data.persona = persona;
  if (on !== undefined) data.status = on ? "approved" : "off";
  const after = await prisma.appAgent.update({ where: { id: a.id }, data });
  const what = [persona !== undefined && (persona ? "switched its persona on" : "switched its persona off"), on !== undefined && (on ? "switched it on" : "switched it off")].filter(Boolean).join(" and ");
  if (what) {
    await recordChange(id, { node: a.decisionId ? `decision:${a.decisionId}` : "usecase", kind: "changed", summary: `${by || "A person"} ${what}: the ${a.name} agent`, by: by || "Owner" });
    if (agentsEnabled()) await enqueue(id, "note", `${by || "A person"} ${what} for the ${a.name} agent (key ${a.key}). Carry it into the TRD's agent sections. Don't reply unless it changes something they need to know.`);
  }
  void syncAgents(id).catch((e) => console.error("agent sync", e));
  return NextResponse.json(after);
}
