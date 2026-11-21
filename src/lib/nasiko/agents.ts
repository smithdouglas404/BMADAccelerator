import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { STUDIO_TEAM } from "@/lib/agent/team";
import { SPECIALISTS } from "@/lib/studio/core";
import { ASSISTANT_NAME } from "@/lib/brand";
import { frontmatterOf } from "@/lib/skillLibrary";
import { STUDIO_SKILLS_DIR } from "@/lib/provision";
import { agentName, registrationBody, slug, type AgentSpec } from "@/lib/nasiko/core";
import { getLink, listAgents, nasiko } from "@/lib/nasiko/client";

// Which agents the Studio has, read from its real records: Socra and every specialist in the team definitions
// (with each one's own skill file), the domain experts each product's conversation actually named, and the
// agents a product's people approved. Nothing here is typed in by hand.

async function skillText(name: string) {
  const md = await fs.readFile(path.join(STUDIO_SKILLS_DIR, name, "SKILL.md"), "utf8").catch(() => "");
  return frontmatterOf(md);
}

const specialistSkill = (agentKey: string) => SPECIALISTS.find((s) => s.agent === agentKey);

/** The agents that are the same for every product. */
export async function teamSpecs(): Promise<AgentSpec[]> {
  const muse = await skillText("studio-muse");
  const out: AgentSpec[] = [
    {
      name: agentName("team", "socra"),
      displayName: ASSISTANT_NAME,
      description: muse.description || `${ASSISTANT_NAME} leads the conversation with the product owner.`,
      skills: [{ id: "studio-muse", name: "studio-muse", description: muse.description, tags: ["working-backwards", "prfaq", "requirements"] }],
      tags: ["working-backwards-studio", "team", "lead"],
      kind: "team",
      key: "socra",
    },
  ];
  for (const [key, def] of Object.entries(STUDIO_TEAM)) {
    const sp = specialistSkill(key);
    const sk = sp ? await skillText(sp.skill) : { description: "" };
    out.push({
      name: agentName("team", key),
      displayName: sp?.name ?? key.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
      description: def.description,
      skills: sp ? [{ id: sp.skill, name: sp.skill, description: sk.description || sp.focus, tags: [sp.key, "specialist"] }] : [],
      tags: ["working-backwards-studio", "team", sp ? "specialist" : "research"],
      kind: "team",
      key: sp?.key ?? key,
    });
  }
  return out;
}

/** The domain experts named in each product's conversation (a "Claims expert", a "Clinical expert"), and its approved product agents. */
export async function productSpecs(): Promise<AgentSpec[]> {
  const out: AgentSpec[] = [];
  const ucs = await prisma.useCase.findMany({ where: { archivedAt: null }, select: { id: true, slug: true, name: true } });
  const expertSkill = await skillText("studio-domain-expert");
  for (const uc of ucs) {
    const said = await prisma.message.findMany({ where: { useCaseId: uc.id, role: "agent", addressed: "domain" }, select: { agent: true }, distinct: ["agent"] });
    for (const m of said) {
      const title = m.agent.replace(/\s*·\s*Specialist\s*$/i, "").trim();
      if (!title) continue;
      out.push({
        name: agentName("product", title, uc.slug),
        displayName: `${title} (${uc.name})`,
        description: `${title} on ${uc.name}: ${expertSkill.description}`,
        skills: [{ id: "studio-domain-expert", name: "studio-domain-expert", description: expertSkill.description, tags: ["domain", slug(title)] }],
        tags: ["working-backwards-studio", "team", "domain-expert", slug(uc.slug, 40)],
        kind: "team",
        key: `domain:${title}`,
        useCaseId: uc.id,
        useCaseName: uc.name,
      });
    }
    const apps = await prisma.appAgent.findMany({ where: { useCaseId: uc.id, status: "approved" } });
    for (const a of apps) {
      const tools = (Array.isArray(a.tools) ? a.tools : []) as { name?: string; description?: string }[];
      out.push({
        name: agentName("product", a.key, uc.slug),
        displayName: `${a.name} (${uc.name})`,
        description: a.purpose || a.name,
        skills: tools.filter((t) => t?.name).map((t) => ({ id: slug(String(t.name)), name: String(t.name), description: String(t.description ?? ""), tags: ["tool"] })),
        tags: ["working-backwards-studio", "product-agent", slug(uc.slug, 40)],
        kind: "product",
        key: a.key,
        useCaseId: uc.id,
        useCaseName: uc.name,
      });
    }
  }
  return out;
}

export const allSpecs = async () => [...(await teamSpecs()), ...(await productSpecs())];

export async function specByName(name: string) {
  return (await allSpecs()).find((s) => s.name === name) ?? null;
}

/** The address Nasiko reaches the Studio at. From its own container this is the host's name for the Studio's port. */
export function studioBaseForNasiko() {
  return (process.env.NASIKO_STUDIO_URL || "http://host.docker.internal:3000").replace(/\/+$/, "");
}

export type SyncResult = { ok: boolean; created: number; updated: number; failed: { name: string; why: string }[]; total: number; note: string };

/** Registers every Studio agent in Nasiko's catalog by its address; updates the ones already there. Safe to run again. */
export async function syncToNasiko(): Promise<SyncResult> {
  const specs = await allSpecs();
  const base = studioBaseForNasiko();
  const existing = await listAgents();
  if (!existing.ok) return { ok: false, created: 0, updated: 0, failed: [], total: specs.length, note: existing.error };
  const byName = new Map(existing.body.map((a) => [a.name, a]));
  let created = 0;
  let updated = 0;
  const failed: { name: string; why: string }[] = [];
  for (const s of specs) {
    const body = registrationBody(s, base);
    const have = byName.get(s.name);
    const r = have
      ? await nasiko("PUT", `/api/agents/${have.id}`, { display_name: body.display_name, description: body.description, url: body.url, version: body.version, capabilities: body.capabilities, skills: body.skills, tags: body.tags, metadata: body.metadata })
      : await nasiko("POST", "/api/agents", body);
    if (r.ok) { if (have) updated++; else created++; }
    else failed.push({ name: s.name, why: r.error });
  }
  await prisma.nasikoLink.update({ where: { id: "global" }, data: { syncedAt: new Date() } });
  const l = await getLink();
  return { ok: failed.length === 0, created, updated, failed, total: specs.length, note: failed.length ? `${failed.length} of ${specs.length} could not be registered. First: ${failed[0].why}` : `${specs.length} agents registered in Nasiko at ${l.url}.` };
}
