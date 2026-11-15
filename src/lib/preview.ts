import { spawn, type ChildProcess } from "child_process";
import { promises as fs, createWriteStream } from "fs";
import path from "path";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";

// Each use case's generated app runs on its own port, so it has its own URL.
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

export async function stopPreview(useCaseId: string) {
  const p = procs.get(useCaseId);
  if (p && p.exitCode === null) {
    p.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 800));
    if (p.exitCode === null) p.kill("SIGKILL");
  }
  procs.delete(useCaseId);
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
    const log = createWriteStream(workspacePath(uc.slug, "bacc", "preview.log"), { flags: "a" });
    log.write(`\n--- starting preview on ${port} at ${new Date().toISOString()}\n`);
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "0.0.0.0", HOSTNAME: "0.0.0.0" };
    delete (env as Record<string, string | undefined>).NODE_ENV;
    delete env.DATABASE_URL;
    delete env.ANTHROPIC_API_KEY;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    delete env.ELEVENLABS_API_KEY;
    let child: ChildProcess;
    if (await exists(path.join(dir, "package.json"))) {
      const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
      await runOnce("npm", ["install", "--no-audit", "--no-fund"], dir, log, env);
      if (pkg.scripts?.build && pkg.bacc?.build !== false) await runOnce("npm", ["run", "build"], dir, log, env);
      child = spawn("npm", ["start"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: false });
    } else {
      child = spawn(process.execPath, [path.join(process.cwd(), "scripts/static-server.mjs"), dir, String(port)], {
        cwd: dir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
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
