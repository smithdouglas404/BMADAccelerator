import path from "path";
import { promises as fs } from "fs";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AGENTS, type StageKey } from "@/lib/bmad";
import { workspacePath } from "@/lib/workspace";
import { askQuestion } from "@/lib/questions";
import { formatHits, letta, rememberAnswer, rememberLesson, searchMemory } from "@/lib/memory";
import { ROLES } from "@/lib/memory/lettaCore";
import { IMAGE_LIMIT, imagesConfigured, makeImage } from "@/lib/images";
import {
  AGENTIC_MAP,
  OPTIONS_CATALOGUE,
  PICKS_FILE,
  adviceFileName,
  adviceMarkdown,
  catalogueProblems,
  mustReview,
  picksMarkdown,
  resolvePicks,
  signoffReviewProblem,
  stageGateBlock,
  conceptProblems,
  DESIGN_CONCEPT,
  gapsProblem,
} from "./advisorGates";

const AGENT_KEYS = Object.keys(AGENTS) as [string, ...string[]];
const ROLE_KEYS = ROLES.map((r) => r.key) as [string, ...string[]];
const STAGE_KEYS = ["clarify", "plan", "build", "learn"] as [StageKey, ...StageKey[]];

function ok(text = "ok") {
  return { content: [{ type: "text" as const, text }] };
}

export type RunTally = { spoke: number };

