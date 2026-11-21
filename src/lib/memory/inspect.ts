/**
 * Settings > Agent memory (Doug, Nov 21): every agent, what Letta and Mem0 really hold for it, and a
 * plain-language narrative the document model writes from exactly those records. Read-only.
 * Pure rules are in inspectCore.ts; this file only reads Letta, Mem0 and the Studio's database.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askDocModel } from "@/lib/docAgent";
import { claudeConfigured } from "@/lib/agent/auth";
import { mem0Client, memoryStatus } from "./index";
import * as letta from "./letta";
import { MEM0_USER_ID, ROLES, SHARED_BLOCK_LABEL, memAgentId, roleFor } from "./lettaCore";
import { usageFromEvents, usageFromRuns, verdictFor, type Usage } from "./usageCore";
import { agentsView } from "@/lib/agentService";
import {
  NARRATIVE_MAX_RECORDS,
  checkNarrative,
  factRows,
  filterFacts,
  narrativePrompt,
  personFromLettaName,
  recordsFingerprint,
  refString,
  serviceMemoryScope,
  sourceRecords,
  type AgentRef,
  type Block,
  type Fact,
  type MemorySnapshot,
  type Narrative,
} from "./inspectCore";

export type Filter = { customer?: string; useCaseId?: string };

const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 240);

/** The agents whose memory can be read, from the real registries: Letta's role agents and each product's app agents. */
export async function listAgents(f: Filter) {
  const status = await memoryStatus();
  const useCases = await prisma.useCase.findMany({ where: { archivedAt: null }, select: { id: true, name: true, customer: true }, orderBy: { updatedAt: "desc" } });
  const customers = [...new Set(useCases.map((u) => u.customer.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const inScope = useCases.filter((u) => (!f.useCaseId || u.id === f.useCaseId) && (!f.customer || u.customer.trim().toLowerCase() === f.customer.trim().toLowerCase()));
  const appAgents = await prisma.appAgent.findMany({
    where: { useCaseId: { in: inScope.map((u) => u.id) } },
    select: { key: true, name: true, purpose: true, status: true, persona: true, facts: true, useCaseId: true, updatedAt: true },
    orderBy: [{ useCaseId: "asc" }, { createdAt: "asc" }],
  });
  const ucName = new Map(useCases.map((u) => [u.id, u]));
  // Socra's team: the fixed roles plus every field expert made so far (Claims expert...), each with how much it was used.
  const fieldExperts = status.letta.up ? await letta.domainRoles().catch(() => []) : [];
  const roles = [...ROLES, ...fieldExperts];
  const events = await prisma.memoryEvent.findMany({ where: { role: { in: roles.map((r) => r.key) } }, select: { role: true, kind: true, store: true, count: true, source: true, createdAt: true } });
  const ids = new Map<string, string | null>(status.letta.agents.map((a) => [a.role, a.id]));
  for (const r of fieldExperts) ids.set(r.key, await letta.roleAgentId(r.key));
  const idOf = (key: string) => ids.get(key) ?? null;
  return {
    status,
    customers,
    useCases,
    studio: roles.map((r) => {
      const usage = usageFromEvents(events.filter((e) => e.role === r.key));
      return { ref: refString({ kind: "studio", role: r.key }), name: r.name, title: r.title, lettaAgent: idOf(r.key), mem0Agent: r.memAgentId, usage, verdict: verdictFor(usage, { facts: 0, blocks: 0 }).level };
    }),
    apps: appAgents.map((a) => ({
      ref: refString({ kind: "app", useCaseId: a.useCaseId, key: a.key }),
      name: a.name,
      purpose: a.purpose,
      status: a.status,
      persona: a.persona,
      facts: a.facts,
      useCase: ucName.get(a.useCaseId)?.name ?? "",
      customer: ucName.get(a.useCaseId)?.customer ?? "",
    })),
  };
}

/** Mem0's records for one scope: the whole list, or its semantic search when a query is given. */
async function readFacts(scope: { user_id: string; agent_id: string }, q: string, notes: string[]): Promise<Fact[]> {
  const client = mem0Client();
  if (!client) {
    notes.push("Mem0 is not configured here.");
    return [];
  }
  try {
    if (q.trim()) return factRows(await client.search(q.slice(0, 500), { filters: scope, top_k: 50, threshold: 0 }));
    const rows = factRows(await client.list(scope));
    if (rows.length === 20) notes.push("Mem0 listed 20 records, its default page. Older ones may exist: search finds them.");
    return rows;
  } catch (e) {
    notes.push(`Mem0 could not be read: ${err(e)}`);
    return [];
  }
}

type Mind = { person: string; lettaId: string; lettaName: string; blocks: Block[]; passages: { id: string; text: string; created_at?: string | null }[] };

/** Everything one agent's memory holds now, plus notes on what could not be read. */
export async function readAgentMemory(ref: AgentRef, f: Filter, q = "") {
  const notes: string[] = [];
  let minds: Mind[] = [];
  let facts: Fact[] = [];
  let agentName = "", agentTitle = "", scopeNote = "", useCase: { id: string; name: string; customer: string } | null = null;
  let config: { purpose: string; status: string; personaOn: boolean; factsOn: boolean; personaText: string } | null = null;

  if (ref.kind === "studio") {
    const role = roleFor(ref.role);
    if (!role) return null;
    agentName = role.name;
    agentTitle = role.title;
    scopeNote = "It is one of the Studio's own role agents: its Letta memory is its working mind across every product, and its Mem0 facts come from every product's conversations, decisions and builds.";
    // The shared portfolio block lists every product; with a filter, only those products' lines show.
    const allowed = f.useCaseId || f.customer
      ? new Set((await prisma.useCase.findMany({ where: { ...(f.useCaseId ? { id: f.useCaseId } : {}), ...(f.customer ? { customer: { equals: f.customer, mode: "insensitive" } } : {}) }, select: { id: true } })).map((u) => u.id))
      : null;
    try {
      const m = await letta.roleMind(role.key);
      if (m) {
        const blocks = m.blocks.map((b) => {
          if (!allowed || b.label !== SHARED_BLOCK_LABEL) return b;
          const lines = (b.value ?? "").split("\n");
          const kept = lines.slice(1).filter((l) => allowed.has(l.split(" | ")[0]?.trim()));
          return { ...b, value: [lines[0], ...kept].join("\n") };
        });
        minds = [{ person: "", lettaId: m.id, lettaName: m.name, blocks, passages: m.passages }];
      } else notes.push(letta.lettaConfigured() ? `Letta has no agent named bacc-${role.key} yet.` : "Letta is not configured here.");
    } catch (e) {
      notes.push(`Letta could not be read: ${err(e)}`);
    }
    facts = filterFacts(await readFacts({ user_id: MEM0_USER_ID, agent_id: memAgentId(role.key) }, q, notes), { useCaseId: f.useCaseId, customer: f.useCaseId ? undefined : f.customer });
    if (f.useCaseId || f.customer) scopeNote += ` Only the records for ${f.useCaseId ? "the chosen product" : `customer "${f.customer}"`} are shown.`;
  } else {
    const a = await prisma.appAgent.findUnique({ where: { useCaseId_key: { useCaseId: ref.useCaseId, key: ref.key } }, include: { useCase: { select: { id: true, name: true, customer: true } } } });
    if (!a) return null;
    useCase = a.useCase;
    agentName = a.name;
    agentTitle = `${a.useCase.name}${a.useCase.customer ? ` · ${a.useCase.customer}` : ""}`;
    config = { purpose: a.purpose, status: a.status, personaOn: a.persona, factsOn: a.facts, personaText: a.personaText };
    scopeNote = `It is an agent inside the product "${a.useCase.name}"${a.useCase.customer ? ` for ${a.useCase.customer}` : ""}, run by the shared agent service. Its Letta memory is kept per person it helps; its Mem0 facts are kept to this product only.`;
    try {
      minds = (await letta.serviceMinds(a.useCaseId, a.key)).map((m) => ({ person: personFromLettaName(m.name, a.useCaseId, a.key), lettaId: m.id, lettaName: m.name, blocks: m.blocks, passages: m.passages }));
      if (!minds.length) notes.push(a.persona ? (letta.lettaConfigured() ? "No Letta memory yet: it is made the first time someone uses this agent." : "Letta is not configured here.") : "Its Letta persona is switched off, so it keeps no Letta memory.");
    } catch (e) {
      notes.push(`Letta could not be read: ${err(e)}`);
    }
    facts = filterFacts(await readFacts({ user_id: serviceMemoryScope(a.useCaseId, a.useCase.customer), agent_id: a.key }, q, notes), {});
    if (!facts.length && !q && mem0Client()) notes.push(a.facts ? "No Mem0 facts yet: they are saved as the app uses this agent." : "Its Mem0 memory is switched off.");
  }

  // Who it is first (persona, then the person it remembers), then its working blocks.
  const order = (l: string) => (l === "persona" ? 0 : l === "human" ? 1 : 2);
  for (const m of minds) m.blocks = [...m.blocks].sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label));
  const snapshot: MemorySnapshot = { agentName, agentTitle, scopeNote, letta: minds.map((m) => ({ person: m.person, blocks: m.blocks, passages: m.passages })), facts };
  const records = sourceRecords(snapshot);

  // Is it used? Counted from real events: the Studio's MemoryEvent rows, or a product agent's run steps in the shared service.
  let usage: (Usage & { runs?: number; withPersona?: number }) | null = null;
  let usageNote = "";
  let recent: { at: string; kind: string; store: string; count: number; source: string; detail: string }[] = [];
  if (ref.kind === "studio") {
    const rows = await prisma.memoryEvent.findMany({ where: { role: ref.role, ...(f.useCaseId ? { OR: [{ useCaseId: f.useCaseId }, { useCaseId: "" }] } : {}) }, orderBy: { createdAt: "desc" }, take: 500 });
    usage = usageFromEvents(rows);
    recent = rows.slice(0, 12).map((r) => ({ at: r.createdAt.toISOString(), kind: r.kind, store: r.store, count: r.count, source: r.source, detail: r.detail }));
    const first = await prisma.memoryEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    usageNote = first ? `Counting began ${first.createdAt.toISOString().slice(0, 10)}; reads and writes before that were not recorded.` : "Counting has not recorded anything yet (it began with this version).";
  } else if (useCase) {
    try {
      const v = await agentsView(useCase.id);
      usage = usageFromRuns(v.runs as { agent: string; created_at?: string; steps?: { kind: string; detail: string }[] }[], ref.key);
      usageNote = v.note || `Counted from the shared agent service's last ${(v.runs as unknown[]).length} runs.`;
    } catch (e) {
      usageNote = `Runs could not be read: ${err(e)}`;
    }
  }
  const verdict = usage ? verdictFor(usage, { facts: facts.length, blocks: minds.reduce((n, m) => n + m.blocks.length, 0) }) : null;
  const sleeptime = ref.kind === "studio" ? letta.sleeptimeState() : null;
  return { ref: refString(ref), usage, usageNote, verdict, recent, sleeptime, agentName, agentTitle, scopeNote, useCase, config, minds, facts, records, fingerprint: recordsFingerprint(records), notes };
}

const scopeKey = (f: Filter) => (f.useCaseId ? `uc:${f.useCaseId}` : f.customer ? `customer:${f.customer.trim().toLowerCase()}` : "");

export async function latestNarrative(ref: AgentRef, f: Filter) {
  return prisma.memoryNarrative.findFirst({ where: { agentRef: refString(ref), scope: scopeKey(f) }, orderBy: { createdAt: "desc" } });
}

const NarrativeSchema = z.object({
  headline: z.string(),
  sentences: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })),
  gaps: z.array(z.string()),
});

