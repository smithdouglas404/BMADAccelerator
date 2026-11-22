import { recordChange } from "@/lib/studio/truthlog";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { claudeConfigured } from "@/lib/agent/auth";
import { onAppGenerated } from "@/lib/memory";
import { workspacePath } from "@/lib/workspace";
import { installDesignSkills, provisionWorkspace, syncStudioSkills, writeIntake } from "@/lib/provision";
import { appDir, assignPort, startPreview, stopPreview } from "@/lib/preview";
import { buildTimer } from "@/lib/buildTiming";
import { syncAgents } from "@/lib/agentService";
import { moveCard } from "@/lib/studio/board";
import { enqueue, runSdkTurn, agentsEnabled } from "@/lib/agent/runner";
import type { RunTally } from "@/lib/agent/tools";
import { writePackage } from "@/lib/studio/state";
import { pushToGit } from "@/lib/studio/sync";

const run = promisify(execFile);
const busy = new Set<string>();

const SHOT = path.join(process.cwd(), "scripts", "shot.mjs");

// Claude Code's standing rules for every build. The package's own CLAUDE_CODE_PROMPT.md carries the
// product: these rules carry how to build it.
const GENERATOR_RULES = `You are Claude Code inside the Working Backwards Studio. Work exactly as you would if the owner had opened Claude Code and said "build me this": you bring everything you know about the best products of this kind and build the complete, high-fidelity product a leading company would ship. The Studio's package (PRFAQ, capabilities, decisions, backlog, annotations) is more information on top of that, the way a person vibe coding keeps telling you more. More information must always make the app better, never smaller.

The floor rule:
- Start from the full product for its category and everything the leading products in it have. The "Capability floor" section of \`studio/package/TECHNICAL_REQUIREMENTS.md\` lists it, and PRD.md and TRD.md describe it: build every [confirmed] and [assumed] item, never an [out] one. Where the package is silent, use your own judgement at full ambition. Silence never removes anything; only the owner's explicit "no" does.
- A pilot limit changes behaviour, not presence: "no real integrations yet" keeps every screen and step, and the step that would call the outside system ends in a clearly labelled demo. Things beyond the pilot work as clearly labelled demos instead of being missing.
- Approved decisions and annotations win over older lines. Write every choice you made yourself under "Assumptions made" in the build notes, so Socra can confirm it with the owner.

Design:
- Read \`.claude/skills/frontend-design/SKILL.md\` and \`.claude/skills/frontend-design-direction/SKILL.md\` first. Write \`studio/design/direction.md\`: the category and three leading products you measure against, the audience and primary job, palette (4 to 6 named hex values) and typefaces with reasons, the home-page layout as a small ASCII wireframe, the signature detail. The category's conventions come first; a theme is an accent on top.
- Real-looking imagery wherever a leading product would have it, made with \`mcp__studio__make_image\` (a limited number per run; draw if it isn't available). Pictures show what this product really deals with. Never copy a real brand, never show real people, never fetch images from outside.
- Every build is on shadcn/ui (React, Vite, Tailwind CSS, Google web fonts): \`npx shadcn@latest init\`, then one \`npx shadcn@latest add a b c ...\` with every component you need at once (not one command per component), themed so it looks like this product. Motion (\`motion\`, the animation library, imported from \`motion/react\`) gives the interface its life: page and list transitions, presence for dialogs and toasts, small state changes. Keep it purposeful and quick, and respect \`prefers-reduced-motion\`. The one override: an owner upload that defines its own design system or stack. Use the items in \`studio/package/COMPONENT_MAP.json\` plus whatever else the full product needs. The shadcn MCP tools (\`mcp__shadcn__*\`) find registry items and give install commands; run shadcn commands inside \`app/\`. Run \`mcp__shadcn__get_audit_checklist\` before your screenshot rounds.

Agents: the product's agents live in the Studio's shared agent service, not in the app. Never install AgentKit, Letta, Mem0 or a model SDK in the app, and never put a model key in it. \`studio/package/AGENTS.json\` lists the approved agents (key, purpose, persona, tools, approvals). Copy \`.claude/skills/working-backwards-studio/assets/agent-client.ts\` into the app's server code and call agents only from the server through it (\`askAgent\`, \`waitForRun\`, \`approvals\`, \`decide\`, \`runs\`). For each agent tool, implement \`POST /api/agent-actions/<tool>\` in the app's server, checked with \`isAgentService\`, doing the action in plain code and returning JSON. Give every agent a place in the UI where its answer is used, an approval screen listing what waits for a person (Approve, Reject, a comment), and a small run history ("what the assistant did and why"). With no \`AGENT_SERVICE_URL\`, the client returns labelled demos so every flow still works. Fixed rules stay plain code; no agent for the sake of it.

Running and safety (the only hard rules):
- Build in \`app/\` only; nothing else in the project is yours to change except the build notes and \`studio/design/\`.
- Copy \`.claude/skills/working-backwards-studio/assets/studio-bridge.js\` to \`app/public/studio-bridge.js\` and load it in \`app/index.html\` with \`<script src="/studio-bridge.js" defer></script>\`. It tells the Studio which page the owner is on during Vibe review; it does nothing outside the Studio.
- It runs with no accounts or paid services: \`npm install\`, \`npm run build\`, \`npm start\`, listening on \`process.env.PORT\` and host 0.0.0.0. SQLite or files for data.
- Realistic sample data (records, pages, figures), labelled as samples. Never invent people: no made-up customers, reviews or contact details; those areas exist with friendly empty states.
- Health, safety, money, legal and AI wording must be honest.
- Never kill processes by name or pattern (\`pkill -f\`, \`killall\`): your own command line contains words like "shadcn" and "claude". Run anything that could hang with \`timeout\` and no input, and stop only PIDs you started. Never run a command that waits for input: no bare \`cat\`, \`read\` or a pipe from the terminal (\`cat >> /dev/null\` hung a build for 9 minutes); give every command its input or \`< /dev/null\`.

Order of work, so the owner sees something early: first the main customer flow and the core screens with sample data, then \`npm run build\` and \`mcp__studio__show_preview\` (aim for about ten minutes in), then the rest of the floor, calling \`mcp__studio__show_preview\` again after each big step. Install once: add every package and component you know you need in one go, and don't reinstall between checks.

Check it with your own eyes before you finish:
1. Start it on a spare port (for example 4999).
2. Screenshot the pages that matter in one command into \`studio/shots/\`: the home page and at most three other main pages (on a later version, only the pages this build changed): \`node ${SHOT} http://127.0.0.1:4999 <shots folder> / /other-page ...\`.
3. Open each screenshot with Read and compare it with the three leading products in your direction. Anything they all have that this app lacks is a bug, unless the owner said no to it. Check hierarchy, type, spacing, imagery and the phone layout.
4. Fix what you found, then take one more screenshot of only the pages you fixed. One round, plus that check, is enough: the owner reviews it next, and Socra reviews the screenshots after you. Then stop the app.

Talk to the owner only with \`mcp__studio__say\`, two or three short sentences in plain words. Plain text you write is not shown.`;

