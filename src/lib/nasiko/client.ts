import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/settings";
import { cleanUrl, needsLogin } from "@/lib/nasiko/core";

// The Studio's side of the link to a self-hosted Nasiko. Everything here is best effort: when Nasiko is down,
// unreachable or not set up, the Studio carries on exactly as before and the Settings card says why.
// The session token lives in memory only (never logged, never in a URL); the password is stored encrypted.

type Link = Awaited<ReturnType<typeof prisma.nasikoLink.findUnique>>;

export async function getLink(): Promise<NonNullable<Link>> {
  return (await prisma.nasikoLink.findUnique({ where: { id: "global" } })) ?? (await prisma.nasikoLink.create({ data: { id: "global" } }));
}

/** What the Settings card may see: never the password, only whether it is set and its last four. */
export function publicLink(l: NonNullable<Link>) {
  return {
    url: l.url,
    username: l.username,
    passwordSet: Boolean(l.cipher),
    last4: l.last4,
    enabled: l.enabled,
    loggedInAt: l.loggedInAt,
    lastOkAt: l.lastOkAt,
    lastError: l.lastError,
    syncedAt: l.syncedAt,
  };
}

export async function saveLink(input: { url?: string; username?: string; password?: string; enabled?: boolean }) {
  const data: Record<string, unknown> = {};
  if (input.url !== undefined) {
    const url = cleanUrl(input.url);
    if (!url) throw new Error("Give the address of your Nasiko server, like http://host.docker.internal:8480");
    data.url = url;
  }
  if (input.username !== undefined) data.username = input.username.trim().slice(0, 120);
  if (input.password) {
    const p = input.password;
    if (p.length < 8) throw new Error("That password is too short to be the one Nasiko gave");
    data.cipher = await encrypt(p);
    data.last4 = p.slice(-4);
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;
  // A changed address, user or password means the old token no longer applies.
  if (data.url !== undefined || data.username !== undefined || data.cipher !== undefined) {
    data.loggedInAt = null;
    token = null;
  }
  await prisma.nasikoLink.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
  return getLink();
}

export async function clearLink() {
  token = null;
  await prisma.nasikoLink.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: { url: "", username: "", cipher: "", last4: "", loggedInAt: null, lastOkAt: null, lastError: "", syncedAt: null },
  });
}

// ---- the session ----

let token: string | null = null;

const timeout = (ms = 10_000) => AbortSignal.timeout(ms);

async function note(error: string) {
  await prisma.nasikoLink.update({ where: { id: "global" }, data: error ? { lastError: error.slice(0, 300) } : { lastError: "", lastOkAt: new Date() } }).catch(() => undefined);
}

/** Signs in with the stored username and password. Returns "" on success, or why not. */
export async function login(): Promise<string> {
  const l = await getLink();
  if (!l.url || !l.username || !l.cipher) return "Not set up yet: add the address, the user name and the password.";
  try {
    const res = await fetch(`${l.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: l.username, password: await decrypt(l.cipher) }),
      signal: timeout(),
    });
    if (res.status === 429) return "Nasiko is limiting sign-ins (too many wrong passwords). Wait 15 minutes, then check the password.";
    if (!res.ok) return res.status === 401 ? "Nasiko did not accept that user name and password." : `Nasiko answered ${res.status} to the sign-in.`;
    const j = (await res.json().catch(() => ({}))) as { token?: string };
    if (!j.token) return "Nasiko's sign-in gave no token.";
    token = j.token;
    await prisma.nasikoLink.update({ where: { id: "global" }, data: { loggedInAt: new Date() } });
    return "";
  } catch (e) {
    return `Could not reach Nasiko at ${l.url}: ${(e as Error).message}`;
  }
}

export type Reply<T = unknown> = { ok: boolean; status: number; body: T; error: string };

/** A call to Nasiko's API as the Studio's account. Signs in first (and again after 6 days, or on a 401). Never throws. */
export async function nasiko<T = unknown>(method: string, path: string, body?: unknown): Promise<Reply<T>> {
  const l = await getLink();
  if (!l.enabled) return { ok: false, status: 0, body: null as T, error: "Nasiko is switched off here." };
  if (!l.url) return { ok: false, status: 0, body: null as T, error: "Nasiko is not set up yet." };
  const go = async (): Promise<Reply<T>> => {
    try {
      const res = await fetch(`${l.url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout(20_000),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* plain text */
      }
      return { ok: res.ok, status: res.status, body: parsed as T, error: res.ok ? "" : typeof parsed === "string" ? parsed.slice(0, 300) : ((parsed as { error?: string; message?: string })?.error || (parsed as { message?: string })?.message || `Nasiko answered ${res.status}`) };
    } catch (e) {
      return { ok: false, status: 0, body: null as T, error: `Could not reach Nasiko at ${l.url}: ${(e as Error).message}` };
    }
  };
  if (!token || needsLogin(l.loggedInAt)) {
    const why = await login();
    if (why) {
      await note(why);
      return { ok: false, status: 0, body: null as T, error: why };
    }
  }
  let r = await go();
  if (r.status === 401) {
    const why = await login();
    if (why) {
      await note(why);
      return { ok: false, status: 401, body: null as T, error: why };
    }
    r = await go();
  }
  await note(r.ok ? "" : r.error);
  return r;
}

