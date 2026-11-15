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
        "Show which BMAD stage the work is in and which agent is working now.",
        { stage: z.enum(STAGE_KEYS), agent: z.enum(AGENT_KEYS) },
        async ({ stage, agent }) => {
          await prisma.useCase.update({ where: { id: useCaseId }, data: { stage, activeAgent: agent } });
          return ok();
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
        "Ask the person to sign off at a BMAD gate (PRFAQ verdict, PRD validation, architecture review, ticket breakdown approval, retrospective verdict). Their decision arrives as a message.",
        {
          gate: z.string().min(1),
          summary: z.string().min(1),
          document_path: z.string().default(""),
          agent: z.enum(AGENT_KEYS),
        },
        async ({ gate, summary, document_path, agent }) => {
          const a = AGENTS[agent as keyof typeof AGENTS];
          await prisma.reviewItem.create({
            data: {
              useCaseId,
              kind: "signoff",
              title: `Sign off: ${gate}`,
              detail: summary,
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
        "Show a document a BMAD skill wrote or updated in the person's Documents panel. Path relative to the project root.",
        { path: z.string().min(1), title: z.string().min(1), type: z.string().default("other"), summary: z.string().default("") },
        async (args) => {
          const abs = path.resolve(workspacePath(slug), args.path);
          if (!abs.startsWith(workspacePath(slug))) return ok("Path must be inside the project.");
          let size = 0;
          try {
            size = (await fs.stat(abs)).size;
          } catch {
            return ok("No file at that path yet.");
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
            approved: true,
            status: "approved",
          };
          if (existing) await prisma.document.update({ where: { id: existing.id }, data });
          else await prisma.document.create({ data: { useCaseId, storagePath: abs, ...data } });
          return ok();
        },
      ),
    ],
  });
}
