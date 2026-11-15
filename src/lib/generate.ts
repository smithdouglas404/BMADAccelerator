import { promises as fs } from "fs";
import { decisionsForPrompt, pendingForBuild } from "./buildQueue";
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

const GENERATOR_RULES = `You are the Generate step of the BMAD Accelerator. Work exactly as you would if the client had opened Claude Code and said "build me this": you bring everything you know about the best products of this kind, and you build the complete, high-fidelity product a leading company would ship. The BMAD documents, the client's answers, picks and screen mark-ups are more information on top of that, the way a person vibe coding keeps telling you more. More information must always make the app better, never smaller.

How to use what the client and BMAD have said:
- Floor, not ceiling. Start from the full product for its category (decide the category first: candy for sale is an online shop, a booking service is a booking site, and so on) and everything the leading products in that category have. Then apply the documents and decisions as additions and changes. Where they are silent, use your own best judgement at full ambition, as in Claude Code. Silence never removes anything.
- Only an explicit "no" from the client removes something (a requirement marked out of scope, a decision, a review answer). A pilot limit changes behaviour, not presence: "pre-order only, no payment" means the basket, quantities and checkout are all there and checkout ends in a pre-order confirmation instead of a card form. Things beyond the pilot work as clearly labelled demos instead of being missing.
- Where the documents make a real choice (a feature, a rule, a name, a price, a wording, a flow), build it exactly. Where they only describe a minimum, build the minimum as part of the full product.
- Newer wins: the client's ticked review-queue decisions and screen mark-ups win over older document lines; the client's numbered picks in \`bacc/design/picks.md\` (from \`bacc/design/options.md\`) win over your own design judgement and over any concept they did not pick from. A design concept the client never chose from is a suggestion, not a rule.
- Write every choice you made yourself, and every place you went beyond the documents, under "Assumptions made" in the notes, so BMAD and the client can confirm or change them.

Design:
- Read \`.claude/skills/frontend-design/SKILL.md\` and \`.claude/skills/frontend-design-direction/SKILL.md\` first. Then write \`bacc/design/direction.md\`: the category and the three leading products you measure against; the product, audience and primary job; palette (4 to 6 named hex values) and typefaces with the reason for each; the home-page layout as a small ASCII wireframe; the signature detail. The category's conventions come first and a theme is an accent on top (an online shop shows products in the first screen, professional type, trust signals).
- Use real-looking imagery wherever a leading product in this category would (product photos in a shop, rooms in a hotel site, and so on) with \`mcp__bacc__make_image\` (a limited number per run; if it isn't available, draw instead). Draw icons and illustrations as finished, high-fidelity SVG. Pictures must show what is really sold or described (never fresh fruit for a sweet that contains none); never copy a real brand's name, logo or packaging, never show real people, never fetch images from outside.
- Every build is on shadcn/ui (React, Vite, Tailwind CSS, Google web fonts): \`npx shadcn@latest init\`, then \`npx shadcn@latest add\` for each component, themed through its CSS variables so it looks like this product, not the shadcn demo. The one override: an approved "Design system or brand" upload (listed in \`bacc/intake.md\`) that defines its own stack. If \`bacc/design/components.md\` exists, use the items it names, plus whatever else the full product needs. The shadcn MCP tools (\`mcp__shadcn__*\`) find registry items (one short word per search) and give install commands; run every shadcn command inside \`app/\`. Run \`mcp__shadcn__get_audit_checklist\` before your screenshot rounds.

AI agents: suggest and build agents only where they add real value (workflows, messages, alerts and notifications, recommendations or insights); fixed rules stay plain code. Build agents with Inngest AgentKit (\`@inngest/agent-kit\`) only, following \`.claude/skills/bacc-agentic-advisor/references/agentkit.md\` and its \`library/\` (exact pinned versions), mapped as \`bacc/advisor/agentic-map.md\` says when it exists. Person-in-the-loop steps wait with \`step.waitForEvent\` behind an approval screen. Keys only from the environment; with no key, a labelled demo mode so every flow still works.

Running and safety (these are the only hard rules):
- Build in \`app/\` only; nothing else in the project is yours to change except the notes file and \`bacc/design/\`.
- It must run with no accounts or paid services: \`npm install\`, \`npm run build\`, \`npm start\`, listening on \`process.env.PORT\` and host 0.0.0.0. SQLite or files for data.
- Seed products, pages and prices with realistic sample content, labelled as samples where a document marks a placeholder. Never invent people: no made-up customers, orders, sign-ups, reviews or contact details. Areas for those (reviews, account, order history) exist with friendly empty states.
- Allergy, health, money and AI wording must be honest.
- Never kill processes by name or pattern (\`pkill -f\`, \`killall\`, \`ps | grep ... | kill\`): your own command line contains words like "shadcn" and "claude". Run anything that could hang with \`timeout\` and no input, and stop only PIDs you started.

Check it with your own eyes before you finish:
1. Start it on a spare port (for example 4999).
2. Screenshot every main page at desktop and phone size into the project's \`bacc/design/shots/\` folder: \`node ${SHOT} http://127.0.0.1:4999 <shots folder> / /other-page ...\`.
3. Open each screenshot with Read and compare it with the three leading products in your direction. Anything they all have that this app lacks is a bug, unless the client removed it on purpose. Also check hierarchy, type, spacing, imagery and the phone layout.
4. Fix and repeat until it would stand next to them. At least two rounds. Then stop the app.

Talk to the client with \`mcp__bacc__say\` (agent \`generator\`), two or three short sentences in plain words. Plain text you write is not shown.`;

