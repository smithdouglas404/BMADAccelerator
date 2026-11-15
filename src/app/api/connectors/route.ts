import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ConnectorBody, RESERVED_MCP, sealSecrets, validMcpName } from "@/lib/studio/mcp";

// What the browser may see of a connector: never its secrets, only their names.
const view = (r: { secretCipher: string } & Record<string, unknown>) => {
  const { secretCipher, ...rest } = r;
  return { ...rest, hasSecrets: Boolean(secretCipher) };
};

export async function GET() {
  const rows = await prisma.mcpServer.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows.map(view));
}


// Plug in a data source or tool as an MCP server (HTTP, SSE or a local command).
export async function POST(req: Request) {
  const parsed = ConnectorBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the connector's fields." }, { status: 400 });
  const d = parsed.data;
  if (!validMcpName(d.name)) return NextResponse.json({ error: `Use a short lower-case name (letters, numbers, dashes), not ${RESERVED_MCP.join(" or ")}.` }, { status: 400 });
  if (d.transport === "stdio" ? !d.command.trim() : !/^https?:\/\//.test(d.url)) return NextResponse.json({ error: d.transport === "stdio" ? "Add the command that starts it." : "Add its http(s) address." }, { status: 400 });
  if (await prisma.mcpServer.findUnique({ where: { name: d.name } })) return NextResponse.json({ error: "A connector with that name exists." }, { status: 409 });
  const { secrets, ...rest } = d;
  const row = await prisma.mcpServer.create({ data: { ...rest, ...(await sealSecrets(secrets)) } });
  return NextResponse.json(view(row), { status: 201 });
}
