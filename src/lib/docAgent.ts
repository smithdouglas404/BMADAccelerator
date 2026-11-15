import { promises as fs } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AGENTS, BMAD_DOC_TYPES, DOC_STAGES, ROUTABLE_AGENTS } from "@/lib/bmad";
import { convertToText } from "@/lib/provision";

/** The BMAD role agents and Generate. Sonnet: about half Opus's price, strong enough for planning and building. */
export const MODEL = process.env.BACC_MODEL || "claude-sonnet-5-5";
/** The document agent only reads and tags an upload, so the low-cost model is enough. */
export const DOC_MODEL = process.env.BACC_DOC_MODEL || "claude-haiku-5-5";

const Suggestion = z.object({
  bmadType: z.enum(BMAD_DOC_TYPES.map((t) => t.key) as [string, ...string[]]),
  description: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  agents: z.array(z.object({ agent: z.enum(ROUTABLE_AGENTS), why: z.string() })),
});

const MAX_CHARS = 400_000;

// The document agent: reads an upload's text and suggests its BMAD type, a one-line
// description, a short summary and tags. The person approves or edits them.
export async function describeDocument(documentId: string) {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const textPath = doc.textPath || (await convertToText(doc.storagePath));
  if (textPath && !doc.textPath) await prisma.document.update({ where: { id: doc.id }, data: { textPath } });
  const noSummary = (why: string) => prisma.document.update({ where: { id: doc.id }, data: { summary: `No summary yet: ${why}` } });
  if (!textPath) return noSummary("this file type couldn't be read as text. Add a one-line description yourself.");
  if (!process.env.ANTHROPIC_API_KEY) return noSummary("the Anthropic key isn't set, so the document agent can't run.");

  let text = await fs.readFile(textPath, "utf8");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  const types = BMAD_DOC_TYPES.map((t) => `- ${t.key}: ${t.label}`).join("\n");

  const client = new Anthropic();
  const response = await client.messages
    .parse({
    model: DOC_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(Suggestion) },
    messages: [
      {
        role: "user",
        content: `A business user uploaded "${doc.fileName}" to plan a software pilot with the BMAD Method. Read it and suggest:
- bmadType: which kind of BMAD input it is, one of:
${types}
- description: one plain sentence saying what kind of file this is and what it covers (for example "A 12-slide sales deck describing the new onboarding offer").
- summary: a narrative of one or two short paragraphs, in plain words for a non-technical reader. Cover what the document is, who it is for or who wrote it, the main points, any issues, risks or open questions it raises, and the outcomes or decisions it points to. Leave out anything the document doesn't say.
- tags: three to six short lowercase tags a business person would use (topics, teams, systems).
- agents: every BMAD agent this document matters to, most important first, each with one plain sentence on what they will use from it. A document that covers several areas goes to several agents. The agents:
  - analyst (Mary): the business problem, market, customers, goals and the product brief.
  - pm (John): product requirements (PRD): features, scope, priorities, success measures.
  - ux (Sally): screens, flows, look and feel, brand, content.
  - architect (Winston): systems, data, integrations, AI or technical choices, security.
  - po (Sofia): epics, stories and the backlog.
  - dev (Amelia): code, technical setup and tests.
${truncated ? "\nThe document is long; you are seeing the first part only.\n" : ""}
<document>
${text}
</document>`,
      },
    ],
  })
    .catch(async (e) => {
      console.error("document agent", e);
      await noSummary("the document agent hit an error. Upload it again to retry.");
      return null;
    });
  if (!response) return;
  if (response.stop_reason === "refusal" || !response.parsed_output) return noSummary("the document agent couldn't summarize this file.");
  const s = response.parsed_output;
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      bmadType: s.bmadType,
      description: doc.description || s.description,
      summary: s.summary,
      tags: doc.tags.length ? doc.tags : s.tags.slice(0, 6),
      routing: s.agents.filter((a, i, all) => all.findIndex((b) => b.agent === a.agent) === i),
    },
  });
  const label = BMAD_DOC_TYPES.find((t) => t.key === s.bmadType)?.label ?? s.bmadType;
  await prisma.reviewItem.updateMany({
    where: { targetId: doc.id, kind: "document", status: "open" },
    data: {
      detail: `For: ${DOC_STAGES.find((x) => x.key === doc.stage)?.label ?? "General (any stage)"}. Suggested type: ${label}. ${s.description} Goes to ${s.agents.map((a) => AGENTS[a.agent].name).join(", ") || "the concierge"}. Read the summary, then approve it so BMAD uses it, or decline it.`,
    },
  });
}
