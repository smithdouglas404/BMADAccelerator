/**
 * How Claude Code (Socra and its team, Generate and the document agent) signs in.
 *
 * - "plan": the owner's Claude subscription (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
 * - "key": the Anthropic API key, billed per use.
 *
 * BACC_CLAUDE_AUTH picks the order: "plan-then-key" (the default when a plan token is set: use the
 * plan, and switch to the key when the plan's usage limit is reached), "plan" (plan only, wait for
 * the limit to reset), or "key". A subscription is personal: it suits a tool only its owner uses.
 */
export type Auth = "plan" | "key";

const hasPlan = () => Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

export function authOrder(): Auth[] {
  const mode = process.env.BACC_CLAUDE_AUTH || (hasPlan() ? "plan-then-key" : "key");
  const order: Auth[] = mode === "key" ? ["key"] : mode === "plan" ? ["plan"] : ["plan", "key"];
  return order.filter((a) => (a === "plan" ? hasPlan() : hasKey()));
}

export const claudeConfigured = () => authOrder().length > 0;

/** The environment for a Claude Code run that signs in one way only. */
export function authEnv(auth: Auth): Record<string, string> {
  const env = { ...process.env, IS_SANDBOX: "1" } as Record<string, string>;
  // Keys the agents never need: images go through the make_image tool, memory through the app.
  delete env.OPENAI_API_KEY;
  delete env.ELEVENLABS_API_KEY;
  delete env.GEMINI_API_KEY;
  for (const k of ["DATABASE_URL", "LINEAR_API_KEY", "JIRA_API_TOKEN", "MEM0_API_KEY", "LETTA_API_KEY", "SMTP_URL", "ECC_GITHUB_TOKEN", "TYPESAFE_API_KEY"]) delete env[k];
  if (auth === "plan") delete env.ANTHROPIC_API_KEY;
  else delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

/** Thrown when the plan's usage limit (or the API key's credit) stops a run. */
export class LimitError extends Error {
  constructor(
    message: string,
    readonly sessionId: string,
    readonly resetsAt?: number,
  ) {
    super(message);
  }
}

export function limitMessage(auth: Auth, resetsAt?: number): string {
  if (auth === "key") return "The Anthropic API credit ran out. Add credit at console.anthropic.com > Billing, then retry.";
  const when = resetsAt ? ` It resets at ${new Date(resetsAt * 1000).toLocaleString("en-US", { timeZone: process.env.TZ || "America/New_York" })}.` : "";
  return `Your Claude plan's usage limit is reached.${when} Retry after that, or add an API key to keep going.`;
}
