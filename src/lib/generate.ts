import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { claudeConfigured } from "@/lib/agent/auth";
import { onAppGenerated } from "@/lib/memory";
import { workspacePath } from "@/lib/workspace";
import { installDesignSkills, provisionWorkspace, writeIntake } from "@/lib/provision";
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

const SHOT = path.join(process.cwd(), "scripts", "shot.mjs");

const GENERATOR_RULES = `You are the Generate step of the BMAD Accelerator: Claude Code building a working pilot app, Replit style, from wherever the BMAD planning stands right now. The client judges the whole accelerator by this app, so it must look like a real, premium product from a top design studio, not a prototype.

Rules:
- Build the app in the folder \`app/\` at the project root. Nothing else in the project is yours to change, except the notes file and the files under \`bacc/design/\` named in the task.
- Read the BMAD documents in \`_bmad-output/\` (brief, PRFAQ, PRD, UX DESIGN.md and EXPERIENCE.md, architecture, the ticket tree) and the client's intake in \`bacc/intake.md\`. Build what they describe as far as they go. Where they are silent, make a sensible choice and write it down in the notes as an assumption.
- Use names, prices, formats, years and wording exactly as the documents give them (for example a serial-number format with a year). Where a document marks content as a placeholder, label it as sample content in the app.
- Data: seed the catalogue and content (products, pages, prices) with realistic sample data, but never invent people: no made-up customers, orders, sign-ups, reviews or contact details, and no seed script that creates them. Lists of those start empty, with a friendly empty state.

Design (as much a part of the job as the features):
- Read and follow the skills \`.claude/skills/frontend-design/SKILL.md\` and \`.claude/skills/frontend-design-direction/SKILL.md\` before you write any UI.
- Before coding the UI, write \`bacc/design/direction.md\`: the product, its audience and its primary job; the tone; the palette as 4 to 6 named hex values; the typefaces and their roles; the layout concept with a small ASCII wireframe of the home page; and the one memorable signature detail. Ground every choice in the subject's own world (its materials, vernacular and customers). Then review it against the frontend-design skill's list of generic defaults and revise anything that would fit any similar app.
- Follow Sally's UX documents where they make a real design choice. If they only keep a look from an earlier version, or the app has since become a different kind of product, design afresh for what it is now, and say so in the UI and UX notes for Sally.
- Imagery carries the subject. Draw icons, illustrations and decorative elements as SVG in code. Use \`mcp__bacc__make_image\` (AI images saved under app/, a limited number per run) only where real-looking pictures make the product: products and their hero in a shop or e-commerce app, food, places, rooms, physical goods. For tools, dashboards and most other apps, draw instead. If image generation is not available, draw everything. Decide which pictures to make, and where they go, from the requirements, Sally's UX documents and the client's own picks and feedback, never from a stock layout (for example, the products a shop sells when the PRD lists them). Don't add sections or images the documents don't call for. Generic product shots are fine even when the products resemble well-known goods (a gumball, a chocolate bar in plain wrapping); just never copy a real brand's name, logo or packaging, or show real people. No empty boxes, no text-only product cards, no images fetched from outside.
- Every build, whatever it is (website, shop, web app, dashboard, landing page, a single page), is built on shadcn/ui (https://ui.shadcn.com). No exceptions: never plain HTML and CSS, never another component library. It runs on React, Vite and Tailwind CSS, with Google web fonts. Set it up with the shadcn CLI (\`npx shadcn@latest init\`, then \`npx shadcn@latest add\` for each component you use) and build the UI from its components (Button, Card, Dialog, Sheet, Tabs, Form and so on) and its blocks where they fit. Theme it through shadcn's CSS variables (background, foreground, primary, secondary, accent, muted, border, radius) set from the palette, fonts and corners in your design direction, so it looks like this product and never like the stock shadcn demo. The one override: an approved upload of the type "Design system or brand" (listed in \`bacc/intake.md\`) that defines a full design system or stack of its own (components, framework, for example React, Node or anything else). Then build with that instead. A brand guide, logo or colours alone don't override shadcn/ui; they theme it.

The app must run with no accounts or paid services: \`npm install\` then \`npm start\` (do any build in \`npm run build\`, which runs before start), listening on \`process.env.PORT\` and host 0.0.0.0. Use SQLite or files for data.

Components: if \`bacc/design/components.md\` exists, it maps the PRD's screens and requirements to shadcn/ui components, blocks and charts the client approved. Build each screen from the items it names. The shadcn MCP tools (\`mcp__shadcn__*\`) are available: look items up with \`mcp__shadcn__search_items_in_registries\` (one short word per search, for example \`calendar\` or \`chart\`: it matches literally, so phrases return nothing) and \`mcp__shadcn__view_items_in_registries\`, check usage with \`mcp__shadcn__get_item_examples_from_registries\`, and get the exact install command with \`mcp__shadcn__get_add_command_for_items\`. Run every shadcn command inside \`app/\`, never at the project root. If you use an item the list doesn't name, or skip one, say so in the UI and UX notes. Before your screenshot rounds, run \`mcp__shadcn__get_audit_checklist\` and work through it.

Check it with your own eyes before you finish:
1. Start it on a spare port (for example 4999).
2. Screenshot every main page at desktop and phone size, saving into the project's \`bacc/design/shots/\` folder (the task gives its full path): \`node ${SHOT} http://127.0.0.1:4999 <shots folder> / /other-page ...\`. It prints each file and warns about page errors or content wider than the screen. Keep the screenshots there, not in /tmp.
3. Open each screenshot with Read and critique it as the design lead would: does it look like a premium, distinctive product for this subject? Is the hierarchy clear, the type well set, the spacing even, the imagery present, nothing broken or overflowing on the phone?
4. Fix what you find and repeat until you'd be proud to show it. Do at least two rounds. Then stop the app.

Use the \`bacc\` tools to talk to the client: \`mcp__bacc__say\` with agent \`generator\`, two or three short sentences, plain words. Plain text you write is not shown.`;

