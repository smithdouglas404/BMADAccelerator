// What the Settings page's "Models and keys" offers, and the checks on it.
// Kept free of imports so it can be tested on its own (tests/settings.test.mjs).
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export type Provider = "anthropic" | "openai" | "gemini";

export const PROVIDERS: { id: Provider; name: string; env: string; models: string[]; console: string }[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    env: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
    console: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    env: "OPENAI_API_KEY",
    models: ["gpt-5", "gpt-5-mini", "gpt-image-2", "gpt-image-1"],
    console: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    env: "GEMINI_API_KEY",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    console: "https://aistudio.google.com/app/apikey",
  },
];

/** Other services' keys the accelerator reads from the environment. */
export const OTHER_KEYS: { env: string; name: string }[] = [
  { env: "ELEVENLABS_API_KEY", name: "ElevenLabs (voice)" },
  { env: "LINEAR_API_KEY", name: "Linear (tracker)" },
  { env: "TYPESAFE_API_KEY", name: "TypeSafe (Jev: typed yes/no, choice and score answers)" },
  { env: "GITHUB_TOKEN", name: "GitHub (push the pilot to your repository)" },
  { env: "SMTP_URL", name: "Email sending (SMTP, for notifications: smtps://user:app-password@smtp.example.com:465)" },
];

export type Role = {
  env: string;
  label: string;
  note: string;
  providers: Provider[];
  fallback: string;
  /** Letta names models "provider/model". */
  letta?: boolean;
};

export const ROLES: Role[] = [
  {
    env: "BACC_MODEL",
    label: "Socra and its team",
    note: "Runs on your Claude plan first; the Anthropic key is the backup. Claude models only.",
    providers: ["anthropic"],
    fallback: "claude-sonnet-5-5",
  },
  {
    env: "BACC_GENERATE_MODEL",
    label: "Claude Code (builds the pilot)",
    note: "Same as Socra unless you pick one. Claude models only.",
    providers: ["anthropic"],
    fallback: "",
  },
  {
    env: "BACC_DOC_MODEL",
    label: "Document reader",
    note: "Reads and tags uploads. A low-cost model is enough. Claude models only.",
    providers: ["anthropic"],
    fallback: "claude-haiku-5-5",
  },
  {
    env: "BACC_IMAGE_MODEL",
    label: "Pictures",
    note: "Product pictures Claude Code asks for. OpenAI image models.",
    providers: ["openai"],
    fallback: "gpt-image-2",
  },
  {
    env: "BACC_LETTA_MODEL",
    label: "Agent memory (Letta)",
    note: "Letta runs in its own container and reads its keys from .env when it starts.",
    providers: ["anthropic", "openai", "gemini"],
    fallback: "anthropic/claude-haiku-5-5",
    letta: true,
  },
  {
    env: "BACC_APP_MODEL",
    label: "AI agents inside generated apps",
    note: "The one key a generated app gets, for its own AgentKit agents. Pick “Off” for demo mode.",
    providers: ["anthropic", "openai", "gemini"],
    fallback: "",
  },
];

export const KEY_NAMES = [...PROVIDERS.map((p) => p.env), ...OTHER_KEYS.map((k) => k.env)];

export function providerOf(model: string): Provider | null {
  const m = model.toLowerCase().replace(/^google_ai\//, "gemini/");
  const bare = m.includes("/") ? m.split("/")[0] : m;
  if (bare === "anthropic" || m.startsWith("claude")) return "anthropic";
  if (bare === "openai" || /^(gpt|o\d|chatgpt|dall-e)/.test(m)) return "openai";
  if (bare === "gemini" || m.startsWith("gemini")) return "gemini";
  return null;
}

/** Letta's handle for a model: "anthropic/…", "openai/…" or "google_ai/…". */
export function lettaHandle(model: string): string {
  if (model.includes("/")) return model;
  const p = providerOf(model);
  return p === "gemini" ? `google_ai/${model}` : p ? `${p}/${model}` : model;
}

/** Why a model can't do a job, or "" when it can. The Claude plan covers the Claude-only jobs. */
export function modelProblem(role: Role, model: string, keyFor: (p: Provider) => boolean, claudePlan: boolean): string {
  if (role.env === "BACC_APP_MODEL" && model === "off") return "";
  const p = providerOf(model);
  if (!p || !role.providers.includes(p)) {
    const names = role.providers.map((x) => PROVIDERS.find((y) => y.id === x)!.name).join(", ");
    return `${role.label} can use ${names} models only`;
  }
  const planCovers = p === "anthropic" && role.providers.length === 1 && claudePlan;
  if (!keyFor(p) && !planCovers) return `Add the ${PROVIDERS.find((y) => y.id === p)!.name} key first`;
  return "";
}

export function encryptWith(secret: Buffer, value: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret, iv);
  const body = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decryptWith(secret: Buffer, cipher: string): string {
  const [iv, tag, body] = cipher.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", secret, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
