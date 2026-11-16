// The app's link to the Studio's shared agent service. Copy into the app's server code and import it
// there only (never in browser code): it holds the app token. The agents themselves, their personas
// (Letta), memory (Mem0), approvals and run history live in the service; the app only asks and shows.
//
//   const { runId } = await askAgent("claim-reply", "Where is my claim?", { person: user.email });
//   const run = await waitForRun(runId);         // status: done | waiting | rejected | failed
//   const waiting = await approvals("pending");  // show them on an approval screen
//   await decide(id, "approve", "Looks right", user.name);
//
// Actions: the service calls POST /api/agent-actions/<tool> on this app with the header
// X-Agent-Service-Secret. Check it with isAgentService(req.headers) before doing anything.
// With no AGENT_SERVICE_URL (the app running on its own), every call returns a labelled demo.

const URL_ = (process.env.AGENT_SERVICE_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.AGENT_SERVICE_TOKEN ?? "";

export type AgentRun = {
  id: string; agent: string; input: string; output: string; status: "queued" | "running" | "waiting" | "done" | "rejected" | "failed";
  error: string; demo: boolean; steps: { at: string; kind: string; detail: string }[]; created_at: string;
};
export type AgentApproval = { id: string; run_id: string; agent: string; kind: "action" | "output"; title: string; detail: string; status: string; comment: string; created_at: string };

export const agentsConnected = () => Boolean(URL_ && TOKEN);

async function call<T>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${URL_}${p}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Agent service ${res.status}`);
  return data as T;
}

export async function listAgents(): Promise<{ key: string; name: string; purpose: string; persona: boolean }[]> {
  return agentsConnected() ? call("GET", "/v1/agents") : [];
}

export async function askAgent(agent: string, input: string, opts: { person?: string } = {}): Promise<{ runId: string; demo?: boolean }> {
  if (!agentsConnected()) return { runId: `demo_${Date.now()}`, demo: true };
  return call("POST", `/v1/agents/${agent}/runs`, { input, person: opts.person ?? "" });
}

export async function getRun(runId: string): Promise<AgentRun> {
  if (runId.startsWith("demo_") || !agentsConnected())
    return { id: runId, agent: "", input: "", output: "[Demo] The agent service isn't connected, so this is a sample answer.", status: "done", error: "", demo: true, steps: [], created_at: new Date().toISOString() };
  return call("GET", `/v1/runs/${runId}`);
}

/** Waits until the run is done, rejected, failed or waiting for a person (then show the approval). */
export async function waitForRun(runId: string, timeoutMs = 60_000): Promise<AgentRun> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const r = await getRun(runId);
    if (r.status !== "queued" && r.status !== "running") return r;
    if (Date.now() > end) return r;
    await new Promise((res) => setTimeout(res, 800));
  }
}

export async function runs(limit = 30): Promise<AgentRun[]> {
  return agentsConnected() ? call("GET", `/v1/runs?limit=${limit}`) : [];
}

export async function approvals(status?: "pending" | "approved" | "rejected"): Promise<AgentApproval[]> {
  return agentsConnected() ? call("GET", `/v1/approvals${status ? `?status=${status}` : ""}`) : [];
}

export async function decide(approvalId: string, decision: "approve" | "reject", comment = "", by = "") {
  return call<{ ok: boolean }>("POST", `/v1/approvals/${approvalId}`, { decision, comment, by });
}

/** True when a request to /api/agent-actions/* really comes from the agent service. */
export function isAgentService(headers: { get(name: string): string | null } | Record<string, string | string[] | undefined>) {
  const secret = process.env.AGENT_SERVICE_SECRET ?? "";
  const got = typeof (headers as { get?: unknown }).get === "function" ? (headers as { get(n: string): string | null }).get("x-agent-service-secret") : (headers as Record<string, string>)["x-agent-service-secret"];
  return Boolean(secret) && got === secret;
}
