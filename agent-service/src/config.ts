import { z } from "zod";

// What an agent is, as configuration. The Muse (or the product engineer) proposes it, a person approves
// it, and the Studio registers it here. Nothing in this file calls a model or the network.

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, "lowercase letters, digits and dashes");

export const ToolConfig = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
  description: z.string().min(5),
  // Simple JSON-schema-like fields: { claimId: { type: "string", description: "..." } }.
  parameters: z.record(z.string(), z.object({ type: z.enum(["string", "number", "boolean"]), description: z.string().default(""), optional: z.boolean().default(false) })).default({}),
  // An action that changes something a person cares about waits for Approve or Reject first.
  approval: z.boolean().default(false),
});

export const AgentConfig = z.object({
  key: slug,
  name: z.string().min(2).max(80),
  purpose: z.string().min(5),
  instructions: z.string().min(10),
  // Doug's rule (CLAUDE.md, "Agent memory: Mem0 + Letta"): every agent has a Letta persona by default.
  persona: z.object({ enabled: z.boolean().default(true), text: z.string().default("") }).prefault({}),
  model: z.object({ provider: z.enum(["anthropic", "openai", "gemini"]).default("anthropic"), name: z.string().default("") }).prefault({}),
  tools: z.array(ToolConfig).default([]),
  memory: z.object({ facts: z.boolean().default(true) }).prefault({}),
  approvals: z
    .object({
      // A person approves the agent's answer before the app may use it (for anything sent to a customer).
      output: z.boolean().default(false),
      timeoutMinutes: z.number().int().min(1).max(60 * 24 * 14).default(60 * 24),
      onTimeout: z.enum(["reject", "approve"]).default("reject"),
    })
    .prefault({}),
});
export type AgentConfig = z.infer<typeof AgentConfig>;
export type ToolConfig = z.infer<typeof ToolConfig>;

export const UseCaseConfig = z.object({
  customer: z.string().default(""),
  name: z.string().default(""),
  // Where the app takes its actions: POST {callbackUrl}/api/agent-actions/{tool}.
  callbackUrl: z.string().default(""),
});

export function parseAgent(input: unknown): AgentConfig {
  const a = AgentConfig.parse(input);
  if (a.persona.enabled && !a.persona.text.trim()) a.persona.text = `You are ${a.name}. ${a.purpose}`;
  return a;
}

/** One memory space per customer and use case: nothing crosses between them. */
export function memoryScope(useCase: string, customer = "") {
  const c = customer.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${c || "workspace"}:${useCase}`;
}

/** The Letta agent that holds this agent's persona and its memory of one person. */
export function lettaName(useCase: string, key: string, person: string) {
  const p = (person || "anyone").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "anyone";
  return `svc-${useCase}-${key}-${p}`;
}

/** The system prompt an agent runs with: instructions, its persona as Letta keeps it, what it remembers. */
export function systemPrompt(a: AgentConfig, ctx: { persona?: string; human?: string; facts?: string[] }) {
  const parts = [a.instructions.trim()];
  const persona = (ctx.persona ?? (a.persona.enabled ? a.persona.text : "")).trim();
  if (persona) parts.push(`Who you are (your persona; stay in it):\n${persona}`);
  if (ctx.human?.trim()) parts.push(`What you know about the person you are helping:\n${ctx.human.trim()}`);
  if (ctx.facts?.length) parts.push(`Things remembered from earlier (facts, may be dated):\n${ctx.facts.map((f) => `- ${f}`).join("\n")}`);
  parts.push(
    "Suggest, never decide for people: when there are choices, give them as a numbered list and say which you suggest. Never invent facts, people or figures. Actions that need a person's approval wait for it; say so plainly.",
  );
  return parts.join("\n\n");
}

/** Which model key the service needs for a provider. */
export const KEY_FOR: Record<AgentConfig["model"]["provider"], string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };
export const DEFAULT_MODEL: Record<AgentConfig["model"]["provider"], string> = { anthropic: "claude-haiku-5-5", openai: "gpt-5-mini", gemini: "gemini-2.5-flash" };