function generatePrompt(
  uc: UseCase,
  notesPath: string,
  docs: string[],
  feedback: { comment: string; imagePath: string; pageUrl: string }[],
  redesign: boolean,
  fresh = false,
  decisions = "",
) {
  const first = uc.generateCount === 0 || fresh;
  const fb = feedback
    .map((f, i) => `${i + 1}. "${f.comment}" — marked-up screenshot: ${f.imagePath}${f.pageUrl ? ` (page ${f.pageUrl})` : ""}`)
    .join("\n");
  const fullProduct =
    "First read `bacc/intake.md` and `bacc/floor.md` (the product floor: the category, its leading products and everything this kind of product has; build every [confirmed] and [assumed] item and never an [out] one) and picture what you would build if the client had typed only their idea into Claude Code: the complete product a leading company in this category ships. Build that. Then read the BMAD documents and decisions below and layer them on as additions and changes.";
  const opening = fresh
    ? `Build the app from scratch (version ${uc.generateCount + 1}). The client set the earlier app aside: \`app/\` is empty and there is no design direction yet. Never open \`bacc/archive/\`: it holds the old app and must not shape this one. ${fullProduct}`
    : first
      ? `Generate the first version of the app. ${fullProduct}`
    : redesign
      ? `Redesign the app (version ${uc.generateCount + 1}). Keep every feature, page, rule and piece of data that works, but treat the look as not good enough: write a fresh \`bacc/design/direction.md\` from scratch, without reusing the current palette, fonts or layout, and rebuild the whole UI to it. Also bring in any change from the inputs below.`
      : `Regenerate the app (version ${uc.generateCount + 1}). Carry on as you would in Claude Code when the client tells you more: build in what the new inputs below ask for and keep everything else. If the app is still missing something the leading products in its category all have, or a [confirmed] or [assumed] item in \`bacc/floor.md\`, add it too; never build an [out] item. If \`bacc/design/direction.md\` is missing or doesn't name the category and its three leading products, write it and bring the whole UI up to it.`;
  const components = first
    ? "\n\nComponent list: if `bacc/design/components.md` doesn't exist yet and the PRD does, write it first. For each screen and requirement in the PRD, look up shadcn/ui items with the shadcn MCP tools (one short word per search) and list the exact registry names with one line on why each fits, plus a \"Gaps\" section; only list items the tools returned. Register it with `mcp__bacc__register_document` (type `ux`, title \"Component list\", review true) and build from it without waiting."
    : "";
  const stackCheck = first
    ? ""
    : "\n\nFirst check the stack: if the app's front end is not built on shadcn/ui with React and Tailwind (unless an approved 'Design system or brand' upload defines a different one), move it onto shadcn/ui in this run, whatever else the run asks. Keep the server, the data and every route and feature working, and check them all afterwards.";
  return `${opening}${components}${stackCheck}

${docs.length ? `BMAD documents ${first || redesign ? "available now" : "changed since the last generation"}:\n${docs.map((d) => `- ${d}`).join("\n")}` : first ? "BMAD has no documents yet: build from bacc/intake.md." : "No BMAD document changed since the last generation."}
${fb ? `\nScreen feedback from the client since the last generation (open each screenshot with Read: the drawings show the spot they mean):\n${fb}\n` : ""}${
    decisions
      ? `\nDecisions from the client's review queue that they ticked for this build. Build each one in, even where a BMAD document doesn't say it yet; a newer decision here wins over an older document line. List any you couldn't build, and why, in the notes:\n${decisions}\n`
      : ""
  }
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
    // Review-queue decisions the client ticked for this build (see buildQueue.ts).
    const ticked = pendingForBuild(await prisma.reviewItem.findMany({ where: { useCaseId, includeInBuild: true, builtInVersion: 0 }, orderBy: { createdAt: "asc" } }));
    const tally: RunTally = { spoke: 0 };

    if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
      await fakeGenerate(uc, notesPath, tally);
    } else {
      await runSdkTurn({
        useCaseId,
        slug: uc.slug,
        prompt: generatePrompt(
          uc,
          notesPath,
          docs,
          feedback.map((f) => ({ ...f, imagePath: path.relative(workspacePath(uc.slug), f.imagePath) })),
          redesign,
          fresh,
          decisionsForPrompt(ticked),
        ),
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
    if (ticked.length) {
      await prisma.reviewItem.updateMany({ where: { id: { in: ticked.map((r) => r.id) } }, data: { builtInVersion: n } });
    }
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
        `Generate finished version ${n} of the app (it is running in the client's preview). Its notes for BMAD are in ${notesPath}. Bring them into BMAD through the owning agents' own update workflows: UI and UX notes to Sally (\`bmad-agent-ux-designer\`), new or changed requirements to John (\`bmad-agent-pm\`), technical decisions to Winston (\`bmad-agent-architect\`). Where BMAD would ask the client first, ask them, one question at a time. Tell the client in one line what you're updating.\n\nThen, as the client's expert advisor, review the built app (bacc-expert-advisor skill, section 4): open the screenshots in bacc/design/shots/, compare them first with the three leading products named in bacc/design/direction.md (anything they all have that the app lacks is a bug unless the client removed it on purpose, and so is anything that looks less professional), then check them against the PRD, Sally's documents, bacc/design/concept.md, bacc/design/components.md and bacc/advisor/agentic-map.md if it exists (bacc-agentic-advisor skill, "After a build"), write bacc/advisor/app-review-v${n}.md, call mcp__bacc__advise for "generator" with your top three changes, tell the client your verdict in two or three plain sentences and ask whether to build them in at the next Regenerate.`,
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
