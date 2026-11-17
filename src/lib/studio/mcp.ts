// MCP adapters: data sources and tools a team plugs into the Studio (Settings > Connectors). Socra,
// its helpers and Generate get every connector switched on for the product, beside the Studio's own
// tools and the shadcn registry. Secrets (headers or environment values) are stored encrypted.
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/settings";

export const RESERVED_MCP = ["studio", "shadcn"];

export function validMcpName(name: string) {
  return /^[a-z][a-z0-9-]{1,30}$/.test(name) && !RESERVED_MCP.includes(name);
}

/** A connector as Settings sends it. Secrets are sealed before they are stored. */
export const ConnectorBody = z.object({
  name: z.string().trim().toLowerCase(),
  label: z.string().max(80).default(""),
  transport: z.enum(["http", "sse", "stdio"]).default("http"),
  url: z.string().max(1000).default(""),
  command: z.string().max(400).default(""),
  args: z.array(z.string().max(400)).max(40).default([]),
  secrets: z.record(z.string(), z.string().max(4000)).default({}),
  allProducts: z.boolean().default(true),
  useCases: z.array(z.string()).max(500).default([]),
  enabled: z.boolean().default(true),
});

export async function sealSecrets(values: Record<string, string>) {
  const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) => k.trim() && v.trim()));
  if (!Object.keys(clean).length) return { secretCipher: "", secretNames: [] as string[] };
  return { secretCipher: await encrypt(JSON.stringify(clean)), secretNames: Object.keys(clean) };
}

async function openSecrets(cipher: string): Promise<Record<string, string>> {
  if (!cipher) return {};
  try {
    return JSON.parse(await decrypt(cipher));
  } catch {
    return {};
  }
}

/** The connectors this product's agents may use, as Agent SDK MCP server configs. */
export async function mcpServersFor(useCaseId: string): Promise<Record<string, McpServerConfig>> {
  const rows = await prisma.mcpServer.findMany({ where: { enabled: true } }).catch(() => []);
  const out: Record<string, McpServerConfig> = {};
  for (const r of rows) {
    if (!r.allProducts && !r.useCases.includes(useCaseId)) continue;
    const secrets = await openSecrets(r.secretCipher);
    if (r.transport === "stdio") {
      if (!r.command) continue;
      out[r.name] = { type: "stdio", command: r.command, args: r.args, env: secrets };
    } else if (r.url) {
      out[r.name] = { type: r.transport === "sse" ? "sse" : "http", url: r.url, headers: secrets };
    }
  }
  return out;
}

/** One line per connector, for the agents' instructions. */
export async function mcpSummary(useCaseId: string) {
  const rows = await prisma.mcpServer.findMany({ where: { enabled: true } }).catch(() => []);
  const mine = rows.filter((r) => r.allProducts || r.useCases.includes(useCaseId));
  if (!mine.length) return "";
  return `Connectors the team plugged in (MCP; tools named mcp__<name>__*): ${mine.map((r) => `${r.name}${r.label ? ` (${r.label})` : ""}`).join(", ")}. Use them for real data and evidence when they help; quote what you take from them as evidence with its source.`;
}

export { encrypt };

/** Connects to a connector and lists its tools, so the team can see it works before the agents use it. */
export async function testConnector(id: string): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  const r = await prisma.mcpServer.findUniqueOrThrow({ where: { id } });
  const secrets = await openSecrets(r.secretCipher);
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const client = new Client({ name: "working-backwards-studio", version: "1.0.0" });
  let transport;
  if (r.transport === "stdio") {
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    transport = new StdioClientTransport({ command: r.command, args: r.args, env: { ...(process.env as Record<string, string>), ...secrets } });
  } else if (r.transport === "sse") {
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
    transport = new SSEClientTransport(new URL(r.url), { requestInit: { headers: secrets } });
  } else {
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    transport = new StreamableHTTPClientTransport(new URL(r.url), { requestInit: { headers: secrets } });
  }
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("No answer within 20 seconds.")), 20_000));
  try {
    await Promise.race([client.connect(transport), timeout]);
    const { tools } = await Promise.race([client.listTools(), timeout]);
    return { ok: true, tools: tools.map((t) => t.name) };
  } catch (e) {
    return { ok: false, tools: [], error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  } finally {
    await client.close().catch(() => {});
  }
}
