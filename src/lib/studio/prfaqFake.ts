// A scripted stand-in for the PRFAQ writer, used only by the sandbox check and automated tests
// (BACC_FAKE_AGENT=1 with no Claude sign-in), like src/lib/agent/fake.ts. It copies sentences as they were
// said into sections by a few word rules; it never writes anything of its own. The real writer is the
// low-cost model with the studio-prfaq skill.
import { previousLines, type Draft, type FormatSection, type SourceText } from "./prfaqDraft";

const RULES: [string, RegExp][] = [
  ["why-us", /\b(unlike|different|only one|nobody else|competitor|instead of)\b/i],
  ["problem", /\b(waste|hard|slow|today|problem|pain|by hand|manual|lose|struggle|frustrat|spend)\w*/i],
  ["how-it-works", /\b(start|first|sign up|open|tap|talk into|install)\w*/i],
  ["internal-faq", /\b(pilot|cost|budget|risk|data|measure|metric|integrat|security)\w*/i],
  ["solution", /\b(want|will|let|so that|automatic|just|done)\w*/i],
];

const sentences = (t: string) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.replace(/^(so|um|uh|and|well),?\s+/i, "").trim()).filter((s) => s.split(" ").length >= 5);

export function fakePrfaqDraft(format: FormatSection[], sources: SourceText[], mode: "generate" | "reformat" | "update", previous: string): Draft {
  const sections = new Map(format.map((f) => [f.key, { key: f.key, statements: [] as Draft["sections"][number]["statements"], missing: [] as string[] }]));
  const put = (key: string, text: string, quote: string, from: string) => sections.get(key)?.statements.push({ question: "", text, quote, from });
  if (mode !== "generate") {
    let key = "summary";
    let question = "";
    for (const block of previous.split("\n")) {
      const h = block.match(/^(#{1,6})\s+(.*)$/);
      if (h && h[1].length === 1) { put("headline", h[2], "", "prfaq"); continue }
      if (h) { key = format.find((f) => f.title.toLowerCase() === h[2].trim().toLowerCase())?.key ?? "other"; continue }
      const gap = block.match(/^>\s*\*\*Missing:\*\*\s*(.+)$/);
      if (gap) { sections.get(key)?.missing.push(gap[1]); continue }
      const q = block.match(/^\*\*Q:\*\*\s*(.+)$/);
      if (q) { question = q[1]; continue }
      for (const l of previousLines(block)) { put(key, l, "", "prfaq"); if (question) { const st = sections.get(key)?.statements; if (st?.length) st[st.length - 1].question = question; question = "" } }
    }
  }
  if (mode === "update") {
    for (const src of sources.filter((x) => x.id !== "prfaq"))
      for (const t of sentences(src.text)) {
        const key = RULES.find(([, re]) => re.test(t))?.[0] ?? "summary";
        if (key === "internal-faq") continue;
        put(key, t, t, src.id);
        // The stand-in's new line answers that section's gap.
        const sec = sections.get(key);
        if (sec) sec.missing = [];
      }
  } else if (mode === "generate") {
    const all = sources.filter((s) => s.id !== "prfaq").flatMap((s) => sentences(s.text).map((t) => ({ t, from: s.id })));
    const used = new Set<string>();
    for (const { t, from } of all) {
      const key = RULES.find(([, re]) => re.test(t))?.[0] ?? "summary";
      if (key === "internal-faq") continue; // the stand-in writes no questions of its own
      put(key, t, t, from);
      used.add(t);
    }
    const head = all.filter((x) => /\b(want|will|done|let)\w*/i.test(x.t)).sort((a, b) => a.t.length - b.t.length)[0];
    if (head) put("headline", head.t.replace(/[.!?]$/, ""), head.t, head.from);
  }
  return { sections: [...sections.values()] };
}
