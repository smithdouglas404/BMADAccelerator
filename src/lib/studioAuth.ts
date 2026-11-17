// Who may see the Studio's screens on the public address. Locally (localhost) there is no sign-in.
// On the public address the web door asks /api/auth/check before it serves anything but the connector,
// and this decides. It fails closed: no Clerk keys, no allowed emails, or a stranger means no.
export type AuthDecision = { status: 204 | 401 | 403 | 503; why: string }

export function allowedEmails(raw: string | undefined): string[] {
  return (raw || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))
}

export function decide(input: { hasKeys: boolean; allowed: string[]; signedIn: boolean; emails: string[] }): AuthDecision {
  if (!input.hasKeys) return { status: 503, why: "Sign-in is not set up yet (Clerk keys missing)." }
  if (input.allowed.length === 0) return { status: 503, why: "No allowed email is set (STUDIO_ALLOWED_EMAILS)." }
  if (!input.signedIn) return { status: 401, why: "Sign in first." }
  const ok = input.emails.some((e) => input.allowed.includes(e.toLowerCase()))
  return ok ? { status: 204, why: "ok" } : { status: 403, why: "This account is not allowed." }
}
