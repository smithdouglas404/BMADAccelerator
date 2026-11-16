import { NextResponse } from "next/server";
import { agentsView } from "@/lib/agentService";

type Ctx = { params: Promise<{ id: string }> };

// The Agents view: each agent the product has (proposed, running, off), its runs and what waits for a person.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await agentsView(id));
}
