import { NextRequest, NextResponse } from "next/server";
import { clearLink, getLink, health, listAgents, login, note, publicLink, saveLink, spend } from "@/lib/nasiko/client";
import { allSpecs } from "@/lib/nasiko/agents";
import { listConnectors } from "@/lib/nasiko/mcp";

export const dynamic = "force-dynamic";

// Settings > Nasiko. Everything is read from the real Nasiko server and the Studio's own records; nothing is
// faked when Nasiko is away: the card says what it could not reach. The password never leaves the server.
export async function GET() {
  const link = await getLink();
  const out: Record<string, unknown> = { link: publicLink(link), health: null, signedIn: false, agents: [], spend: null, studioAgents: [], mcp: [], problem: "" };
  out.studioAgents = (await allSpecs()).map((s) => ({ name: s.name, displayName: s.displayName, kind: s.kind, product: s.useCaseName ?? "", description: s.description }));
  if (!link.url) return NextResponse.json(out);
  out.health = await health(link.url);
  if (!link.enabled || !(out.health as { reachable: boolean }).reachable || !link.username || !link.cipher) return NextResponse.json(out);
  const agents = await listAgents();
  if (!agents.ok) {
    out.problem = agents.error;
    return NextResponse.json(out);
  }
  out.signedIn = true;
  out.agents = agents.body.filter((a) => a.name.startsWith("studio-")).map((a) => ({ id: a.id, name: a.name, displayName: a.display_name || a.name, status: a.status, version: a.version }));
  out.mcp = (await listConnectors()).connectors;
  const s = await spend("7d");
  out.spend = s.ok ? s.body : null;
  return NextResponse.json(out);
}

export async function PUT(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { url?: string; username?: string; password?: string; enabled?: boolean };
  try {
    await saveLink({ url: b.url, username: b.username, password: b.password, enabled: b.enabled });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  // Prove the sign-in right away, so a wrong password is said here and not on the next page load.
  const link = await getLink();
  const why = link.url && link.username && link.cipher ? await login() : "Add the address, the user name and the password, then try again.";
  await note(why);
  return NextResponse.json({ link: publicLink(await getLink()), signIn: why || "ok" });
}

export async function DELETE() {
  await clearLink();
  return NextResponse.json({ ok: true });
}
