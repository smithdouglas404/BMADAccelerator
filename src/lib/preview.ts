import { spawn, type ChildProcess } from "child_process";
import { promises as fs, createWriteStream } from "fs";
import path from "path";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { agentServiceConfigured, appAgentEnv } from "@/lib/agentService";

// Each use case's generated app runs on its own port, so it has its own URL.
// Generated apps get a minimal environment, never the accelerator's secrets. The one exception is a
// model key for the app's own AgentKit agents (BACC_APP_LLM: "openai", the default, "anthropic", "gemini" or "off"; set on the Settings page).
export function previewEnv(port: number): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "USER", "SHELL", "LANG", "TZ", "TMPDIR", "CHROMIUM_PATH", "UV_CACHE_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"];
  const env = { PORT: String(port), HOST: "0.0.0.0", HOSTNAME: "0.0.0.0" } as Record<string, string | undefined>;
  for (const k of Object.keys(process.env)) if (k.startsWith("npm_config_")) env[k] = process.env[k];
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  // With the shared agent service, an app's agents run there: the app gets its token (startPreview), no model key.
  if (agentServiceConfigured()) return env as NodeJS.ProcessEnv;
  const llm = (process.env.BACC_APP_LLM || "openai").toLowerCase();
  if (llm === "openai" && process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (llm === "anthropic" && process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (llm === "gemini" && process.env.GEMINI_API_KEY) env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  // The model picked on the Settings page for the app's own agents (AgentKit reads it from AGENT_MODEL).
  if (llm !== "off" && process.env.BACC_APP_MODEL) env.AGENT_MODEL = process.env.BACC_APP_MODEL;
  if (llm !== "off") env.AGENT_PROVIDER = llm;
  return env as NodeJS.ProcessEnv;
}

export const PORT_BASE = Number(process.env.BACC_PREVIEW_PORT_BASE || 4100);
export const PORT_COUNT = process.env.BACC_PREVIEW_PORT_LAST
  ? Number(process.env.BACC_PREVIEW_PORT_LAST) - PORT_BASE + 1
  : Number(process.env.BACC_PREVIEW_PORT_COUNT || 30);

const procs = new Map<string, ChildProcess>();
const starting = new Set<string>();

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function appDir(slug: string) {
  return workspacePath(slug, "app");
}

export async function assignPort(uc: UseCase) {
  if (uc.previewPort) return uc.previewPort;
  const used = new Set((await prisma.useCase.findMany({ select: { previewPort: true } })).map((u) => u.previewPort));
  for (let p = PORT_BASE; p < PORT_BASE + PORT_COUNT; p++) {
    if (!used.has(p)) {
      await prisma.useCase.update({ where: { id: uc.id }, data: { previewPort: p } });
      return p;
    }
  }
  throw new Error("No free preview port. Widen BACC_PREVIEW_PORT_BASE to BACC_PREVIEW_PORT_LAST in .env.");
}

export async function isUp(port: number) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return r.status < 500;
  } catch {
    return false;
  }
}

function runOnce(cmd: string, args: string[], cwd: string, log: NodeJS.WritableStream, env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolve) => {
    const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.pipe(log, { end: false });
    p.stderr.pipe(log, { end: false });
    p.on("close", (code) => resolve(code ?? 1));
    p.on("error", () => resolve(1));
  });
}

// Signals the preview's whole process group: `npm start` runs the real server as a child, and
// killing npm alone leaves that server holding the port.
function killGroup(p: ChildProcess, signal: NodeJS.Signals) {
  try {
    if (p.pid) process.kill(-p.pid, signal);
  } catch {
    p.kill(signal);
  }
}

export async function stopPreview(useCaseId: string) {
  const p = procs.get(useCaseId);
  if (p && p.exitCode === null) {
    killGroup(p, "SIGTERM");
    await new Promise((r) => setTimeout(r, 800));
    if (p.exitCode === null) killGroup(p, "SIGKILL");
  }
  procs.delete(useCaseId);
}

