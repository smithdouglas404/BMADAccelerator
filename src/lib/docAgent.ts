import { promises as fs } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { convertToText } from "@/lib/provision";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { authEnv, authOrder, claudeConfigured, type Auth } from "@/lib/agent/auth";

/** Socra, its team and Claude Code. Sonnet: about half Opus's price, strong enough for planning and building. */
export const agentModel = () => process.env.BACC_MODEL || "claude-sonnet-5-5";
/** The document agent only reads and tags an upload, so the low-cost model is enough. */
export const docModel = () => process.env.BACC_DOC_MODEL || "claude-haiku-5-5";

const Suggestion = z.object({
  kind: z.enum(["interview", "research", "uploaded"]),
  description: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  insights: z.array(z.object({ insight: z.string(), confidence: z.enum(["high", "medium", "open"]), trace: z.string() })),
  contradictions: z.array(z.string()),
  questions: z.array(z.string()),
  requirements: z.array(z.object({ title: z.string(), why: z.string() })),
});

const MAX_CHARS = 400_000;

// The document agent: reads an upload and turns it into evidence. It suggests what kind of source it is,
// a one-line description, a short summary and tags, and the product signals it shows, each with a
// confidence and what it traces to. Evidence informs Socra; it never silently becomes a requirement.
export async function describeDocument(documentId: string) {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const textPath = doc.textPath || (await convertToText(doc.storagePath));
  if (textPath && !doc.textPath) await prisma.document.update({ where: { id: doc.id }, data: { textPath } });
  const noSummary = (why: string) => prisma.document.update({ where: { id: doc.id }, data: { summary: `No summary yet: ${why}` } });
  if (!textPath) return noSummary("this file type couldn't be read as text. Socra can still open it.");
  if (!claudeConfigured()) return noSummary("Claude isn't signed in, so the document agent can't run.");

  let text = await fs.readFile(textPath, "utf8");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);

  const prompt = `A product owner uploaded "${doc.fileName}" as evidence for a product they are shaping. Read it and give:
- kind: interview (a conversation with a customer or user), research (market, competitor or desk research), or uploaded (anything else: notes, decks, specs, brand guides).
- description: one plain sentence saying what kind of file this is and what it covers.
- summary: one or two short paragraphs in plain words: what it is, who wrote it or is in it, the main points, risks and open questions. Leave out anything the document doesn't say.
- tags: three to six short lowercase tags.
- contradictions: where the document disagrees with itself or with common practice in its field, one sentence each (empty if none).
- questions: questions the document raises that only the owner can answer, one sentence each, at most four.
- requirements: up to five potential requirements the document points to, each a short title and one sentence on why. These are suggestions for the owner, not decisions.
- insights: up to six product signals the document actually shows, each one sentence in plain words, with confidence (high: stated clearly or by several people; medium: stated once; open: hinted at), and trace: what part of the product it bears on (for example "Product promise", "Basket & checkout", "First customer"). Never invent a figure, quote or person.
${truncated ? "\nThe document is long; you are seeing the first part only.\n" : ""}
<document>
${text}
</document>`;

  let parsed: z.infer<typeof Suggestion> | null = null;
  for (const auth of authOrder()) {
    parsed = await (auth === "plan" ? suggestWithPlan(prompt) : suggestWithKey(prompt)).catch((e) => {
      console.error(`document agent (${auth})`, e);
      return null;
    });
    if (parsed) break;
  }
  if (!parsed) return noSummary("the document agent couldn't read this file. Upload it again to retry.");
  const s = parsed;
  await prisma.document.update({
    where: { id: doc.id },
    data: { kind: s.kind, description: doc.description || s.description, summary: s.summary, tags: doc.tags.length ? doc.tags : s.tags.slice(0, 6) },
  });
  // The placeholder card made at upload is replaced by what the document really shows.
  await prisma.evidence.deleteMany({ where: { documentId: doc.id } });
  for (const i of s.insights.slice(0, 6)) {
    await prisma.evidence.create({
      data: { useCaseId: doc.useCaseId, documentId: doc.id, source: doc.fileName, type: s.kind, insight: i.insight, confidence: i.confidence, trace: i.trace },
    });
  }
  for (const c of s.contradictions.slice(0, 3)) {
    await prisma.evidence.create({
      data: { useCaseId: doc.useCaseId, documentId: doc.id, source: doc.fileName, type: s.kind, insight: `Contradiction: ${c}`, confidence: "open", trace: "Needs the owner" },
    });
  }
  for (const q of s.questions.slice(0, 4)) {
    await prisma.evidence.create({
      data: { useCaseId: doc.useCaseId, documentId: doc.id, source: doc.fileName, type: s.kind, insight: `Question: ${q}`, confidence: "open", trace: "Open question" },
    });
  }
  // Potential requirements wait as suggestions: research never silently becomes a requirement.
  for (const r of s.requirements.slice(0, 5)) {
    const exists = await prisma.backlogItem.findFirst({ where: { useCaseId: doc.useCaseId, title: r.title } });
    if (exists) continue;
    await prisma.backlogItem.create({
      data: { useCaseId: doc.useCaseId, title: r.title, note: r.why, kind: "epic", group: "", source: `From ${doc.fileName}`, recKind: "consider", probe: `${doc.fileName} points to "${r.title}". Should it be part of the product?`, state: "suggested" },
    });
  }
}