function generatePrompt(
  uc: UseCase,
  notesPath: string,
  docs: string[],
  feedback: { comment: string; imagePath: string; pageUrl: string }[],
  redesign: boolean,
  fresh = false,
) {
  const first = uc.generateCount === 0 || fresh;
  const fb = feedback
    .map((f, i) => `${i + 1}. "${f.comment}" — marked-up screenshot: ${f.imagePath}${f.pageUrl ? ` (page ${f.pageUrl})` : ""}`)
    .join("\n");
  const opening = fresh
    ? `Build the app from scratch (version ${uc.generateCount + 1}). The client set the earlier app aside: \`app/\` is empty and there is no design direction yet. Build only from BMAD's documents, \`bacc/intake.md\` and the component list, as if no app had ever existed. Never open \`bacc/archive/\`: it holds the old app and must not shape this one.`
    : first
      ? "Generate the first version of the app."
    : redesign
      ? `Redesign the app (version ${uc.generateCount + 1}). Keep every feature, page, rule and piece of data that works, but treat the look as not good enough: write a fresh \`bacc/design/direction.md\` from scratch, without reusing the current palette, fonts or layout, and rebuild the whole UI to it. Also bring in any change from the inputs below.`
      : `Regenerate the app (version ${uc.generateCount + 1}). Work from the deltas: change what the new inputs below ask for and keep everything else as it is. If \`bacc/design/direction.md\` is missing, write it and bring the whole UI up to it.`;
  const components = first
    ? "\n\nComponent list: if `bacc/design/components.md` doesn't exist yet and the PRD does, write it first. For each screen and requirement in the PRD, look up shadcn/ui items with the shadcn MCP tools (one short word per search) and list the exact registry names with one line on why each fits, plus a \"Gaps\" section; only list items the tools returned. Register it with `mcp__bacc__register_document` (type `ux`, title \"Component list\", review true) and build from it without waiting."
    : "";
  const stackCheck = first
    ? ""
    : "\n\nFirst check the stack: if the app's front end is not built on shadcn/ui with React and Tailwind (unless an approved 'Design system or brand' upload defines a different one), move it onto shadcn/ui in this run, whatever else the run asks. Keep the server, the data and every route and feature working, and check them all afterwards.";
  return `${opening}${components}${stackCheck}

${docs.length ? `BMAD documents ${first || redesign ? "available now" : "changed since the last generation"}:\n${docs.map((d) => `- ${d}`).join("\n")}` : first ? "BMAD has no documents yet: build from bacc/intake.md." : "No BMAD document changed since the last generation."}
${fb ? `\nScreen feedback from the client since the last generation (open each screenshot with Read: the drawings show the spot they mean):\n${fb}\n` : ""}
Save your screenshots in \`${workspacePath(uc.slug, "bacc", "design", "shots")}\`.

When the app works and you have checked the screenshots, write \`${notesPath}\` for BMAD, with these sections:
## What was built
## UI and UX notes (for Sally, the UX designer)
## New or changed requirements (for John, the product manager)
## Technical decisions and changes (for Winston, the architect)
## Assumptions made
Each item one line, in plain words. Put the design direction in the UI and UX notes so Sally can bring it into DESIGN.md. Then tell the client with \`mcp__bacc__say\` (agent \`generator\`) what they can now see in the preview.`;
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

// Start fresh: the current app, its design direction and screenshots move to bacc/archive/, out of Generate's sight.
async function setAsideApp(uc: UseCase) {
  await stopPreview(uc.id);
  const stamp = `v${uc.generateCount}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const archive = workspacePath(uc.slug, "bacc", "archive", stamp);
  await fs.mkdir(archive, { recursive: true });
  for (const [from, to] of [
    [appDir(uc.slug), "app"],
    [workspacePath(uc.slug, "bacc", "design", "direction.md"), "direction.md"],
    [workspacePath(uc.slug, "bacc", "design", "shots"), "shots"],
  ]) {
    await fs.rename(from, path.join(archive, to)).catch(() => {});
  }
  await fs.mkdir(appDir(uc.slug), { recursive: true });
}

export async function runGenerate(useCaseId: string, opts: { redesign?: boolean; fresh?: boolean } = {}) {
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
    await installDesignSkills(uc.slug);
    const fresh = !!opts.fresh && uc.generateCount > 0;
    const redesign = !fresh && !!opts.redesign && uc.generateCount > 0;
    if (fresh) {
      await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: "Setting the old app aside" } });
      await setAsideApp(uc);
    }
    const docs = await changedDocs(redesign || fresh ? { ...uc, lastGeneratedAt: null } : uc);
    const feedback = await prisma.feedback.findMany({ where: { useCaseId, status: { in: ["new", "sent"] } } });
    const tally: RunTally = { spoke: 0 };

    if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
      await fakeGenerate(uc, notesPath, tally);
    } else {
      await runSdkTurn({
        useCaseId,
        slug: uc.slug,
        prompt: generatePrompt(uc, notesPath, docs, feedback.map((f) => ({ ...f, imagePath: path.relative(workspacePath(uc.slug), f.imagePath) })), redesign, fresh),
        // A fresh build starts a new session, so nothing from the old app's build carries over.
        resume: fresh ? "" : uc.generateSessionId,
        appendSystem: GENERATOR_RULES,
        tally,
        maxTurns: 600,
        // Generate gets more thinking for the design work; BACC_GENERATE_MODEL can pick another model.
        model: process.env.BACC_GENERATE_MODEL || undefined,
        effort: "high",
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