export function generatePrompt(opts: { version: number; iteration: number; notesPath: string; shotsDir: string; first: boolean; fresh: boolean; redesign: boolean }) {
  const { version, iteration, notesPath, shotsDir, first, fresh, redesign } = opts;
  const opening = fresh
    ? `Build the app from scratch (version ${version}). The owner set the earlier app and its whole design aside: \`app/\` is empty and there is no design direction. Never open \`studio/archive/\` or an older version in git: the old design must not shape this one in any way.`
    : first
      ? `Build the first version of the app (version ${version}).`
      : redesign
        ? `Redesign the app (version ${version}). Keep every feature, page, rule and piece of data that works, but treat the look as not good enough: write a fresh \`studio/design/direction.md\` without reusing the current palette, fonts or layout, and rebuild the whole UI to it.`
        : `Iterate on the app (version ${version}). Carry on as you would in Claude Code when the owner tells you more: build in what changed and keep everything else. If the app still lacks something the leading products in its category all have, or a [confirmed] or [assumed] floor item, add it too.`;
  return `${opening}

The Studio assembled package iteration ${iteration} for this build in \`studio/package/\`. Start with \`studio/package/CLAUDE_CODE_PROMPT.md\` and follow it; it points to the other files (PRFAQ.md, VALIDATED_USE_CASE.md, PRD.md, TRD.md, SPEC_TRACE.json, SPEC_DIFF.md, TECHNICAL_REQUIREMENTS.md, COMPONENT_MAP.json, AGENT_KIT_ROUTING.json, KANBAN.json, BACKLOG.json, EVIDENCE.json, VISUAL_ANNOTATIONS.json, CONVERSATION.json, PACKAGE_MANIFEST.json). For each annotation in VISUAL_ANNOTATIONS.json with a \`frameFile\`, open the picture with Read: it shows the spot the owner meant.${
    first || fresh ? "" : "\n\nFirst check the stack: if the front end is not built on shadcn/ui with React and Tailwind (unless an owner upload defines a different one), move it onto shadcn/ui in this run, keeping every route, feature and piece of data working."
  }

Save your screenshots in \`${shotsDir}\`.

When the app works and you have checked the screenshots, write \`${notesPath}\` with these sections:
## What was built
## What the owner should look at
## Gaps against the leading products
## Assumptions made
Each item one line, in plain words. Then tell the owner with \`mcp__studio__say\` what they can now see in the preview.`;
}

