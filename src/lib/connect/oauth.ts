import { randomInt } from "node:crypto";
import { asLevel, type Level } from "./catalog";
import { prisma } from "@/lib/db";
import { issueToken, newSecret, pkceOk, sha256 } from "./tokens";

// OAuth 2.1 for the connector: dynamic client registration, authorization code with PKCE (S256), and
// refresh tokens. The consent page asks for a short connect code that the Studio's owner reads off
// Settings > Connect, so reaching the Studio's address is not enough to connect to it.

const CONNECT_TTL = 10 * 60_000;
const g = globalThis as unknown as { connectCode?: { code: string; until: number } };

export function newConnectCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
  g.connectCode = { code, until: Date.now() + CONNECT_TTL };
  return { code, until: new Date(g.connectCode.until) };
}
export function connectCodeOk(code: string) {
  const c = g.connectCode;
  if (!c || c.until < Date.now()) return false;
  const ok = c.code === code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ok) g.connectCode = undefined; // one use
  return ok;
}

export const redirectAllowed = (uri: string) => {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname));
  } catch {
    return false;
  }
};

export async function registerClient(body: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).filter(redirectAllowed) : [];
  if (!uris.length) return null;
  const clientId = newSecret("wbc_").slice(0, 36);
  const name = String(body.client_name ?? "").slice(0, 80) || "An assistant";
  await prisma.oAuthClient.create({ data: { clientId, name, redirectUris: uris } });
  return { client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

export async function clientFor(clientId: string, redirectUri: string) {
  const c = await prisma.oAuthClient.findUnique({ where: { clientId } });
  return c && c.redirectUris.includes(redirectUri) ? c : null;
}

export async function issueCode(a: { clientId: string; redirectUri: string; challenge: string; scope: Level; customer: string; person: string; role: string }) {
  const code = newSecret("wbo_");
  await prisma.oAuthCode.create({ data: { hash: sha256(code), clientId: a.clientId, redirectUri: a.redirectUri, challenge: a.challenge, scope: a.scope, customer: a.customer, person: a.person, role: a.role, expiresAt: new Date(Date.now() + CONNECT_TTL) } });
  return code;
}

const DAYS = 30;
const scopeWords = (l: Level) => (l === "admin" ? "read write admin" : l === "write" ? "read write" : "read");
const grant = (t: { token: string; refresh: string }, scope: string) => ({ access_token: t.token, token_type: "Bearer", expires_in: DAYS * 86_400, refresh_token: t.refresh, scope });

export async function exchange(p: URLSearchParams): Promise<{ status: number; body: Record<string, unknown> }> {
  const bad = (error: string, error_description: string) => ({ status: 400, body: { error, error_description } });
  if (p.get("grant_type") === "authorization_code") {
    const row = await prisma.oAuthCode.findUnique({ where: { hash: sha256(p.get("code") ?? "") } });
    if (!row) return bad("invalid_grant", "Unknown or used code.");
    await prisma.oAuthCode.delete({ where: { id: row.id } });
    if (row.expiresAt < new Date()) return bad("invalid_grant", "The code expired.");
    if (row.clientId !== p.get("client_id") || row.redirectUri !== p.get("redirect_uri")) return bad("invalid_grant", "Client or redirect does not match.");
    if (!pkceOk(p.get("code_verifier") ?? "", row.challenge)) return bad("invalid_grant", "PKCE check failed.");
    const client = await prisma.oAuthClient.findUnique({ where: { clientId: row.clientId } });
    const scope = asLevel(row.scope);
    const t = await issueToken({ name: client?.name || "An assistant", scope, customer: row.customer, person: row.person, role: row.role, clientId: row.clientId, days: DAYS, refresh: true });
    return { status: 200, body: grant(t, scopeWords(scope)) };
  }
  if (p.get("grant_type") === "refresh_token") {
    const old = await prisma.apiToken.findFirst({ where: { refreshHash: sha256(p.get("refresh_token") ?? ""), revokedAt: null } });
    if (!old || !old.refreshHash) return bad("invalid_grant", "Unknown refresh token.");
    if (p.get("client_id") && p.get("client_id") !== old.clientId) return bad("invalid_grant", "Client does not match.");
    await prisma.apiToken.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
    const scope = asLevel(old.scope);
    const t = await issueToken({ name: old.name, scope, customer: old.customer, person: old.person, role: old.role, clientId: old.clientId, days: DAYS, refresh: true });
    return { status: 200, body: grant(t, scopeWords(scope)) };
  }
  return bad("unsupported_grant_type", "Use authorization_code or refresh_token.");
}
