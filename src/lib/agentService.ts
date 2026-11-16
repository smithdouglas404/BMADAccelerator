import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/settings";

// The Studio's side of the shared agent service (agent-service/, CLAUDE.md "Agent memory: Mem0 + Letta").
// The Studio registers each product and its approved agents; the product's app gets only its app token.

const base = () => (process.env.AGENT_SERVICE_URL ?? "").replace(/\/+$/, "");
export const agentServiceConfigured = () => Boolean(base() && process.env.AGENT_SERVICE_ADMIN_KEY);

async function admin<T = unknown>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${p}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.AGENT_SERVICE_ADMIN_KEY ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Agent service ${method} ${p} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type AgentRow = Awaited<ReturnType<typeof prisma.appAgent.findFirstOrThrow>>;

/** An AppAgent row as the service's configuration. */
export function agentConfig(a: AgentRow) {
  return {
    key: a.key,
    name: a.name,
    purpose: a.purpose,
    instructions: a.instructions,
    persona: { enabled: a.persona, text: a.personaText },
    model: { provider: a.provider, name: a.model },
    tools: Array.isArray(a.tools) ? a.tools : [],
    memory: { facts: a.facts },
    approvals: a.approvals && typeof a.approvals === "object" ? a.approvals : {},
  };
}

/** Where the service calls the product's app back: its preview, inside the Studio's container. */
function callbackUrl(port: number | null) {
  return port ? `http://${process.env.BACC_PREVIEW_HOST || "app"}:${port}` : "";
}

/** Registers the product and its approved agents; removes the ones switched off. Safe to run again. */
export async function syncAgents(useCaseId: string): Promise<{ ok: boolean; note: string }> {
  if (!agentServiceConfigured()) return { ok: false, note: "The shared agent service is not connected." };
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId }, include: { appAgents: true } });
  const reg = await admin<{ token: string; callbackSecret: string }>("PUT", `/v1/admin/use-cases/${uc.id}`, {
    customer: (uc as { customer?: string }).customer ?? "",
    name: uc.name,
    callbackUrl: callbackUrl(uc.previewPort ?? null),
    newToken: !uc.agentToken,
  });
  if (reg.token || reg.callbackSecret) {
    await prisma.useCase.update({
      where: { id: uc.id },
      data: { ...(reg.token ? { agentToken: await encrypt(reg.token) } : {}), agentSecret: await encrypt(reg.callbackSecret) },
    });
  }
  await pushKeys().catch(() => undefined);
  for (const a of uc.appAgents) {
    if (a.status === "approved") await admin("PUT", `/v1/admin/use-cases/${uc.id}/agents/${a.key}`, agentConfig(a));
    else await admin("DELETE", `/v1/admin/use-cases/${uc.id}/agents/${a.key}`).catch(() => undefined);
  }
  return { ok: true, note: `${uc.appAgents.filter((a) => a.status === "approved").length} agent(s) registered` };
}

/** The model keys saved on Settings, for the service's agents. Sent inside the Docker network only. */
async function pushKeys() {
  const keys: Record<string, string> = {};
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) if (process.env[k]) keys[k] = process.env[k]!;
  if (Object.keys(keys).length) await admin("PUT", "/v1/admin/keys", keys);
}

/** What the product's app may know: the service's address, its own token and its callback secret. Nothing else. */
export async function appAgentEnv(useCaseId: string): Promise<Record<string, string>> {
  if (!agentServiceConfigured()) return {};
  const uc = await prisma.useCase.findUnique({ where: { id: useCaseId }, select: { agentToken: true, agentSecret: true } });
  if (!uc?.agentToken) return {};
  return {
    AGENT_SERVICE_URL: base(),
    AGENT_SERVICE_TOKEN: await decrypt(uc.agentToken),
    AGENT_SERVICE_SECRET: uc.agentSecret ? await decrypt(uc.agentSecret) : "",
  };
}

/** The Agents view: what's registered, what each did, what's waiting for a person. */
export async function agentsView(useCaseId: string) {
  const agents = await prisma.appAgent.findMany({ where: { useCaseId }, orderBy: { createdAt: "asc" } });
  let live: { runs: unknown[]; approvals: unknown[] } = { runs: [], approvals: [] };
  let note = "";
  if (agentServiceConfigured()) {
    try {
      live = await admin("GET", `/v1/admin/use-cases/${useCaseId}`);
    } catch (e) {
      note = /404/.test((e as Error).message) ? "" : "The shared agent service is not answering right now.";
    }
  } else note = "The shared agent service is not connected here, so runs and approvals can't be shown.";
  const pub = (process.env.AGENT_SERVICE_PUBLIC_URL ?? "").replace(/\/+$/, "");
  return { agents, runs: live.runs, approvals: live.approvals, note, approvalPage: pub ? `${pub}/ui` : "" };
}

/** A person's Approve or Reject from the Studio, passed to the service with the product's own token. */
export async function decideApproval(useCaseId: string, approvalId: string, decision: "approve" | "reject", comment: string, by: string) {
  const env = await appAgentEnv(useCaseId);
  if (!env.AGENT_SERVICE_TOKEN) throw new Error("Not registered with the agent service");
  const res = await fetch(`${base()}/v1/approvals/${approvalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AGENT_SERVICE_TOKEN}` },
    body: JSON.stringify({ decision, comment, by }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json()) as { ok?: boolean; error?: string };
}
