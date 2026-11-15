import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { claudeConfigured } from "@/lib/agent/auth";
import { onAppGenerated } from "@/lib/memory";
import { workspacePath } from "@/lib/workspace";
import { provisionWorkspace, writeIntake } from "@/lib/provision";
import { appDir, assignPort, startPreview, stopPreview } from "@/lib/preview";
import { enqueue, runSdkTurn, agentsEnabled } from "@/lib/agent/runner";
import type { RunTally } from "@/lib/agent/tools";

const run = promisify(execFile);
const busy = new Set<string>();

async function changedDocs(uc: UseCase) {
  const root = workspacePath(uc.slug, "_bmad-output");
  const since = uc.lastGeneratedAt?.getTime() ?? 0;
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".md") || e.name.endsWith(".toml")) {
        if ((await fs.stat(p)).mtimeMs > since) out.push(path.relative(workspacePath(uc.slug), p));
      }
    }
  }
  await walk(root);
  return out.filter((p) => !p.includes(`${path.sep}generate${path.sep}`));
}

const GENERATOR_RULES = `You are the Generate step of the BMAD Accelerator: Claude Code building a working pilot app, Replit style, from wherever the BMAD planning stands right now.

Rules:
- Build the app in the folder \`app/\` at the project root. Nothing else in the project is yours to change, except the notes file named in the task.
- Read the BMAD documents in \`_bmad-output/\` (brief, PRFAQ, PRD, UX DESIGN.md and EXPERIENCE.md, architecture, the ticket tree) and the client's intake in \`bacc/intake.md\`. Build what they describe as far as they go. Where they are silent, make a sensible, simple choice and write it down in the notes as an assumption.
- The app must run with no outside services or accounts: \`npm install\` then \`npm start\`, listening on \`process.env.PORT\` and host 0.0.0.0. Use SQLite or files for data. Seed the catalogue and content (products, pages, prices) with realistic sample data, but never invent people: no made-up customers, orders, sign-ups, reviews or contact details. Lists of those start empty, with a friendly empty state. A plain \`index.html\` with no package.json is also fine for a static app. Keep the dependency list small.
- Verify it: start it on a spare port (for example 4999), fetch its main page with curl, then stop it. Fix anything that fails.
- Make it look finished and polished: clear layout, real copy, responsive.
- Use names, prices, formats, years and wording exactly as the documents give them (for example a serial-number format with a year). Where a document marks content as a placeholder, label it as sample content in the app.
- Use the \`bacc\` tools to talk to the client: \`mcp__bacc__say\` with agent \`generator\`, two or three short sentences, plain words. Plain text you write is not shown.`;

function generatePrompt(uc: UseCase, notesPath: string, docs: string[], feedback: { comment: string; imagePath: string; pageUrl: string }[]) {
  const first = uc.generateCount === 0;
  const fb = feedback
    .map((f, i) => `${i + 1}. "${f.comment}" — marked-up screenshot: ${f.imagePath}${f.pageUrl ? ` (page ${f.pageUrl})` : ""}`)
    .join("\n");
  return `${first ? "Generate the first version of the app." : `Regenerate the app (version ${uc.generateCount + 1}). Work from the deltas: change what the new inputs below ask for and keep everything else as it is.`}

${docs.length ? `BMAD documents ${first ? "available now" : "changed since the last generation"}:\n${docs.map((d) => `- ${d}`).join("\n")}` : first ? "BMAD has no documents yet: build from bacc/intake.md." : "No BMAD document changed since the last generation."}
${fb ? `\nScreen feedback from the client since the last generation (open each screenshot with Read: the drawings show the spot they mean):\n${fb}\n` : ""}
When the app works, write \`${notesPath}\` for BMAD, with these sections:
## What was built
## UI and UX notes (for Sally, the UX designer)
## New or changed requirements (for John, the product manager)
## Technical decisions and changes (for Winston, the architect)
## Assumptions made
Each item one line, in plain words. Then tell the client with \`mcp__bacc__say\` (agent \`generator\`) what they can now see in the preview.`;
}

