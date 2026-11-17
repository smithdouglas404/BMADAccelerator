import { createPublicKey, createVerify } from "node:crypto"

// Who may see the Studio's screens on the public address. Locally (localhost) there is no sign-in.
// On the public address the web door asks /api/auth/check before it serves anything but the connector,
// and this decides. It fails closed: no Clerk key, nobody on the allowed list, or a stranger means no.
// No secret is involved: Clerk signs each sign-in with a private key of its own, and the Studio checks that
// signature with Clerk's public keys.
export type AuthDecision = { status: 204 | 401 | 403 | 503; why: string }

export function list(raw: string | undefined): string[] {
  return (raw || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/** The address Clerk's sign-in service lives at, read from the publishable key (it is not a secret). */
export function clerkIssuer(publishableKey: string): string {
  const m = /^pk_(?:test|live)_(.+)$/.exec(publishableKey.trim())
  if (!m) return ""
  try {
    const host = Buffer.from(m[1], "base64").toString("utf8").replace(/\$+$/, "")
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : ""
  } catch {
    return ""
  }
}

export function decide(input: { issuer: string; emails: string[]; users: string[]; signedIn: boolean; userId: string; email: string }): AuthDecision {
  if (!input.issuer) return { status: 503, why: "Sign-in is not set up yet (Clerk key missing)." }
  if (input.emails.length === 0 && input.users.length === 0) return { status: 503, why: "Nobody is allowed in yet (STUDIO_ALLOWED_EMAILS or STUDIO_ALLOWED_USERS)." }
  if (!input.signedIn) return { status: 401, why: "Sign in first." }
  const byUser = !!input.userId && input.users.includes(input.userId.toLowerCase())
  const byEmail = !!input.email && input.emails.includes(input.email.toLowerCase())
  return byUser || byEmail ? { status: 204, why: "ok" } : { status: 403, why: "This account is not allowed." }
}

export type Claims = { iss?: string; sub?: string; exp?: number; nbf?: number; email?: string }

/** Checks a Clerk sign-in token (RS256) against Clerk's public keys. Returns its claims, or null if it is not genuine. */
export function verifySession(token: string, jwksJson: string, issuer: string, nowSec = Math.floor(Date.now() / 1000)): Claims | null {
  try {
    const [h, p, sig] = token.split(".")
    if (!h || !p || !sig) return null
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string; kid?: string }
    if (header.alg !== "RS256" || !header.kid) return null
    const jwk = ((JSON.parse(jwksJson) as { keys?: Record<string, unknown>[] }).keys || []).find((k) => k.kid === header.kid)
    if (!jwk) return null
    const key = createPublicKey({ key: jwk as never, format: "jwk" })
    if (!createVerify("RSA-SHA256").update(`${h}.${p}`).verify(key, Buffer.from(sig, "base64url"))) return null
    const c = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Claims
    if (c.iss !== issuer || typeof c.sub !== "string") return null
    if (typeof c.exp !== "number" || c.exp < nowSec - 5) return null
    if (typeof c.nbf === "number" && c.nbf > nowSec + 5) return null
    return c
  } catch {
    return null
  }
}
