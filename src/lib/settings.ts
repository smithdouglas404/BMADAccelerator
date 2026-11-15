import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { WORKSPACES_DIR } from "@/lib/workspace";
import { decryptWith, encryptWith, KEY_NAMES, lettaHandle, modelProblem, OTHER_KEYS, PROVIDERS, providerOf, ROLES, type Provider } from "@/lib/settingsCatalog";

/**
 * Keys and models chosen on the Settings page ("Models and keys").
 *
 * The page stores each key encrypted in the database and each model choice as a row. At start-up
 * (src/instrumentation.ts) and after every save, they are copied into this server's process.env,
 * so every existing reader (the agents, Generate, pictures, previews) picks them up with no restart.
 * A value saved here wins over the same name in .env; removing it falls back to .env.
 *
 * Keys never leave the server: the page only ever sees whether a key is set and its last four characters.
 */

export * from "@/lib/settingsCatalog";

// ---- encryption ----

let cachedSecret: Buffer | null = null;

async function secret(): Promise<Buffer> {
  if (cachedSecret) return cachedSecret;
  let raw = process.env.BACC_SECRET || "";
  if (!raw) {
    const file = path.join(WORKSPACES_DIR, ".bacc-secret");
    raw = await fs.readFile(file, "utf8").catch(() => "");
    if (!raw) {
      raw = randomBytes(32).toString("hex");
      await fs.mkdir(WORKSPACES_DIR, { recursive: true });
      await fs.writeFile(file, raw, { mode: 0o600 });
    }
  }
  cachedSecret = createHash("sha256").update(raw.trim()).digest();
  return cachedSecret;
}

export async function encrypt(value: string): Promise<string> {
  return encryptWith(await secret(), value);
}

export async function decrypt(cipher: string): Promise<string> {
  return decryptWith(await secret(), cipher);
}

// ---- applying to the running server ----

/** What .env gave this process for each name, before anything saved here replaced it. */
const fromDotEnv = new Map<string, string | undefined>();

function remember(name: string) {
  if (!fromDotEnv.has(name)) fromDotEnv.set(name, process.env[name]);
}

function setEnv(name: string, value: string | undefined) {
  remember(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** The generated app's provider follows its model (BACC_APP_LLM is read by previewEnv). */
function applyAppModel(model: string | undefined) {
  if (model === undefined) {
    setEnv("BACC_APP_MODEL", fromDotEnv.get("BACC_APP_MODEL"));
    setEnv("BACC_APP_LLM", fromDotEnv.get("BACC_APP_LLM"));
    return;
  }
  if (model === "off") {
    setEnv("BACC_APP_MODEL", undefined);
    setEnv("BACC_APP_LLM", "off");
    return;
  }
  setEnv("BACC_APP_MODEL", model);
  setEnv("BACC_APP_LLM", providerOf(model) ?? "openai");
}

let loaded = false;

/** Copies saved keys and models into process.env. Called at start-up; safe to call again. */
export async function loadSettingsIntoEnv(force = false) {
  if (loaded && !force) return;
  loaded = true;
  for (const n of [...KEY_NAMES, ...ROLES.map((r) => r.env), "BACC_APP_LLM"]) remember(n);
  try {
    for (const k of await prisma.storedKey.findMany()) {
      try {
        setEnv(k.name, await decrypt(k.cipher));
      } catch {
        console.error(`[settings] could not decrypt the saved ${k.name}; using .env instead`);
      }
    }
    for (const m of await prisma.modelChoice.findMany()) {
      if (m.role === "BACC_APP_MODEL") applyAppModel(m.model);
      else setEnv(m.role, m.model);
    }
  } catch (e) {
    console.error("[settings] could not load saved keys and models:", (e as Error).message);
  }
}

// ---- the page ----

export type KeyStatus = { env: string; name: string; source: "saved" | "env" | "missing"; last4: string };

export async function settingsStatus() {
  const saved = new Map((await prisma.storedKey.findMany()).map((k) => [k.name, k.last4]));
  const keyStatus = (env: string, name: string): KeyStatus => {
    if (saved.has(env)) return { env, name, source: "saved", last4: saved.get(env)! };
    const v = fromDotEnv.has(env) ? fromDotEnv.get(env) : process.env[env];
    return v ? { env, name, source: "env", last4: v.slice(-4) } : { env, name, source: "missing", last4: "" };
  };
  const choices = new Map((await prisma.modelChoice.findMany()).map((m) => [m.role, m.model]));
  return {
    providers: PROVIDERS.map((p) => ({ ...keyStatus(p.env, p.name), id: p.id, models: p.models, console: p.console })),
    other: OTHER_KEYS.map((k) => keyStatus(k.env, k.name)),
    claudePlan: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN),
    roles: ROLES.map((r) => {
      const saved = choices.get(r.env);
      const current =
        r.env === "BACC_APP_MODEL"
          ? saved ?? (process.env.BACC_APP_LLM === "off" ? "off" : process.env.BACC_APP_MODEL || "")
          : saved ?? (process.env[r.env] || r.fallback);
      return { ...r, current, saved: saved !== undefined };
    }),
  };
}

export function hasKey(p: Provider) {
  return Boolean(process.env[PROVIDERS.find((x) => x.id === p)!.env]);
}

export async function saveKey(env: string, value: string) {
  if (!KEY_NAMES.includes(env)) throw new Error("Unknown key");
  const v = value.trim();
  if (v.length < 8 || /\s/.test(v)) throw new Error("That doesn't look like a key");
  const cipher = await encrypt(v);
  await prisma.storedKey.upsert({ where: { name: env }, create: { name: env, cipher, last4: v.slice(-4) }, update: { cipher, last4: v.slice(-4) } });
  setEnv(env, v);
}

export async function removeKey(env: string) {
  if (!KEY_NAMES.includes(env)) throw new Error("Unknown key");
  await prisma.storedKey.deleteMany({ where: { name: env } });
  setEnv(env, fromDotEnv.get(env));
}

/** Saves a model for a role. A model needs its provider's key (the Claude plan counts for Claude roles). */
export async function saveModel(roleEnv: string, model: string | null) {
  const role = ROLES.find((r) => r.env === roleEnv);
  if (!role) throw new Error("Unknown role");
  if (model === null) {
    await prisma.modelChoice.deleteMany({ where: { role: roleEnv } });
    if (roleEnv === "BACC_APP_MODEL") applyAppModel(undefined);
    else setEnv(roleEnv, fromDotEnv.get(roleEnv));
    return;
  }
  let m = model.trim();
  if (!m || m.length > 100 || /\s/.test(m)) throw new Error("Pick a model");
  const problem = modelProblem(role, m, hasKey, Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN));
  if (problem) throw new Error(problem);
  if (role.letta && m !== "off") m = lettaHandle(m);
  await prisma.modelChoice.upsert({ where: { role: roleEnv }, create: { role: roleEnv, model: m }, update: { model: m } });
  if (roleEnv === "BACC_APP_MODEL") applyAppModel(m);
  else setEnv(roleEnv, m);
  if (role.letta) (await import("@/lib/memory/letta")).resetLetta();
}
