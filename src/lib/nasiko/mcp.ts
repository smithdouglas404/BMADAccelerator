import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/connect/tokens";
import { nasiko } from "@/lib/nasiko/client";
import { studioBaseForNasiko } from "@/lib/nasiko/agents";

// The Studio's own MCP connector (/api/mcp, see docs/CONNECT.md) in Nasiko's MCP gateway, so Nasiko lists its tools.
// Nasiko calls it with a "look only" token that goes straight from the Studio into Nasiko's write-only credential
// store: never in a URL, never logged, never shown. Nasiko must be allowed to reach this computer (MCP_ALLOW_PRIVATE_URLS
// in docker-compose.nasiko.yml); a public Studio address needs no such setting.

export const CONNECTOR_NAME = "working-backwards-studio";
const TOKEN_NAME = "Nasiko MCP gateway (look only)";

export type McpConnector = { id: string; name: string; displayName: string; url: string; auth: string; status: string; error: string; connected: boolean; tools: { name: string; description: string }[] };

type View = { connector_id: string; name: string; display_name?: string | null; url: string; auth_type: string; setup_status?: string | null; setup_error?: string | null; is_connected?: boolean; tools?: { name: string; description?: string | null }[] };
const unwrap = <T,>(b: unknown): T | null => ((b as { data?: T } | null)?.data ?? null) as T | null;

const shape = (v: View): McpConnector => ({
  id: v.connector_id,
  name: v.name,
  displayName: v.display_name || v.name,
  url: v.url,
  auth: v.auth_type,
  status: v.setup_status || "",
  error: v.setup_error || "",
  connected: Boolean(v.is_connected),
  tools: (v.tools ?? []).map((t) => ({ name: t.name, description: t.description || "" })),
});

/** The connectors Nasiko lists for the Studio's account, each with the tools Nasiko itself reports. */
export async function listConnectors(): Promise<{ ok: boolean; error: string; connectors: McpConnector[] }> {
  const r = await nasiko<unknown>("GET", "/api/mcp/connectors");
  if (!r.ok) return { ok: false, error: r.error, connectors: [] };
  const d = unwrap<{ created_by_you?: View[]; shared_with_you?: View[] }>(r.body);
  const ids = [...(d?.created_by_you ?? []), ...(d?.shared_with_you ?? [])];
  // The list view may leave the tools out; the single view has them.
  const full = await Promise.all(ids.map(async (v) => (v.tools ? v : (unwrap<View>((await nasiko<unknown>("GET", `/api/mcp/connectors/${v.connector_id}`)).body) ?? v))));
  return { ok: true, error: "", connectors: full.map(shape) };
}

/** Registers the Studio's connector in Nasiko (once) and connects it with a fresh look-only token. Safe to run again. */
export async function connectStudioMcp(): Promise<{ ok: boolean; note: string }> {
  const url = `${studioBaseForNasiko()}/api/mcp`;
  const have = await listConnectors();
  if (!have.ok) return { ok: false, note: have.error };
  let c = have.connectors.find((x) => x.name === CONNECTOR_NAME);
  if (!c) {
    const r = await nasiko<unknown>("POST", "/api/mcp/connectors", {
      name: CONNECTOR_NAME,
      display_name: "Working Backwards Studio",
      url,
      transport: "streamable_http",
      auth_type: "bearer",
      description: "The Studio: look up use cases, specs, decisions and what is waiting. This connection is look only; a wider token can answer and approve.",
    });
    const v = unwrap<View>(r.body);
    if (!r.ok || !v) return { ok: false, note: `Nasiko did not register the connector: ${r.error}` };
    c = shape(v);
  } else if (c.url !== url) {
    const r = await nasiko<unknown>("PATCH", `/api/mcp/connectors/${c.id}`, { url });
    if (!r.ok) return { ok: false, note: `Nasiko did not update the connector's address: ${r.error}` };
  }
  if (!(c.connected && c.status === "active")) {
    const minted = await issueToken({ name: TOKEN_NAME, scope: "read", person: "Nasiko", role: "Agent: watcher" });
    const r = await nasiko<unknown>("POST", "/api/mcp/connect", { connector_id: c.id, credentials: { value: minted.token } });
    if (!r.ok) {
      await prisma.apiToken.update({ where: { id: minted.id }, data: { revokedAt: new Date() } }).catch(() => undefined);
      return { ok: false, note: `Nasiko did not accept the connection: ${r.error}` };
    }
    // Only the newest token stays valid.
    await prisma.apiToken.updateMany({ where: { name: TOKEN_NAME, revokedAt: null, NOT: { id: minted.id } }, data: { revokedAt: new Date() } });
  }
  const after = (await listConnectors()).connectors.find((x) => x.name === CONNECTOR_NAME);
  if (!after || after.status !== "active") return { ok: false, note: `Nasiko registered the connector but could not list its tools: ${after?.error || "no answer"}` };
  return { ok: true, note: `Connected. Nasiko lists ${after.tools.length} Studio tools (look only).` };
}
