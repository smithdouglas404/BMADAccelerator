import { promises as fs } from "fs";
import path from "path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "@/lib/db";
import { WORKSPACES_DIR, workspacePath } from "@/lib/workspace";
import { authEnv, authOrder, claudeConfigured } from "@/lib/agent/auth";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { writeIntake } from "@/lib/provision";

// The bar: given only a few lines about any kind of application, plain Claude Code ships a complete,
// professional product. A control build is plain Claude Code given only the client's
// own idea and documents, with no Studio, no floor and no rules. The Muse then scores both apps
// side by side; whatever the control has that ours lacks goes onto the capability floor.

export type CompareStatus = { state: "idle" | "building" | "judging" | "done" | "failed"; startedAt?: string; finishedAt?: string; error?: string; version?: number };

const SHOT = path.join(process.cwd(), "scripts", "shot.mjs");
const running = new Set<string>();

// Outside the use case's workspace, so none of its skills, CLAUDE.md or documents reach the control.
export const controlDir = (slug: string) => path.join(WORKSPACES_DIR, ".control", slug.replace(/[^a-z0-9-]/gi, ""));
const statusFile = (slug: string) => workspacePath(slug, "studio", "control", "status.json");
export const COMPARISON_FILE = "studio/comparison.md";

export async function compareStatus(slug: string): Promise<CompareStatus> {
  try {
    return JSON.parse(await fs.readFile(statusFile(slug), "utf8"));
  } catch {
    return { state: "idle" };
  }
}

async function setStatus(slug: string, s: CompareStatus) {
  await fs.mkdir(path.dirname(statusFile(slug)), { recursive: true });
  await fs.writeFile(statusFile(slug), JSON.stringify(s, null, 2));
}

export function controlPrompt(idea: string, docs: string[]) {
  return `${idea.trim()}

${docs.length ? `My documents are in \`brief/\`: ${docs.join(", ")}. Read them.\n\n` : ""}Build it as a web app in \`app/\`. It has to run with \`npm install\`, \`npm run build\` and \`npm start\`, listen on \`process.env.PORT\` and host 0.0.0.0, and need no accounts or paid services.

When it works, start it on port 4998 and take screenshots of every main page at desktop and phone size with \`node ${SHOT} http://127.0.0.1:4998 shots / /other-page ...\`, then stop the app.`;
}

export async function runControlBuild(useCaseId: string) {
  if (running.has(useCaseId)) return;
  running.add(useCaseId);
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const startedAt = new Date().toISOString();
  try {
    await setStatus(uc.slug, { state: "building", startedAt, version: uc.generateCount });
    await writeIntake(useCaseId).catch(() => {});
    const dir = controlDir(uc.slug);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(path.join(dir, "brief"), { recursive: true });
    // The owner's own words and documents: the intake and the uploads' text versions. Nothing the Studio wrote.
    const intake = await fs.readFile(workspacePath(uc.slug, "studio", "intake.md"), "utf8").catch(() => "");
    const docs: string[] = [];
    const uploads = await prisma.document.findMany({ where: { useCaseId, NOT: { origin: "studio" } }, select: { fileName: true, textPath: true } });
    for (const d of uploads) {
      if (!d.textPath) continue;
      const name = `${d.fileName.replace(/[^\w.-]+/g, "-").replace(/\.[a-z0-9]+$/i, "")}.md`;
      const ok = await fs.copyFile(d.textPath, path.join(dir, "brief", name)).then(() => true, () => false);
      if (ok) docs.push(name);
    }
    const idea = `I want to build this. Here is what I told my consultants about it:\n\n${intake || `${uc.name}: ${uc.description}`}`;

    if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
      await fs.mkdir(path.join(dir, "shots"), { recursive: true });
      await fs.writeFile(path.join(dir, "app.txt"), "Fake control build");
    } else {
      const auth = authOrder()[0] ?? "key";
      const q = query({
        prompt: controlPrompt(idea, docs),
        options: {
          cwd: dir,
          settingSources: [],
          systemPrompt: { type: "preset", preset: "claude_code" },
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          disallowedTools: ["AskUserQuestion"],
          maxTurns: 400,
          model: process.env.BACC_GENERATE_MODEL || undefined,
          env: authEnv(auth),
          stderr: (d) => console.error("[control]", d.trimEnd()),
        },
      });
      for await (const m of q as AsyncIterable<SDKMessage>) {
        if (m.type === "result" && m.subtype !== "success") throw new Error(`Control build stopped: ${m.subtype}`);
      }
    }
    // Copy the screenshots next to ours, where the Muse reads them.
    const shotsTo = workspacePath(uc.slug, "studio", "control", "shots");
    await fs.rm(shotsTo, { recursive: true, force: true });
    await fs.cp(path.join(dir, "shots"), shotsTo, { recursive: true }).catch(() => {});
    await setStatus(uc.slug, { state: "judging", startedAt, version: uc.generateCount });
    if (agentsEnabled()) await enqueue(useCaseId, "compare", judgePrompt(uc.generateCount, controlDir(uc.slug)));
  } catch (e) {
    console.error("control build", e);
    await setStatus(uc.slug, { state: "failed", startedAt, finishedAt: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  } finally {
    running.delete(useCaseId);
  }
}

export function judgePrompt(version: number, control: string) {
  return `A control build has finished: plain Claude Code, given only the owner's own words and uploads, with no Studio, no floor and no rules, built its own version of this product in \`${control}/app\` with screenshots in \`studio/control/shots/\`. Ours is version ${version}, with screenshots in \`studio/shots/\`.

As the owner's expert, judge the two honestly, side by side:
1. Open every screenshot of both with Read, and read both apps' source where it helps.
2. Write \`${COMPARISON_FILE}\` with: a table scoring both from 0 to 5 on completeness against the category's three leading products, visual quality, imagery, trust and professionalism, the main journey working end to end, phone layout, the owner's own decisions, and originality; a total for each; "What the control has that ours lacks" (each a line); "What ours has that the control lacks"; and a one-line verdict. Mark it "Ours meets the bar" only if ours scores at least as high in every row.
3. Add every feature from "What the control has that ours lacks" to the right capability's floor with mcp__studio__set_capability as an [assumed] item (or [out] with the owner's words if they said no to it before). That's the floor rising: the next build picks them up.
4. Write "## Done" with today's date at the end of the comparison file, then tell the owner in two or three plain sentences: the totals, the biggest gap, and that the gaps are now on the capability floor.`;
}

// Called when the Muse finishes judging (it writes "## Done" in the comparison).
export async function settleCompare(slug: string) {
  const s = await compareStatus(slug);
  if (s.state !== "judging") return s;
  const doc = await fs.readFile(workspacePath(slug, COMPARISON_FILE), "utf8").catch(() => "");
  if (!/^##\s+Done/im.test(doc)) return s;
  const done: CompareStatus = { ...s, state: "done", finishedAt: new Date().toISOString() };
  await setStatus(slug, done);
  return done;
}
