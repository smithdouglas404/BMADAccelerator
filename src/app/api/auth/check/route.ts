import { createClerkClient } from "@clerk/backend";
import { allowedEmails, decide } from "@/lib/studioAuth";

export const dynamic = "force-dynamic";

// Asked by the public door (nginx auth_request) for every page that is not the connector.
// 204 lets it through; 401 sends the visitor to the sign-in page; anything else is a plain refusal.
export async function GET(req: Request) {
  const secretKey = process.env.CLERK_SECRET_KEY || "";
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || "";
  const allowed = allowedEmails(process.env.STUDIO_ALLOWED_EMAILS);
  let signedIn = false;
  let emails: string[] = [];
  if (secretKey && publishableKey && allowed.length) {
    try {
      const clerk = createClerkClient({ secretKey, publishableKey });
      const state = await clerk.authenticateRequest(req, { publishableKey, secretKey });
      const userId = state.isSignedIn ? state.toAuth()?.userId : null;
      if (userId) {
        signedIn = true;
        const user = await clerk.users.getUser(userId);
        emails = user.emailAddresses.filter((a) => a.verification?.status === "verified").map((a) => a.emailAddress);
      }
    } catch {
      signedIn = false;
    }
  }
  const d = decide({ hasKeys: !!(secretKey && publishableKey), allowed, signedIn, emails });
  return new Response(d.status === 204 ? null : d.why, { status: d.status, headers: { "cache-control": "no-store" } });
}
