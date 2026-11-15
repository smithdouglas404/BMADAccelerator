import { promises as fs } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BMAD_DOC_TYPES } from "@/lib/bmad";
import { convertToText } from "@/lib/provision";

export const MODEL = process.env.BACC_MODEL || "claude-opus-5-5";

const Suggestion = z.object({
  bmadType: z.enum(BMAD_DOC_TYPES.map((t) => t.key) as [string, ...string[]]),
  description: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
});

const MAX_CHARS = 400_000;

// The document agent: reads an upload's text and suggests its BMAD type, a one-line
// description, a short summary and tags. The person approves or edits them.
export async function describeDocument(documentId: string) {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const textPath = doc.textPath || (await convertToText(doc.storagePath));
  if (textPath && !doc.textPath) await prisma.document.update({ where: { id: doc.id }, data: { textPath } });
  if (!process.env.ANTHROPIC_API_KEY || !textPath) return;

  let text = await fs.readFile(textPath, "utf8");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  const types = BMAD_DOC_TYPES.map((t) => `- ${t.key}: ${t.label}`).join("\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Suggestion) },
    messages: [
      {
        role: "user",
        content: `A business user uploaded "${doc.fileName}" to plan a software pilot with the BMAD Method. Read it and suggest:
- bmadType: which kind of BMAD input it is, one of:
${types}
- description: one plain sentence saying what the document covers.
- summary: three to five plain sentences with what matters for planning the pilot.
- tags: three to six short lowercase tags.
${truncated ? "\nThe document is long; you are seeing the first part only.\n" : ""}
<document>
${text}
</document>`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return;
  const s = response.parsed_output;
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      bmadType: s.bmadType,
      description: doc.description || s.description,
      summary: s.summary,
      tags: doc.tags.length ? doc.tags : s.tags.slice(0, 6),
    },
  });
  const label = BMAD_DOC_TYPES.find((t) => t.key === s.bmadType)?.label ?? s.bmadType;
  await prisma.reviewItem.updateMany({
    where: { targetId: doc.id, kind: "document", status: "open" },
    data: { detail: `Suggested type: ${label}. ${s.description} Check the summary and tags, then approve.` },
  });
}