async function fakeGenerate(uc: UseCase, n: number, notesPath: string, tally: RunTally) {
  const dir = appDir(uc.slug);
  await fs.mkdir(dir, { recursive: true });
  const safe = uc.name.replace(/[<>&]/g, "");
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe}</title>
<style>body{margin:0;min-height:100vh;font-family:system-ui;background:#f6f3ee;color:#1c1917}header{display:flex;justify-content:space-between;align-items:center;padding:18px 28px;border-bottom:1px solid #e7e2da}nav a{margin-left:18px;color:inherit}main{max-width:760px;margin:0 auto;padding:64px 28px}h1{font-size:clamp(2.2rem,6vw,4rem);margin:0 0 12px}p{opacity:.7}label{display:block;margin:28px 0 8px;font-weight:600}input{width:100%;padding:12px;border:1px solid #d6d0c6;border-radius:8px;font:inherit}button{margin-top:14px;padding:12px 18px;border:0;border-radius:8px;background:#1c1917;color:#fff;font:inherit}</style>
<script src="/studio-bridge.js" defer></script></head>
<body><header><strong>${safe}</strong><nav aria-label="Main"><a href="/">Home</a><a href="/#how">How it works</a></nav></header><main><h1>${safe}</h1><p>Stand-in version ${n}, built from the Studio package (sandbox check only).</p><label for="q">Start here</label><input id="q" placeholder="Describe what you need"><button type="button">Get started</button></main></body></html>`,
  );
  await fs.copyFile(path.join(process.cwd(), "studio-skills", "working-backwards-studio", "assets", "studio-bridge.js"), path.join(dir, "studio-bridge.js")).catch(() => {});
  await fs.mkdir(path.dirname(workspacePath(uc.slug, notesPath)), { recursive: true });
  await fs.writeFile(
    workspacePath(uc.slug, notesPath),
    "## What was built\n- A first page with the product's name.\n## What the owner should look at\n- The first screen.\n## Gaps against the leading products\n- Everything beyond the first screen (stand-in build).\n## Assumptions made\n- English only.\n",
  );
  tally.spoke++;
  await prisma.message.create({
    data: { useCaseId: uc.id, role: "agent", agent: "Claude Code", content: `Version ${n} is ready in the preview.` },
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
    ["-c", "user.name=Working Backwards Studio", "-c", "user.email=build@studio.local", "commit", "-q", "--allow-empty", "-m", `Build version ${n}`],
    { cwd: dir },
  );
}

// Start fresh: the current app, its design direction and screenshots move to studio/archive/, out of
// Claude Code's sight. Doug, 2026-11-15: "Abandon the old design... everything should be based off the
// requirements." The product truth (PRFAQ, capabilities, decisions, backlog, evidence) stays.
async function setAsideApp(uc: UseCase) {
  await stopPreview(uc.id);
  const stamp = `v${uc.generateCount}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const archive = workspacePath(uc.slug, "studio", "archive", stamp);
  await fs.mkdir(archive, { recursive: true });
  await fs.rename(appDir(uc.slug), path.join(archive, "app")).catch(() => {});
  await fs.rename(workspacePath(uc.slug, "studio", "design"), path.join(archive, "design")).catch(() => {});
  await fs.rename(workspacePath(uc.slug, "studio", "shots"), path.join(archive, "shots")).catch(() => {});
  await fs.mkdir(appDir(uc.slug), { recursive: true });
}