// ---- what the card shows ----

export type Health = { reachable: boolean; ready?: boolean; postgres?: boolean; redis?: boolean; orchestrator?: boolean; agentsTotal?: number; agentsRunning?: number; error?: string };

/** Nasiko's own health, readiness and counts: three routes that need no sign-in. */
export async function health(url: string): Promise<Health> {
  try {
    const live = await fetch(`${url}/health`, { signal: timeout(6000) });
    if (!live.ok) return { reachable: false, error: `Nasiko answered ${live.status} to /health` };
    const ready = await fetch(`${url}/readiness`, { signal: timeout(6000) });
    const r = (await ready.json().catch(() => ({}))) as { status?: string; postgres?: boolean; redis?: boolean; orchestrator?: boolean };
    const m = await fetch(`${url}/metrics`, { signal: timeout(6000) }).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
    const mm = m as { agents_total?: number; agents_running?: number };
    return { reachable: true, ready: ready.ok && r.status === "ready", postgres: r.postgres, redis: r.redis, orchestrator: r.orchestrator, agentsTotal: mm.agents_total, agentsRunning: mm.agents_running };
  } catch (e) {
    return { reachable: false, error: `Could not reach Nasiko at ${url}: ${(e as Error).message}` };
  }
}

export type NasikoAgent = { id: string; name: string; display_name?: string | null; description?: string | null; url?: string | null; status: string; version: string; tags: string[] };

export async function listAgents(): Promise<Reply<NasikoAgent[]>> {
  const r = await nasiko<NasikoAgent[] | { data?: NasikoAgent[] }>("GET", "/api/agents?limit=100");
  const list = Array.isArray(r.body) ? r.body : Array.isArray((r.body as { data?: NasikoAgent[] } | null)?.data) ? (r.body as { data: NasikoAgent[] }).data : [];
  return { ...r, body: list };
}

export type Spend = { totalCost: number; operations: number; range: string; agents: { name: string; cost: number; operations: number }[] };

/** TokenOps for the last 7 days: what each agent cost, from Nasiko's own records. */
export async function spend(range: "24h" | "7d" | "30d" = "7d"): Promise<Reply<Spend | null>> {
  const r = await nasiko<{ data?: { summary?: { total_cost?: number; total_operations?: number }; agents?: { agent_name: string; total_cost: number; operations: number }[] } }>("GET", `/api/finops/dashboard?range=${range}`);
  const d = r.body?.data;
  if (!r.ok || !d) return { ...r, body: null };
  return { ...r, body: { totalCost: d.summary?.total_cost ?? 0, operations: d.summary?.total_operations ?? 0, range, agents: (d.agents ?? []).map((a) => ({ name: a.agent_name, cost: a.total_cost, operations: a.operations })) } };
}
