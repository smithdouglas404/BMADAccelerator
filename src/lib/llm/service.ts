import { prisma } from "@/lib/db";
import { agentServiceConfigured } from "@/lib/agentService";
import { recordCall } from "@/lib/llm/ledger";

// The shared agent service (agent-service/) makes model calls of its own: each product agent's thinking, Letta persona runs and
// Mem0 memory. It notes them in its own database; this reads the new ones into the Studio's ledger, once each, in order.

type Row = { seq: string; id: string; use_case: string; run: string; agent: string; kind: string; purpose: string; provider: string; model: string; input_tokens: number; output_tokens: number; cache_tokens: number; estimated: boolean; ok: boolean; error: string; ms: number; at: string };

let pulling = false;

/** Reads what the agent service has noted since the last read. Returns how many calls were added. Never throws. */
export async function pullServiceUsage(): Promise<number> {
  if (pulling || !agentServiceConfigured()) return 0;
  pulling = true;
  let added = 0;
  try {
    const base = (process.env.AGENT_SERVICE_URL ?? "").replace(/\/+$/, "");
    for (let page = 0; page < 20; page++) {
      const last = await prisma.llmUsage.aggregate({ _max: { extSeq: true }, where: { externalId: { startsWith: "svc_" } } });
      const res = await fetch(`${base}/v1/admin/usage?after=${last._max.extSeq ?? 0}&limit=500`, { headers: { "X-Admin-Key": process.env.AGENT_SERVICE_ADMIN_KEY ?? "" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;
      const { rows } = (await res.json()) as { rows: Row[] };
      if (!rows.length) break;
      const known = new Set((await prisma.llmUsage.findMany({ where: { externalId: { in: rows.map((r) => r.id) } }, select: { externalId: true } })).map((r) => r.externalId));
      for (const r of rows) {
        if (known.has(r.id)) continue;
        const row = await recordCall(
          { agent: r.kind === "agent" ? `Agent · ${r.agent}` : r.kind === "letta" ? `Letta · ${r.agent}` : `Mem0 · ${r.agent}`, kind: r.kind === "agent" ? "agent" : r.kind, purpose: r.purpose, provider: r.provider, model: r.model, input: r.input_tokens, output: r.output_tokens, cache: r.cache_tokens, ms: r.ms, ok: r.ok, error: r.error },
          { useCaseId: r.use_case, turnId: r.run },
          { estimated: r.estimated, externalId: r.id, at: new Date(r.at) },
        );
        if (row) {
          await prisma.llmUsage.update({ where: { id: row.id }, data: { extSeq: Number(r.seq) } });
          added++;
        }
      }
      if (rows.length < 500) break;
    }
  } catch (e) {
    console.warn("agent service usage not read", e instanceof Error ? e.message : e);
  } finally {
    pulling = false;
  }
  return added;
}
