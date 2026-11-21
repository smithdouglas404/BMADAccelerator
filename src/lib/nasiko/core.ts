// The pure parts of the Studio's Nasiko link (tests/nasiko.test.mjs): names, A2A agent cards, the body that
// registers an agent in Nasiko's catalog, when to sign in again, and who may call the Studio's A2A door.
// Nothing here has a word of its own about a product: every name, description and skill is passed in from
// real records (the team definitions, the skills' own files, the product's approved agents).

export type AgentSkill = { id: string; name: string; description: string; tags: string[] };

export type AgentSpec = {
  /** The unique name in Nasiko's catalog. */
  name: string;
  displayName: string;
  description: string;
  skills: AgentSkill[];
  tags: string[];
  /** "team": Socra and its specialists (a message goes into a product's conversation). "product": an approved agent of one product. */
  kind: "team" | "product";
  /** The agent's own key in the Studio (a specialist key, "socra", or the product agent's key). */
  key: string;
  useCaseId?: string;
  useCaseName?: string;
};

export const NAME_MAX = 60;

/** lowercase letters, digits and single hyphens. */
export function slug(text: string, max = 40): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** A catalog name for one agent: "studio-<agent>" for the team, "studio-<product>-<agent>" for a product's own. */
export function agentName(kind: AgentSpec["kind"], key: string, useCaseSlug?: string): string {
  const parts = ["studio", kind === "product" && useCaseSlug ? slug(useCaseSlug, 24) : "", slug(key, 28)].filter(Boolean);
  return parts.join("-").slice(0, NAME_MAX).replace(/-+$/g, "");
}

/** Where Nasiko calls this agent: the Studio's A2A door. */
export function a2aUrl(studioBase: string, name: string): string {
  return `${studioBase.replace(/\/+$/, "")}/api/a2a/${name}`;
}

/** The A2A agent card (https://a2a-protocol.org), the open way to describe an agent so any harness can use it. */
export function agentCard(spec: AgentSpec, studioBase: string, version = "1.0.0") {
  return {
    name: spec.displayName,
    description: spec.description,
    version,
    supportedInterfaces: [{ url: a2aUrl(studioBase, spec.name), protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: spec.skills.map((s) => ({ id: s.id, name: s.name, description: s.description, tags: s.tags })),
  };
}

/** The body of POST /api/agents (Nasiko's catalog): an agent registered by its address. */
export function registrationBody(spec: AgentSpec, studioBase: string, version = "1.0.0") {
  return {
    name: spec.name,
    display_name: spec.displayName,
    description: spec.description,
    url: a2aUrl(studioBase, spec.name),
    version,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false, chat_agent: false },
    skills: spec.skills,
    tags: spec.tags,
    metadata: { source: "working-backwards-studio", kind: spec.kind, key: spec.key, ...(spec.useCaseName ? { product: spec.useCaseName } : {}) },
  };
}

// ---- signing in ----

/** A Nasiko session token lasts 7 days with no refresh. Sign in again a day early, or when none is held. */
export const TOKEN_LIFE_MS = 7 * 24 * 3600_000;
export const RELOGIN_AFTER_MS = 6 * 24 * 3600_000;

export function needsLogin(loggedInAt: Date | null | undefined, now = Date.now()): boolean {
  return !loggedInAt || now - loggedInAt.getTime() >= RELOGIN_AFTER_MS;
}

/** Only an http(s) address with a host; no credentials inside it and nothing after the origin's path. */
export function cleanUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname || u.username || u.password) return null;
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

// ---- who may call the Studio's A2A door ----

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|host\.docker\.internal|host\.containers\.internal|app|[a-z0-9-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

/**
 * The A2A door is for the Nasiko server beside the Studio, never the public address: a request that came through
 * the Cloudflare tunnel (any cf-* header) or names a public host (Host or X-Forwarded-Host) is refused. (Next adds its own
 * x-forwarded-for to every request, so that header says nothing.)
 */
export function a2aAllowed(headers: { get(name: string): string | null }): boolean {
  for (const h of ["cf-connecting-ip", "cf-ray", "cf-visitor", "cf-ipcountry"]) if (headers.get(h)) return false;
  const named = [headers.get("host"), headers.get("x-forwarded-host")].filter((h): h is string => Boolean(h)).map((h) => h.replace(/:\d+$/, ""));
  return named.length > 0 && named.every((h) => LOCAL_HOST.test(h));
}

// ---- A2A JSON-RPC ----

export type Rpc = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
export const rpcOk = (id: Rpc["id"], result: unknown): Rpc => ({ jsonrpc: "2.0", id, result });
export const rpcErr = (id: Rpc["id"], code: number, message: string): Rpc => ({ jsonrpc: "2.0", id, error: { code, message } });

/** The text of an A2A message: its text parts, in order. */
export function messageText(message: unknown): string {
  const parts = (message as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export type TaskState = "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";

/** An A2A task as the Studio answers it. */
export function task(id: string, state: TaskState, text = "", contextId = "") {
  return {
    id,
    contextId: contextId || id,
    status: { state },
    ...(text ? { artifacts: [{ artifactId: `${id}-answer`, parts: [{ text }] }] } : {}),
  };
}
