import { clerkIssuer, decide, list, verifySession } from "@/lib/studioAuth";

export const dynamic = "force-dynamic";

// Asked by the public door (nginx auth_request) for every page that is not the connector.
// 204 lets it through; 401 sends the visitor to the sign-in page; anything else is a plain refusal.
// The sign-in is checked against Clerk's public keys; no Clerk secret is needed or stored.

let jwks: { at: number; issuer: string; json: string } | null = null;

async function keys(issuer: string): Promise<string> {
  if (jwks && jwks.issuer === issuer && Date.now() - jwks.at < 3_600_000) return jwks.json;
  const r = await fetch(`${issuer}/.well-known/jwks.json`, { cache: "no-store" });
  if (!r.ok) throw new Error("no keys");
  const json = JSON.stringify(await r.json());
  jwks = { at: Date.now(), issuer, json };
  return json;
}

function cookie(header: string, name: string): string {
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

export async function GET(req: Request) {
  const issuer = clerkIssuer(process.env.CLERK_PUBLISHABLE_KEY || "");
  const emails = list(process.env.STUDIO_ALLOWED_EMAILS);
  const users = list(process.env.STUDIO_ALLOWED_USERS);
  let signedIn = false;
  let userId = "";
  let email = "";
  if (issuer && (emails.length || users.length)) {
    const token = cookie(req.headers.get("cookie") || "", "__session") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token) {
      try {
        const claims = verifySession(token, await keys(issuer), issuer);
        if (claims) {
          signedIn = true;
          userId = claims.sub || "";
          email = typeof claims.email === "string" ? claims.email : "";
        }
      } catch {
        signedIn = false;
      }
    }
  }
  const d = decide({ issuer, emails, users, signedIn, userId, email });
  return new Response(d.status === 204 ? null : d.why, { status: d.status, headers: { "cache-control": "no-store" } });
}
