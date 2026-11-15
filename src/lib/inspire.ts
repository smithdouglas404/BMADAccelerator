import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authEnv, authOrder } from "@/lib/agent/auth";
import { agentModel } from "@/lib/docAgent";

// "Picture it": before BMAD starts, Claude looks at products like this one and brings back the
// features they usually have and three visual directions. The client clicks what they want, and
// that goes to Mary, John, Sally and Generate through bacc/intake.md.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const InspirationOptions = z.object({
  kind: z.string().describe("One plain sentence: what kind of product this is"),
  similar: z.array(z.object({ name: z.string(), what: z.string() })).describe("Up to 6 real products or sites like this one that you looked at"),
  nav: z.array(z.string()).describe("3 short menu labels this kind of site would have, e.g. Services, Prices, About"),
  primaryAction: z.string().describe("The main button label for this kind of site, 1 to 3 words, e.g. Book now"),
  features: z
    .array(
      z.object({
        id: z.string().describe("short-kebab-id"),
        name: z.string().describe("2 to 5 words"),
        description: z.string().describe("One plain sentence on what it does for the customer"),
        seenIn: z.string().describe("Which similar products have it, briefly"),
        recommended: z.boolean().describe("True when it fits what the client described"),
      }),
    )
    .describe("10 to 16 features products like this usually have"),
  directions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().describe("2 to 4 words"),
        mood: z.string().describe("One sentence: the feel and who it suits"),
        palette: z.object({ background: hex, surface: hex, text: hex, muted: hex, accent: hex, accent2: hex }),
        displayFont: z.string().describe("A Google Fonts family for headings"),
        bodyFont: z.string().describe("A Google Fonts family for body text"),
        radius: z.enum(["none", "small", "large"]),
        headline: z.string().describe("A sample home-page headline in this style, using the client's subject"),
        tagline: z.string().describe("One short supporting line"),
        signature: z.string().describe("The one memorable design detail"),
      }),
    )
    .describe("Exactly 3 clearly different visual directions"),
});
export type InspirationOptionsT = z.infer<typeof InspirationOptions>;

export type Inspiration = {
  status: "working" | "ready" | "failed";
  error?: string;
  options?: InspirationOptionsT;
  picks?: { features: string[]; direction: string; notes: string; skipped?: boolean };
};

function prompt(uc: { name: string; description: string; customer: string; problem: string }, docs: string) {
  return `A client is starting a new product with us. Research products like theirs and propose options they can click on.

The client's use case: ${uc.name}
What they said: ${uc.description || "(nothing yet)"}
${uc.customer ? `Who it is for: ${uc.customer}\n` : ""}${uc.problem ? `The problem: ${uc.problem}\n` : ""}${docs ? `Their documents, summarised:\n${docs}\n` : ""}
1. Use web search (a few searches, not many) to find real products, shops or apps doing what this client describes.
2. List the features those products usually have, in plain words a non-technical client understands. Mark the ones that fit what the client described as recommended. Don't invent features that only fit a different business.
3. Propose exactly three visual directions that are clearly different from each other, each grounded in the subject's own world (its materials, culture and customers). Avoid the generic AI look: no warm cream with terracotta, no near-black with one acid accent, no purple gradients, no identical rounded-card kits. Choose real Google Fonts families with distinct personalities, and palettes with enough contrast to read.

Answer only with the structured result.`;
}

async function research(text: string): Promise<InspirationOptionsT> {
  let lastError: unknown = null;
  for (const auth of authOrder()) {
    try {
      const q = query({
        prompt: text,
        options: {
          model: agentModel(),
          tools: ["WebSearch", "WebFetch"],
          allowedTools: ["WebSearch", "WebFetch"],
          maxTurns: 14,
          effort: "medium",
          persistSession: false,
          settingSources: [],
          outputFormat: { type: "json_schema", schema: z.toJSONSchema(InspirationOptions, { target: "draft-7" }) as Record<string, unknown> },
          env: authEnv(auth),
        },
      });
      for await (const m of q as AsyncIterable<SDKMessage>) {
        if (m.type === "result") {
          if (m.subtype !== "success") throw new Error(`research stopped: ${m.subtype}`);
          const r = InspirationOptions.safeParse(m.structured_output);
          if (!r.success) throw new Error("research returned an unexpected shape");
          return { ...r.data, directions: r.data.directions.slice(0, 3), features: r.data.features.slice(0, 16) };
        }
      }
      throw new Error("research ended without a result");
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Claude isn't set up");
}

const running = new Set<string>();

export async function startInspiration(useCaseId: string) {
  if (running.has(useCaseId)) return;
  running.add(useCaseId);
  try {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId }, include: { documents: true } });
    await save(useCaseId, { status: "working" });
    const docs = uc.documents
      .filter((d) => d.status !== "declined" && (d.summary || d.description))
      .map((d) => `- ${d.fileName}: ${(d.summary || d.description).slice(0, 600)}`)
      .join("\n");
    const options = await research(prompt(uc, docs));
    await save(useCaseId, { status: "ready", options });
  } catch (e) {
    console.error("inspiration", e);
    await save(useCaseId, { status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  } finally {
    running.delete(useCaseId);
  }
}

export async function save(useCaseId: string, value: Inspiration) {
  await prisma.useCase.update({ where: { id: useCaseId }, data: { inspiration: value as unknown as Prisma.InputJsonValue } });
}

/** The client's picks, written into intake.md for BMAD and Generate. */
export function inspirationMarkdown(raw: unknown) {
  const ins = raw as Inspiration | null;
  if (!ins?.picks || ins.picks.skipped || !ins.options) return "";
  const o = ins.options;
  const chosen = o.features.filter((f) => ins.picks!.features.includes(f.id));
  const left = o.features.filter((f) => !ins.picks!.features.includes(f.id));
  const d = o.directions.find((x) => x.id === ins.picks!.direction);
  return `## What they are picturing

Researched from similar products (${o.similar.map((s) => s.name).join(", ") || "none named"}): ${o.kind}

Features they want:
${chosen.map((f) => `- ${f.name}: ${f.description}`).join("\n") || "- (none picked)"}

Features they left out for now:
${left.map((f) => `- ${f.name}`).join("\n") || "- (none)"}

${
  d
    ? `The look they picked: **${d.name}**. ${d.mood}
- Palette: background ${d.palette.background}, surface ${d.palette.surface}, text ${d.palette.text}, muted ${d.palette.muted}, accent ${d.palette.accent}, second accent ${d.palette.accent2}
- Fonts: ${d.displayFont} for headings, ${d.bodyFont} for text; corners: ${d.radius}
- Signature detail: ${d.signature}
- Sample headline: "${d.headline}"`
    : "The look: they didn't pick one of the three directions."
}${ins.picks.notes ? `\n\nIn their words: ${ins.picks.notes}` : ""}

This is the client's starting direction for Sally's UX design and for Generate. Sally confirms or refines it; it is not a finished design.
`;
}