export async function runGenerate(useCaseId: string, opts: { redesign?: boolean; fresh?: boolean } = {}) {
  if (busy.has(useCaseId)) return;
  busy.add(useCaseId);
  try {
    let uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateBusy: true, generateStatus: "Assembling the package", agentError: "" } });
    if (!uc.provisioned) await provisionWorkspace(useCaseId);
    else {
      await writeIntake(useCaseId);
      await syncStudioSkills(useCaseId, uc.slug);
    }
    uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
    await assignPort(uc);
    await installDesignSkills(uc.slug);
    const n = uc.generateCount + 1;
    const fresh = !!opts.fresh && uc.generateCount > 0;
    const redesign = !fresh && !!opts.redesign && uc.generateCount > 0;
    if (fresh) {
      await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: "Setting the old app aside" } });
      await setAsideApp(uc);
      if (agentsEnabled())
        await enqueue(
          useCaseId,
          "note",
          "The owner started fresh and set the old design aside completely (in studio/archive/). Never open it, quote it or refer to the old design again. From here, the look comes only from the product truth and the owner's answers. Don't reply to this note.",
        );
    }
    // What this build answers: annotations not yet built, decisions and backlog items marked for the build.
    const feedback = await prisma.feedback.findMany({ where: { useCaseId, status: "new" } });
    const decisions = await prisma.decision.findMany({ where: { useCaseId, includeInBuild: true, builtInVersion: 0, status: { in: ["approved", "assumed"] } } });
    const items = await prisma.backlogItem.findMany({ where: { useCaseId, includeInBuild: true, state: "ready" } });

    // The product's approved agents are registered before the build, so the app can call them.
    await syncAgents(useCaseId).catch((e) => console.error("agent sync", e));
    const pkg = await writePackage(useCaseId);
    const notesPath = path.join("studio", "builds", `build-notes-${n}.md`);
    await fs.mkdir(workspacePath(uc.slug, "studio", "builds"), { recursive: true });
    for (const m of await prisma.move.findMany({ where: { useCaseId, status: "ready" } }))
      await moveCard(useCaseId, m.id, "building", "The build", `picked up by the build of version ${uc.generateCount + 1}`);
    const tally: RunTally = { spoke: 0 };

    if (process.env.BACC_FAKE_AGENT === "1" && !claudeConfigured()) {
      await fakeGenerate(uc, n, notesPath, tally);
    } else {
      await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: "Claude Code is building" } });
      const timer = buildTimer();
      try {
      await runSdkTurn({
        useCaseId,
        slug: uc.slug,
        prompt: generatePrompt({
          version: n,
          iteration: pkg.iteration,
          notesPath,
          shotsDir: workspacePath(uc.slug, "studio", "shots"),
          first: uc.generateCount === 0,
          fresh,
          redesign,
        }),
        // A fresh build starts a new session, so nothing from the old app's build carries over.
        resume: fresh ? "" : uc.generateSessionId,
        appendSystem: GENERATOR_RULES,
        speaker: "Claude Code",
        kind: "build",
        tally,
        maxTurns: 600,
        model: process.env.BACC_GENERATE_MODEL || undefined,
        // The first version and a redesign think hardest; an iteration builds in what changed.
        effort: uc.generateCount === 0 || fresh || redesign ? "high" : "medium",
        onSession: async (id) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { generateSessionId: id } });
        },
        onStatus: async (s) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: s } });
        },
        onTool: (name, input) => timer.tool(name, input),
        // A command stuck waiting (it hung a Northwind build for 9 minutes): after 8 quiet minutes the run
        // stops and the Studio finishes the build with what Claude Code made.
        idleMs: 8 * 60_000,
      });
      } finally {
        // Where the time went, for the owner and for making builds faster.
        await fs.writeFile(workspacePath(uc.slug, "studio", "builds", `build-timing-${n}.json`), JSON.stringify(timer.report(), null, 2)).catch(() => {});
      }
    }
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateStatus: "Starting the preview" } });
    await commitApp(appDir(uc.slug), n);
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateCount: n, lastGeneratedAt: new Date(), stageLabel: `Version ${n} · in review` } });
    await stopPreview(useCaseId);
    await startPreview(useCaseId);
    if (decisions.length) await prisma.decision.updateMany({ where: { id: { in: decisions.map((d) => d.id) } }, data: { builtInVersion: n } });
    if (items.length) await prisma.backlogItem.updateMany({ where: { id: { in: items.map((b) => b.id) } }, data: { state: "built", builtInVersion: n } });
    if (feedback.length) await prisma.feedback.updateMany({ where: { id: { in: feedback.map((f) => f.id) } }, data: { status: "built" } });
    await recordChange(useCaseId, {
      node: `version:${pkg.version}`,
      kind: "built",
      summary: `Claude Code built version ${n}${decisions.length || items.length || feedback.length ? ` from ${[decisions.length && `${decisions.length} decision${decisions.length === 1 ? "" : "s"}`, items.length && `${items.length} backlog item${items.length === 1 ? "" : "s"}`, feedback.length && `${feedback.length} mark${feedback.length === 1 ? "" : "s"} on the prototype`].filter(Boolean).join(", ")}` : ""}`,
      causes: [...decisions.map((d) => `decision:${d.id}`), ...items.map((b) => `backlog:${b.id}`), ...feedback.map((f) => `ann:${f.id}`)],
      by: "Claude Code",
    });
    for (const m of await prisma.move.findMany({ where: { useCaseId, status: "building" } }))
      await moveCard(useCaseId, m.id, "review", "The build", `built in version ${n} and running in the preview; waiting for your yes or a mark`, [`version:${pkg.version}`]);

    const notes = await fs.readFile(workspacePath(uc.slug, notesPath), "utf8").catch(() => "");
    onAppGenerated(uc, notes.slice(0, 4000) || `Version ${n} of the app.`, feedback.map((f) => f.comment).join("\n"));

    // The pilot goes to the owner's repository when one is connected (never forced).
    if (uc.repoUrl && process.env.GITHUB_TOKEN) await pushToGit(useCaseId).catch((e) => console.warn("git push failed", e));

    if (agentsEnabled()) {
      await enqueue(
        useCaseId,
        "build",
        `Build finished: version ${n} is running in the owner's preview. Claude Code's notes are in ${notesPath}; its screenshots are in studio/shots/. Review the app as the owner's expert (studio-muse skill, "Builds"): open the screenshots, compare them with the three leading products named in studio/design/direction.md (anything they all have that the app lacks is a gap), invite them to try what the cards in Human review describe (by name, in one line), tell the owner your verdict in two or three sentences, and turn your top changes into recommendations. Confirm each "Assumptions made" line with the owner as an assumed decision.`,
      );
    }
  } catch (e) {
    console.error("generate failed", e);
    await prisma.useCase.update({
      where: { id: useCaseId },
      data: { agentError: `Build: ${e instanceof Error ? e.message.slice(0, 400) : String(e)}` },
    });
  } finally {
    busy.delete(useCaseId);
    await prisma.useCase.update({ where: { id: useCaseId }, data: { generateBusy: false, generateStatus: "" } }).catch(() => {});
  }
}