async function fakeGenerate(uc: UseCase, notesPath: string, tally: RunTally) {
  const dir = appDir(uc.slug);
  await fs.mkdir(dir, { recursive: true });
  const safe = uc.name.replace(/[<>&]/g, "");
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui;background:linear-gradient(135deg,#1e1b4b,#0f766e);color:#fff}h1{font-size:clamp(2.5rem,8vw,5rem);margin:0}p{opacity:.8}</style></head>
<body><main><h1>Hello World</h1><p>${safe}, version ${uc.generateCount + 1}</p></main></body></html>`,
  );
  await fs.mkdir(path.dirname(workspacePath(uc.slug, notesPath)), { recursive: true });
  await fs.writeFile(
    workspacePath(uc.slug, notesPath),
    "## What was built\n- One page that says Hello World.\n## UI and UX notes (for Sally, the UX designer)\n- Centered greeting on a gradient.\n## New or changed requirements (for John, the product manager)\n- None.\n## Technical decisions and changes (for Winston, the architect)\n- Static HTML, no server code.\n## Assumptions made\n- English only.\n",
  );
  tally.spoke++;
  await prisma.message.create({
    data: { useCaseId: uc.id, role: "bmad-agent", agent: "generator", content: "Your app is ready in the preview: one page that greets visitors with Hello World." },
  });
}

async function commitApp(dir: string, n: number) {
  try {
    await fs.access(path.join(dir, ".git"));
  } catch {
    await run("git", ["init", "-q"], { cwd: dir });
    await fs.writeFile(path.join(dir, ".gitignore"), "node_modules/\n.next/\ndist/\n*.db\n.env*\n", { flag: "wx" }).catch(() => {});
  }
  await run("git", ["add", "-A"], { cwd: dir });
  await run(
    "git",
    ["-c", "user.name=BMAD Accelerator", "-c", "user.email=generate@bmad-accelerator.local", "commit", "-q", "--allow-empty", "-m", `Generate version ${n}`],
    { cwd: dir },
  );
}

export async function runGenerate(useCaseId: string) {
  if (busy.has(useCaseId)) return;
  busy.add(useCaseId);
  try {
    let uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
    await prisma.useCase.update({
      where: { id: useCaseId },
      data: { generateBusy: true, generateStatus: "Getting ready", agentError: "" },
    });
    if (!uc.provisioned) await provisionWorkspace(useCaseId);
    else await writeIntake(useCaseId);
    uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
    await assignPort(uc);
    const n = uc.generateCount + 1;
    const notesPath = path.join("_bmad-output", uc.initiative || "generate", "generate", `generate-notes-${n}.md`);
    const docs = await changedDocs(uc);
    const feedback = await prisma.feedback.findMany({ where: { useCaseId, status: { in: ["new", "sent"] } } });
    const tally: RunTally = { spoke: 0 };

    if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
      await fakeGenerate(uc, notesPath, tally);
    } else {
      await runSdkTurn({
        useCaseId,
        slug: uc.slug,
        prompt: generatePrompt(uc, notesPath, docs, feedback.map((f) => ({ ...f, imagePath: path.relative(workspacePath(uc.slug), f.imagePath) }))),
        resume: uc.generateSessionId,
        appendSystem: GENERATOR_RULES,
        tally,
        maxTurns: 400,
        onSession: async (id) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { generateSessionId: id } });
        },
        onStatus: async (s) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: s } });
        },
      });
    }
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: "Starting the preview" } });
    await commitApp(appDir(uc.slug), n);
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateCount: n, lastGeneratedAt: new Date(), ...(uc.stage === "clarify" || uc.stage === "plan" ? { stage: "build" } : {}) } });
    await stopPreview(useCaseId);
    await startPreview(useCaseId);
    if (feedback.length) {
      await prisma.feedback.updateMany({ where: { id: { in: feedback.map((f) => f.id) } }, data: { status: "built" } });
      // Their cards on the board move to Done too.
      await prisma.ticket.updateMany({
        where: { useCaseId, kind: "feedback", ref: { in: feedback.map((f) => f.ticketRef) } },
        data: { status: "done" },
      });
    }
    // Long-term memory: what was built, and the developer (and Sofia, for feedback) learn from it.
    const notes = await fs.readFile(path.join(workspacePath(uc.slug), notesPath), "utf8").catch(() => "");
    onAppGenerated({ ...uc, stage: uc.stage === "learn" ? "learn" : "build" }, notes.slice(0, 4000) || `Version ${n} of the app.`, feedback.map((f) => `${f.ticketRef}: ${f.comment}`).join("\n"));
    // Write what Generate learned back into BMAD, through BMAD's own agents.
    if (agentsEnabled()) {
      await enqueue(
        useCaseId,
        "generate",
        `Generate finished version ${n} of the app (it is running in the client's preview). Its notes for BMAD are in ${notesPath}. Bring them into BMAD through the owning agents' own update workflows: UI and UX notes to Sally (\`bmad-agent-ux-designer\`), new or changed requirements to John (\`bmad-agent-pm\`), technical decisions to Winston (\`bmad-agent-architect\`). Where BMAD would ask the client first, ask them, one question at a time. Tell the client in one line what you're updating.`,
      );
    }
  } catch (e) {
    console.error("generate failed", e);
    await prisma.useCase.update({
      where: { id: useCaseId },
      data: { agentError: `Generate: ${e instanceof Error ? e.message.slice(0, 400) : String(e)}` },
    });
  } finally {
    busy.delete(useCaseId);
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateBusy: false, generateStatus: "" } }).catch(() => {});
  }
}