// What the agents can do in the accelerator's UI. Everything else they do inside
// BMAD's own skills and files.
export function baccTools(useCaseId: string, slug: string, tally: RunTally) {
  const speak = async (agent: string, content: string) => {
    tally.spoke++;
    await prisma.message.create({
      data: { useCaseId, role: agent === "concierge" ? "concierge" : "bmad-agent", agent, content },
    });
    await prisma.useCase.update({ where: { id: useCaseId }, data: { activeAgent: agent } });
  };

  const advisorDir = workspacePath(slug, "bacc", "advisor");
  const advisedFor = async (agent: string) => {
    try {
      return (await fs.readdir(advisorDir)).some((f) => f.startsWith(`${agent}-`));
    } catch {
      return false;
    }
  };
  const fileExists = (p: string) =>
    fs.access(p).then(
      () => true,
      () => false,
    );

  let imagesMade = 0;
  return createSdkMcpServer({
    name: "bacc",
    version: "1.0.0",
    tools: [
      tool(
        "make_image",
        `Generate only: create one AI image (product shot, hero, illustration) for the app with OpenAI's image model and save it under app/. Costs a few cents, so use it for the images that carry the design, at most ${IMAGE_LIMIT} per run; draw icons and simple shapes as SVG instead. Describe the subject, style, lighting and background in the prompt, consistent with bacc/design/direction.md. Never depict real people or brands.`,
        {
          prompt: z.string().min(10).max(4000),
          size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
          file: z.string().min(1).describe("Path inside app/, for example app/public/images/mars-box.webp"),
        },
        async ({ prompt, size, file }) => {
          if (!imagesConfigured()) return ok("Image generation is not set up here. Draw this as SVG instead.");
          if (imagesMade >= IMAGE_LIMIT) return ok(`The limit of ${IMAGE_LIMIT} images for this run is reached. Reuse an image or draw SVG.`);
          const appRoot = workspacePath(slug, "app");
          const target = path.resolve(workspacePath(slug), file);
          if (!target.startsWith(appRoot + path.sep)) return ok("The file must be inside app/.");
          try {
            imagesMade++;
            const model = await makeImage(prompt, size, target);
            return ok(`Saved ${path.relative(workspacePath(slug), target)} (${model}). Open it with Read to check it.`);
          } catch (e) {
            return ok(`${e instanceof Error ? e.message : String(e)}. Draw this as SVG instead.`);
          }
        },
      ),
      tool(
        "say",
        "Show a message to the person in the conversation, in the name of the agent speaking. The only way the person sees anything you write.",
        { agent: z.enum(AGENT_KEYS), text: z.string().min(1) },
        async ({ agent, text }) => {
          await speak(agent, text);
          return ok();
        },
      ),
      tool(
        "ask",
        "Ask the person ONE question in plain language, in the name of the agent that needs the answer. Questions are shown one at a time in the order asked; if another question is already waiting for an answer, this one waits in line and is shown automatically next. The answer arrives as a later message naming the question.",
        {
          agent: z.enum(AGENT_KEYS),
          question: z.string().min(1),
          explanation: z.string().default(""),
        },
        async ({ agent, question, explanation }) => {
          tally.spoke++;
          const shown = await askQuestion(useCaseId, agent, question, explanation);
          return ok(
            shown
              ? "Asked. Wait for the answer before acting on this question."
              : "Another question is already waiting for the client, so this one is queued and will be shown next. Carry on with other work or end your turn.",
          );
        },
      ),
      tool(
        "set_stage",
        "Show which BMAD stage the work is in and which agent is working now. Handing over to a BMAD agent needs your expert advice for it first (mcp__bacc__advise), Sally also needs bacc/design/concept.md, Sally also needs the options catalogue bacc/design/options.md, and Winston (architect) needs bacc/advisor/agentic-map.md (bacc-agentic-advisor skill); otherwise this refuses and says what to do.",
        { stage: z.enum(STAGE_KEYS), agent: z.enum(AGENT_KEYS) },
        async ({ stage, agent }) => {
          const block = stageGateBlock({
            agent,
            advised: await advisedFor(agent),
            conceptExists: await fileExists(workspacePath(slug, "bacc", "design", "concept.md")),
            agenticMapExists: await fileExists(workspacePath(slug, AGENTIC_MAP)),
            optionsExists: await fileExists(workspacePath(slug, OPTIONS_CATALOGUE)),
          });
          if (block) return ok(block);
          await prisma.useCase.update({ where: { id: useCaseId }, data: { stage, activeAgent: agent } });
          return ok();
        },
      ),
      tool(
        "advise",
        "Record your expert advice (bacc-expert-advisor skill) for a BMAD agent before it starts, or for Generate after a build: two or three specific ideas, each with why and where it comes from (the client's words, intake, a requirement, a similar product, an earlier use case), and what's missing: at least three questions about things this kind of product needs that nobody has asked yet. Saved in bacc/advisor/. Offer the best ones to the client yourself with ask.",
        {
          for_agent: z.enum(AGENT_KEYS),
          ideas: z
            .array(z.object({ idea: z.string().min(10), why: z.string().min(10), source: z.string().min(3) }))
            .min(1)
            .max(6),
          gaps: z
            .array(z.object({ question: z.string().min(10), why: z.string().min(10) }))
            .max(12)
            .default([])
            .describe("What's missing: questions about things this kind of product needs that the documents and BMAD's own questions haven't covered."),
          no_gaps_reason: z.string().default("").describe("Only when gaps is empty: what you compared against and why nothing is missing."),
        },
        async ({ for_agent, ideas, gaps, no_gaps_reason }) => {
          const problem = gapsProblem(for_agent, gaps, no_gaps_reason);
          if (problem) return ok(problem);
          const when = new Date();
          await fs.mkdir(advisorDir, { recursive: true });
          await fs.writeFile(path.join(advisorDir, adviceFileName(for_agent, when)), adviceMarkdown(for_agent, ideas, when, gaps, no_gaps_reason));
          return ok(
            gaps.length
              ? "Saved. Ask the client the missing-piece questions with ask, one at a time, most important first, then offer your best one or two ideas. Pass their answers and what they accept to the agent as their input."
              : "Saved. Offer the best one or two to the client with ask, then pass what they accept to the agent as their input.",
          );
        },
      ),
      tool(
        "record_picks",
        "Record the option numbers the client picked from the options catalogue (bacc/design/options.md), with their own words. Only numbers the client said themselves; never pick for them. Saved in bacc/design/picks.md, which Sally and Generate follow.",
        {
          codes: z.array(z.number().int().positive()).min(1),
          client_words: z.string().min(1),
        },
        async ({ codes, client_words }) => {
          const md = await fs.readFile(workspacePath(slug, OPTIONS_CATALOGUE), "utf8").catch(() => "");
          if (!md) return ok(`There is no ${OPTIONS_CATALOGUE} yet. Write it first (bacc-expert-advisor skill, section 2a).`);
          const { picked, unknown } = resolvePicks(codes, md);
          if (unknown.length)
            return ok(`Not recorded: ${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not a current option in the catalogue. Ask the client which option they meant.`);
          const file = workspacePath(slug, PICKS_FILE);
          const head = (await fileExists(file)) ? "" : "# Client's picks from the options catalogue\n\nNewest last. Sally designs with these; Generate builds them.\n";
          await fs.appendFile(file, head + picksMarkdown(picked, client_words, new Date()));
          return ok(`Recorded: ${picked.map((p) => `${p.code} ${p.name}`).join("; ")}. Pass them to Sally as the client's input.`);
        },
      ),
      tool(
        "add_review",
        "Put an item in the person's review queue without blocking the conversation: an assumption you made, an open question, or a ticket's unknown.",
        {
          kind: z.enum(["assumption", "question", "unknown"]),
          title: z.string().min(1),
          detail: z.string().default(""),
          reason: z.string().default(""),
          agent: z.enum(AGENT_KEYS).default("concierge"),
        },
        async ({ kind, title, detail, reason, agent }) => {
          const a = AGENTS[agent as keyof typeof AGENTS];
          await prisma.reviewItem.create({
            data: { useCaseId, kind, title, detail, reason, source: `${a.name}, ${a.role}` },
          });
          return ok();
        },
      ),
      tool(
        "request_signoff",
        "Ask the person to sign off at a BMAD gate (PRFAQ verdict, PRD validation, architecture review, ticket breakdown approval, retrospective verdict). advisor_review is your own expert view of the document (bacc-expert-advisor skill, section 3), shown on the card. Their decision arrives as a message.",
        {
          gate: z.string().min(1),
          summary: z.string().min(1),
          document_path: z.string().default(""),
          agent: z.enum(AGENT_KEYS),
          advisor_review: z.string().min(1),
        },
        async ({ gate, summary, document_path, agent, advisor_review }) => {
          const problem = signoffReviewProblem(advisor_review);
          if (problem) return ok(`Not sent. ${problem}`);
          const a = AGENTS[agent as keyof typeof AGENTS];
          await prisma.reviewItem.create({
            data: {
              useCaseId,
              kind: "signoff",
              title: `Sign off: ${gate}`,
              detail: `${summary}\n\nYour advisor's view: ${advisor_review.trim()}`,
              reason: "BMAD waits for your decision at this gate.",
              source: `${a.name}, ${a.role}`,
              targetId: document_path,
            },
          });
          return ok();
        },
      ),
      tool(
        "link_feedback",
        "After Sofia turns a piece of screen feedback (F1, F2...) into a ticket, record which ticket it became and, when it changes an earlier requirement, which ticket that was. The board then shows the link both ways.",
        { feedback_ref: z.string().min(1), ticket_ref: z.string().min(1), changes_ref: z.string().default("") },
        async ({ feedback_ref, ticket_ref, changes_ref }) => {
          const r = await prisma.feedback.updateMany({
            where: { useCaseId, ticketRef: feedback_ref },
            data: { becameRef: ticket_ref, changesRef: changes_ref },
          });
          if (!r.count) return ok(`No feedback ${feedback_ref}.`);
          return ok();
        },
      ),
      tool(
        "search_memory",
        "Search the accelerator's long-term memory (Mem0) across every earlier use case: decisions, answered questions, lessons, screen feedback and builds. This use case's own memories are left out (its BMAD files hold them).",
        {
          query: z.string().min(1),
          role: z.enum(ROLE_KEYS).optional(),
          kind: z.enum(["decision", "qa", "lesson", "requirement", "run_summary"]).optional(),
        },
        async ({ query, role, kind }) => {
          const hits = await searchMemory(query, { role, kinds: kind ? [kind] : undefined, excludeUseCase: useCaseId, limit: 8 });
          return ok(hits.length ? formatHits(hits) : "Nothing in memory from earlier use cases matches.");
        },
      ),
      tool(
        "ask_role_memory",
        "Ask a BMAD role's Letta agent what it remembers across earlier use cases (for example how similar pilots were scoped). It answers from its lessons and Mem0. Slow (it thinks); use it for real questions, not routine steps.",
        { role: z.enum(ROLE_KEYS), question: z.string().min(1), agent: z.enum(AGENT_KEYS) },
        async ({ role, question, agent }) => {
          const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
          const asker = AGENTS[agent as keyof typeof AGENTS];
          const context = formatHits(await searchMemory(question, { role, excludeUseCase: useCaseId, limit: 5 }));
          const answer = await letta.askRole(role, `${question}\n\n(Asked from the use case "${uc.name}".)`, `${asker?.name ?? agent} (${asker?.role ?? ""})`, context).catch((e) => {
            console.warn("ask_role_memory failed", e);
            return null;
          });
          if (!answer) return ok("That role's memory is not available right now. Carry on without it.");
          rememberAnswer(uc, role, `[asked by ${asker?.name ?? agent}] ${question}`, answer);
          return ok(answer);
        },
      ),
      tool(
        "save_lesson",
        "Save a general lesson from this use case that would help a future, similar one, in the owning BMAD agent's name. No client names, prices or private details.",
        { agent: z.enum(ROLE_KEYS), lesson: z.string().min(10), confidence: z.number().min(0).max(1).default(0.7) },
        async ({ agent, lesson, confidence }) => {
          const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
          rememberLesson(uc, agent, lesson, confidence);
          return ok("Saved.");
        },
      ),
      tool(
        "register_document",
        "Show a document a BMAD skill wrote or updated in the person's Documents panel. Path relative to the project root. Set review true when the person must approve it (for example the component list); their decision arrives as a message.",
        {
          path: z.string().min(1),
          title: z.string().min(1),
          type: z.string().default("other"),
          summary: z.string().default(""),
          review: z.boolean().default(false),
        },
        async (args) => {
          const abs = path.resolve(workspacePath(slug), args.path);
          if (!abs.startsWith(workspacePath(slug))) return ok("Path must be inside the project.");
          let size = 0;
          try {
            size = (await fs.stat(abs)).size;
          } catch {
            return ok("No file at that path yet.");
          }
          // The design concept, component list, agentic map and options catalogue always go to the client for approval.
          const rel = path.relative(workspacePath(slug), abs).replace(/\\/g, "/");
          if (mustReview(rel)) args.review = true;
          // The options catalogue's code numbers never change meaning once the client has seen them.
          const lastCatalogue = workspacePath(slug, "bacc", "design", ".options-registered.md");
          if (rel === DESIGN_CONCEPT) {
            const problem = conceptProblems(await fs.readFile(abs, "utf8"));
            if (problem) return ok(`${problem} Fix the file, then register it again.`);
          }
          if (rel === OPTIONS_CATALOGUE) {
            const problem = catalogueProblems(await fs.readFile(abs, "utf8"), await fs.readFile(lastCatalogue, "utf8").catch(() => ""));
            if (problem) return ok(`${problem} Fix the file, then register it again.`);
            await fs.copyFile(abs, lastCatalogue);
          }
          const existing = await prisma.document.findFirst({ where: { useCaseId, storagePath: abs } });
          const data = {
            fileName: args.title,
            mimeType: "text/markdown",
            sizeBytes: size,
            bmadType: args.type,
            summary: args.summary,
            description: args.summary.split(". ")[0] ?? "",
            origin: "bmad",
            textPath: abs,
            approved: !args.review,
            status: args.review ? "in_review" : "approved",
          };
          const doc = existing
            ? await prisma.document.update({ where: { id: existing.id }, data })
            : await prisma.document.create({ data: { useCaseId, storagePath: abs, ...data } });
          if (args.review) {
            await prisma.reviewItem.updateMany({
              where: { useCaseId, targetId: doc.id, kind: "document", status: "open" },
              data: { status: "dismissed", answer: "Replaced by a newer version", resolvedAt: new Date() },
            });
            await prisma.reviewItem.create({
              data: {
                useCaseId,
                kind: "document",
                title: `Approve "${args.title}"`,
                detail: args.summary || "Read it, then approve it or decline it with a note.",
                reason: "Needs your approval",
                source: "BMAD",
                targetId: doc.id,
              },
            });
            return ok("Shown for approval. The decision arrives as a message.");
          }
          return ok();
        },
      ),
    ],
  });
}
