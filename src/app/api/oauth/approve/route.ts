import { NextResponse } from "next/server";
import { z } from "zod";
import { clientFor, connectCodeOk, issueCode } from "@/lib/connect/oauth";

const Body = z.object({
  client_id: z.string().min(4).max(80),
  redirect_uri: z.string().url(),
  state: z.string().max(500).default(""),
  code_challenge: z.string().min(43).max(128),
  connect_code: z.string().max(20),
  person: z.string().trim().min(1).max(80),
  role: z.string().trim().min(2).max(60),
  customer: z.string().trim().max(120).default(""),
  scope: z.enum(["read", "write", "admin"]),
  deny: z.boolean().optional(),
});

// The consent page's answer. Returns where to send the browser back to the assistant.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Fill in your name, your role and the connect code." }, { status: 400 });
  const b = parsed.data;
  if (!(await clientFor(b.client_id, b.redirect_uri))) return NextResponse.json({ error: "This assistant isn't registered with the Studio." }, { status: 400 });
  const back = new URL(b.redirect_uri);
  if (b.state) back.searchParams.set("state", b.state);
  if (b.deny) {
    back.searchParams.set("error", "access_denied");
    return NextResponse.json({ redirect: back.toString() });
  }
  if (!connectCodeOk(b.connect_code)) return NextResponse.json({ error: "That connect code isn't right or has expired. Make a new one on Settings > Connect." }, { status: 403 });
  back.searchParams.set("code", await issueCode({ clientId: b.client_id, redirectUri: b.redirect_uri, challenge: b.code_challenge, scope: b.scope, customer: b.customer, person: b.person, role: b.role }));
  return NextResponse.json({ redirect: back.toString() });
}