/** The document model reads the agent's records and explains them; every sentence must cite a record. */
export async function writeNarrative(ref: AgentRef, f: Filter, by: string) {
  const m = await readAgentMemory(ref, f);
  if (!m) return { error: "No such agent" } as const;
  if (!m.records.length) return { error: "This agent has no memory yet, so there is nothing to explain." } as const;
  if (!claudeConfigured()) return { error: "Claude isn't signed in, so the document model can't write the narrative." } as const;
  const started = Date.now();
  const snapshot: MemorySnapshot = { agentName: m.agentName, agentTitle: m.agentTitle, scopeNote: m.scopeNote, letta: m.minds.map((x) => ({ person: x.person, blocks: x.blocks, passages: x.passages })), facts: m.facts };
  const answer = await askDocModel(narrativePrompt(snapshot, m.records), NarrativeSchema, 3000);
  if (!answer) return { error: "The document model didn't answer. Try again in a minute." } as const;
  const { narrative, dropped } = checkNarrative(answer.data as Narrative, m.records.slice(0, NARRATIVE_MAX_RECORDS));
  const used = new Set(narrative.sentences.flatMap((s) => s.cites));
  const row = await prisma.memoryNarrative.create({
    data: {
      agentRef: m.ref,
      scope: scopeKey(f),
      headline: narrative.headline,
      sentences: narrative.sentences,
      gaps: narrative.gaps,
      records: m.records.slice(0, NARRATIVE_MAX_RECORDS).map((r) => ({ cite: r.cite, kind: r.kind, id: r.id, title: r.title, when: r.when, cited: used.has(r.cite) })),
      fingerprint: m.fingerprint,
      model: answer.model,
      auth: answer.auth,
      dropped,
      by,
      ms: Date.now() - started,
    },
  });
  return { narrative: row } as const;
}