/** The API key path: one Messages API call with a structured answer. */
async function suggestWithKey(prompt: string) {
  const response = await new Anthropic().messages.parse({
    model: docModel(),
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(Suggestion) },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}

/** The plan path: the same request through Claude Code signed in with the owner's subscription, no tools. */
async function suggestWithPlan(prompt: string, auth: Auth = "plan") {
  const q = query({
    prompt,
    options: {
      model: docModel(),
      tools: [],
      maxTurns: 3,
      effort: "low",
      persistSession: false,
      settingSources: [],
      outputFormat: { type: "json_schema", schema: z.toJSONSchema(Suggestion, { target: "draft-7" }) as Record<string, unknown> },
      env: authEnv(auth),
    },
  });
  for await (const m of q as AsyncIterable<SDKMessage>) {
    if (m.type === "result") {
      if (m.subtype !== "success") throw new Error(`document agent stopped: ${m.subtype}`);
      const r = Suggestion.safeParse(m.structured_output);
      return r.success ? r.data : null;
    }
  }
  return null;
}

const Cleaned = z.object({ text: z.string() });

/**
 * Spoken words as clean natural language: fillers, false starts and repeats out, punctuation in, the
 * speaker's meaning and wording otherwise kept. The low-cost model does it when Claude is signed in; the
 * plain clean-up (tidySpeech) is the floor and the fallback. The words as spoken are kept separately.
 */
export async function cleanSpeech(raw: string): Promise<string> {
  const { tidySpeech } = await import("@/lib/studio/core");
  const floor = tidySpeech(raw);
  if (!claudeConfigured() || raw.trim().split(/\s+/).length < 6) return floor;
  const prompt = `Rewrite this spoken note as clean written language. Remove fillers (um, uh, you know, like), false starts and repeated words; add punctuation and paragraph breaks. Keep the speaker's meaning, their own words and their first person. Do not add, summarise, answer or reorder anything. Return only the text.\n\n<spoken>\n${raw.slice(0, 30000)}\n</spoken>`;
  for (const auth of authOrder()) {
    try {
      if (auth === "plan") {
        const q = query({
          prompt,
          options: { model: docModel(), tools: [], maxTurns: 2, effort: "low", persistSession: false, settingSources: [], outputFormat: { type: "json_schema", schema: z.toJSONSchema(Cleaned, { target: "draft-7" }) as Record<string, unknown> }, env: authEnv(auth) },
        });
        for await (const m of q as AsyncIterable<SDKMessage>) {
          if (m.type === "result" && m.subtype === "success") {
            const r = Cleaned.safeParse(m.structured_output);
            if (r.success && r.data.text.trim()) return r.data.text.trim();
          }
        }
      } else {
        const response = await new Anthropic().messages.parse({ model: docModel(), max_tokens: 8000, output_config: { effort: "low", format: zodOutputFormat(Cleaned) }, messages: [{ role: "user", content: prompt }] });
        const t = response.parsed_output?.text?.trim();
        if (t) return t;
      }
    } catch (e) {
      console.error(`speech clean-up (${auth})`, e);
    }
  }
  return floor;
}

/**
 * One structured answer from the document model (Haiku by default), on the plan first and the key
 * second, like the document agent. Returns which sign-in answered, or null when none could.
 */
export async function askDocModel<T>(prompt: string, schema: z.ZodType<T>, maxTokens = 4000): Promise<{ data: T; auth: Auth; model: string } | null> {
  for (const auth of authOrder()) {
    try {
      if (auth === "plan") {
        const q = query({
          prompt,
          options: { model: docModel(), tools: [], maxTurns: 3, effort: "low", persistSession: false, settingSources: [], outputFormat: { type: "json_schema", schema: z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown> }, env: authEnv(auth) },
        });
        for await (const m of q as AsyncIterable<SDKMessage>) {
          if (m.type === "result") {
            if (m.subtype !== "success") throw new Error(`document model stopped: ${m.subtype}`);
            const r = schema.safeParse(m.structured_output);
            if (r.success) return { data: r.data, auth, model: docModel() };
          }
        }
      } else {
        const response = await new Anthropic().messages.parse({ model: docModel(), max_tokens: maxTokens, output_config: { effort: "low", format: zodOutputFormat(schema) }, messages: [{ role: "user", content: prompt }] });
        if (response.parsed_output) return { data: response.parsed_output as T, auth, model: docModel() };
      }
    } catch (e) {
      console.error(`document model (${auth})`, e);
    }
  }
  return null;
}
