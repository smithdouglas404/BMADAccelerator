/**
 * Labelling contract for agent memory. Copied from Capability-Economics-Guide lib/agent-memory
 * (INN-134, memory-pattern/README.md 4.3-4.4); only the app id differs.
 * Every memory is written with the same labels so any agent can find it again.
 */

export const APP_IDS = ["bmad-accelerator"] as const;
export type AppId = (typeof APP_IDS)[number];

export const MEMORY_KINDS = [
  "fact",
  "decision",
  "qa",
  "lesson",
  "requirement",
  "run_summary",
  "discussion",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Kinds stored verbatim (infer=false): the text is already distilled and must not be re-extracted. */
export const VERBATIM_KINDS: ReadonlySet<MemoryKind> = new Set<MemoryKind>([
  "decision",
  "qa",
  "requirement",
]);

export interface MemoryScope {
  appId: AppId;
  /** The agent that owns or wrote the memory, e.g. "bmad-architect" or "cvi-agent". */
  agentId: string;
  userId?: string;
  runId?: string;
}

export interface MemoryMetadata {
  kind: MemoryKind;
  role?: string;
  source?: string;
  /** 0..1 */
  confidence?: number;
  /** Extra labels a caller needs to find its own memories again (e.g. a section key and hash). */
  [extra: string]: unknown;
}

export interface RememberInput {
  text: string;
  scope: MemoryScope;
  metadata: MemoryMetadata;
  /** ISO date (YYYY-MM-DD). Required when kind is "fact" (research facts go stale). */
  expirationDate?: string;
}

export class ContractError extends Error {}

/** Validate a write against the contract. Returns the problem, or null when fine. */
export function checkRemember(input: RememberInput): string | null {
  if (!input.text || !input.text.trim()) return "text is empty";
  if (!APP_IDS.includes(input.scope.appId)) return `unknown app_id ${input.scope.appId}`;
  if (!input.scope.agentId) return "agent_id is required";
  if (!MEMORY_KINDS.includes(input.metadata.kind)) return `unknown kind ${input.metadata.kind}`;
  const c = input.metadata.confidence;
  if (c !== undefined && (Number.isNaN(c) || c < 0 || c > 1)) return "confidence must be between 0 and 1";
  if (input.metadata.kind === "fact") {
    if (!input.expirationDate) return "expiration_date is required for research facts";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expirationDate)) return "expiration_date must be YYYY-MM-DD";
    const d = new Date(`${input.expirationDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.expirationDate)
      return "expiration_date is not a real date";
    if (d.getTime() < Date.now() - 86_400_000) return "expiration_date is in the past";
  }
  return null;
}
