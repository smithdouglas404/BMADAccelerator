import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/settings";
import { ownerSays } from "@/lib/studio/actions";
import { SPECIALISTS } from "@/lib/studio/core";
import { agentServiceConfigured } from "@/lib/agentService";
import { messageText, rpcErr, rpcOk, task, type AgentSpec, type Rpc } from "@/lib/nasiko/core";

// The Studio's A2A door (https://a2a-protocol.org): how Nasiko, or any harness that speaks A2A, talks to a
// Studio agent. message/send puts the words where the Studio puts everyone's words, and tasks/get returns the answer once
// the agent has given it:
//  - Socra and the specialists: the words go into a product's conversation as an outside agent's
//    (the same rules as the screens: requirements held, nothing approved by itself); the answer is the
//    agent's next statement there. The product is named in message.metadata.use_case (its id or its address name).
//  - A product's own approved agents: a run in the shared agent service, with its approvals as usual.

const SPECIALIST_KEYS: string[] = SPECIALISTS.map((s) => s.key);

async function findUseCase(ref: string) {
  if (!ref) return null;
  return prisma.useCase.findFirst({ where: { archivedAt: null, OR: [{ id: ref }, { slug: ref }, { name: ref }] }, select: { id: true, name: true } });
}

async function sendToTeam(spec: AgentSpec, text: string, meta: Record<string, unknown>, id: Rpc["id"]): Promise<Rpc> {
  const ref = spec.useCaseId ?? String(meta.use_case ?? meta.useCase ?? "");
  const uc = await findUseCase(ref);
  if (!uc) return rpcErr(id, -32602, `Name the product this is about: message.metadata.use_case, with its id or its name. ${spec.displayName} works inside one product's conversation.`);
  const domain = spec.key.startsWith("domain:");
  const specialist = domain ? "domain" : SPECIALIST_KEYS.includes(spec.key) ? spec.key : "";
  // Agents that only run inside Socra's turns (the validator, the researchers) cannot be addressed on their own: the words go to Socra, marked for them.
  const body = specialist || spec.key === "socra" ? text : `[For ${spec.displayName}] ${text}`;
  const who = typeof meta.from === "string" && meta.from.trim() ? meta.from.trim().slice(0, 60) : "Nasiko";
  await ownerSays(uc.id, body, { source: "Nasiko (A2A)", author: { name: who, role: "Outside agent" }, ...(specialist ? { to: specialist } : {}) });
  const msg = await prisma.message.findFirst({ where: { useCaseId: uc.id, role: "user", author: who }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!msg) return rpcErr(id, -32603, "The Studio did not record the message.");
  return rpcOk(id, task(`msg-${msg.id}`, "working", "", uc.id));
}

async function sendToProductAgent(spec: AgentSpec, text: string, id: Rpc["id"]): Promise<Rpc> {
  if (!agentServiceConfigured() || !spec.useCaseId) return rpcErr(id, -32603, "The shared agent service is not connected here.");
  const uc = await prisma.useCase.findUnique({ where: { id: spec.useCaseId }, select: { agentToken: true } });
  if (!uc?.agentToken) return rpcErr(id, -32603, "This product's agents are not registered in the agent service yet.");
  const base = (process.env.AGENT_SERVICE_URL ?? "").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/agents/${spec.key}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await decrypt(uc.agentToken)}` },
    body: JSON.stringify({ input: text, person: "Nasiko" }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return rpcErr(id, -32603, `The agent service answered ${res?.status ?? "nothing"}.`);
  const j = (await res.json()) as { runId: string };
  return rpcOk(id, task(`run-${spec.useCaseId}-${j.runId}`, "working", "", spec.useCaseId));
}

async function getTask(taskId: string, id: Rpc["id"]): Promise<Rpc> {
  const m = taskId.match(/^msg-(.+)$/);
  if (m) {
    const sent = await prisma.message.findUnique({ where: { id: m[1] } });
    if (!sent) return rpcErr(id, -32001, "No such task.");
    // The answer is the addressed specialist's next statement, or Socra's when nobody else was addressed.
    const reply = await prisma.message.findFirst({
      where: { useCaseId: sent.useCaseId, createdAt: { gt: sent.createdAt }, ...(sent.addressed ? { role: "agent", addressed: sent.addressed } : { role: "muse" }) },
      orderBy: { createdAt: "asc" },
    });
    return rpcOk(id, reply ? task(taskId, "completed", reply.content, sent.useCaseId) : task(taskId, "working", "", sent.useCaseId));
  }
  const r = taskId.match(/^run-([^-]+)-(run_[\w-]+)$/);
  if (!r) return rpcErr(id, -32001, "No such task.");
  const uc = await prisma.useCase.findUnique({ where: { id: r[1] }, select: { agentToken: true } });
  if (!uc?.agentToken || !agentServiceConfigured()) return rpcErr(id, -32603, "The shared agent service is not connected here.");
  const base = (process.env.AGENT_SERVICE_URL ?? "").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/runs/${r[2]}`, { headers: { Authorization: `Bearer ${await decrypt(uc.agentToken)}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return rpcErr(id, -32001, "No such task.");
  const run = (await res.json()) as { status: string; output?: string; error?: string };
  if (run.status === "done") return rpcOk(id, task(taskId, "completed", run.output ?? "", r[1]));
  if (run.status === "waiting") return rpcOk(id, task(taskId, "input-required", "Waiting for a person to approve a step in the Studio.", r[1]));
  if (run.status === "failed" || run.status === "rejected") return rpcOk(id, task(taskId, "failed", run.error || (run.status === "rejected" ? "A person rejected a step." : "The run failed."), r[1]));
  return rpcOk(id, task(taskId, "working", "", r[1]));
}

/** One JSON-RPC call to one agent. */
export async function handleRpc(spec: AgentSpec, rpc: unknown): Promise<Rpc> {
  const r = (rpc ?? {}) as { id?: Rpc["id"]; method?: string; params?: Record<string, unknown> };
  const id = r.id ?? null;
  if (r.method === "message/send") {
    const text = messageText(r.params?.message);
    if (!text) return rpcErr(id, -32602, "The message has no text.");
    const meta = ((r.params?.message as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? (r.params?.metadata as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    return spec.kind === "product" ? sendToProductAgent(spec, text, id) : sendToTeam(spec, text, meta, id);
  }
  if (r.method === "tasks/get") {
    const taskId = String((r.params as { id?: unknown } | undefined)?.id ?? "");
    return getTask(taskId, id);
  }
  return rpcErr(id, -32601, `The Studio's agents answer message/send and tasks/get, not ${String(r.method)}.`);
}
