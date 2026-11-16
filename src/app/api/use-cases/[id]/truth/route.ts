import { NextResponse } from "next/server";
import { truthView } from "@/lib/studio/truthlog";
import { truthGraphSchema } from "@/studio/graph";

type Ctx = { params: Promise<{ id: string }> };

// The Product Truth Graph of one product: real nodes and edges, the explained change timeline, and the
// use case's confidence calculated from the graph.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const view = await truthView(id);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ schema: truthGraphSchema, ...view });
}