/** Stops any process still listening on the port (a leftover from an earlier build or app restart). */
export async function freePort(port: number) {
  if (process.platform !== "linux") return;
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set<string>();
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    const text = await fs.readFile(f, "utf8").catch(() => "");
    for (const line of text.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      // local_address ends in :PORT, state 0A = LISTEN, column 9 = inode
      if (cols[1]?.endsWith(`:${hex}`) && cols[3] === "0A") inodes.add(cols[9]);
    }
  }
  if (!inodes.size) return;
  for (const pid of await fs.readdir("/proc").catch(() => [] as string[])) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
    const fds = await fs.readdir(`/proc/${pid}/fd`).catch(() => [] as string[]);
    for (const fd of fds) {
      const link = await fs.readlink(`/proc/${pid}/fd/${fd}`).catch(() => "");
      const m = link.match(/^socket:\[(\d+)\]$/);
      if (m && inodes.has(m[1])) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          /* already gone */
        }
        break;
      }
    }
  }
  await new Promise((r) => setTimeout(r, 300));
}

// Starts (or restarts) the generated app: `npm install` + `npm start` with PORT set,
// or a static server when the app is plain HTML.
export async function startPreview(useCaseId: string) {
  if (starting.has(useCaseId)) return;
  starting.add(useCaseId);
  try {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
    const dir = appDir(uc.slug);
    if (!(await exists(dir))) return;
    await stopPreview(useCaseId);
    const port = await assignPort(uc);
    await freePort(port);
    await fs.mkdir(workspacePath(uc.slug, "studio"), { recursive: true });
    const log = createWriteStream(workspacePath(uc.slug, "studio", "preview.log"), { flags: "a" });
    log.on("error", () => {});
    log.write(`\n--- starting preview on ${port} at ${new Date().toISOString()}\n`);
    const env = { ...previewEnv(port), ...(await appAgentEnv(useCaseId).catch(() => ({}))) };
    let child: ChildProcess;
    if (await exists(path.join(dir, "package.json"))) {
      const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
      await runOnce("npm", ["install", "--no-audit", "--no-fund"], dir, log, env);
      if (pkg.scripts?.build && pkg.bacc?.build !== false) await runOnce("npm", ["run", "build"], dir, log, env);
      child = spawn("npm", ["start"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    } else {
      child = spawn(process.execPath, [path.join(process.cwd(), "scripts/static-server.mjs"), dir, String(port)], {
        cwd: dir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    }
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    child.on("exit", (code) => {
      log.write(`--- preview exited with ${code}\n`);
      if (procs.get(useCaseId) === child) procs.delete(useCaseId);
    });
    procs.set(useCaseId, child);
    for (let i = 0; i < 60; i++) {
      if (await isUp(port)) return;
      if (child.exitCode !== null) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    starting.delete(useCaseId);
  }
}

// What the UI needs about the preview; brings a stopped preview back (e.g. after a restart).
export async function syncPreviewState(uc: UseCase) {
  const hasApp = uc.generateCount > 0 && (await exists(path.join(appDir(uc.slug))));
  if (!hasApp || !uc.previewPort) return { hasApp, port: uc.previewPort, running: false, starting: false };
  const running = await isUp(uc.previewPort);
  if (!running && !uc.generateBusy && !procs.has(uc.id) && !starting.has(uc.id)) void startPreview(uc.id);
  return { hasApp, port: uc.previewPort, running, starting: starting.has(uc.id) };
}

/** After the Studio restarts: start the preview of every product that has a built app. */
export async function resumePreviews() {
  if (process.env.BACC_NO_RESUME_PREVIEWS === "1") return;
  const built = await prisma.useCase.findMany({ where: { generateCount: { gt: 0 }, generateBusy: false }, select: { id: true }, orderBy: { updatedAt: "desc" }, take: 29 });
  for (const uc of built) await startPreview(uc.id).catch((e) => console.error("resume preview", uc.id, e));
}
