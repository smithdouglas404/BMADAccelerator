import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { asLevel, type Level } from "./catalog";

// Access tokens for the Studio's MCP connector and REST API. Only a token's SHA-256 is stored; the token
// itself is shown once (Settings > Connect) or handed to the assistant through OAuth, never again.

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newSecret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

export type Access = { id: string; scope: Level; customer: string; person: string; role: string; name: string };

export async function issueToken(t: { name: string; scope: Level; customer?: string; person?: string; role?: string; clientId?: string; days?: number; refresh?: boolean }) {
  const token = newSecret("wbs_");
  const refresh = t.refresh ? newSecret("wbr_") : "";
  const row = await prisma.apiToken.create({
    data: {
      name: t.name,
      hash: sha256(token),
      prefix: token.slice(0, 8),
      scope: t.scope,
      customer: t.customer ?? "",
      person: t.person ?? "",
      role: t.role ?? "Product owner",
      clientId: t.clientId ?? "",
      refreshHash: refresh ? sha256(refresh) : "",
      expiresAt: t.days ? new Date(Date.now() + t.days * 86_400_000) : null,
    },
  });
  return { id: row.id, token, refresh, last4: token.slice(-4) };
}

/** The access a request carries in `Authorization: Bearer …`, or null. */
export async function accessFrom(req: Request): Promise<Access | null> {
  const m = /^Bearer\s+(wbs_[A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization")?.trim() ?? "");
  if (!m) return null;
  const hash = sha256(m[1]);
  const row = await prisma.apiToken.findUnique({ where: { hash } });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return null;
  if (!timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash))) return null;
  void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { id: row.id, scope: asLevel(row.scope), customer: row.customer, person: row.person, role: row.role, name: row.name };
}

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge. */
export function pkceOk(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** The public address of this Studio, for OAuth metadata and the connector URL. */
export function publicBase(req: Request) {
  const env = (process.env.STUDIO_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (env) return env;
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
