// Generate PRFAQ from your own words (Doug, Nov 21): the person talks as long as they like (and can add
// Word, PowerPoint or other documents), presses Generate PRFAQ, and gets an Amazon-style PRFAQ baseline. The
// format (its sections and what each holds) lives in the studio-prfaq skill, not in code; the content comes
// only from what they said and brought. The writer (a low-cost model) must give a verbatim quote for every
// statement; this file checks each quote really is in one of the sources, drops any statement whose quote
// isn't, links each kept line to where it came from, and marks every empty section as Missing. A later press
// can Reformat: the same sentences put back into the format, nothing added, reworded or lost. Plain code, no
// AI, so "only what they said" holds whatever the model does. Tested in tests/prfaq.test.mjs.

export type FormatSection = { key: string; title: string; holds: string };

/** The PRFAQ format from the skill's "## The format" table: | Key | Section | What it holds |. */
export function prfaqFormat(skillMd: string): FormatSection[] {
  const at = skillMd.search(/^## The format\s*$/m);
  if (at < 0) return [];
  const rest = skillMd.slice(at).split("\n").slice(1);
  const end = rest.findIndex((l) => /^## /.test(l));
  const rows = (end < 0 ? rest : rest.slice(0, end)).filter((l) => /^\s*\|/.test(l) && !/^[\s|:-]+$/.test(l));
  return rows
    .slice(1) // the header row
    .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((c) => c.length >= 3 && /^[a-z0-9-]+$/.test(c[0]))
    .map(([key, title, holds]) => ({ key, title, holds }));
}

export type DraftStatement = { question?: string; text: string; quote: string; from?: string };
export type DraftSection = { key: string; statements: DraftStatement[]; missing: string[] };
export type Draft = { sections: DraftSection[] };
/** Something the PRFAQ is written from: a talk (talk:<recording id>), a message (msg:<id>) or a document (doc:<id>). */
export type SourceText = { id: string; name: string; text: string };
/** Where one marker's words are: the quote and the source it is in. */
export type Source = { quote: string; from: string; name: string };

/** Words only, lower case: so a quote matches whatever punctuation, case or spacing the source had. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Whether a quote is really in a text (at least three words, verbatim apart from punctuation and case). */
export function quoteIn(text: string, quote: string): boolean {
  // Line markers ([^s3], [^m:<id>]) are not words: a line keeps its place whatever markers sit inside it.
  const bare = (t: string) => normalize(t.replace(/\[\^[^\]\s]+\]/g, " "));
  const q = bare(quote);
  if (q.split(" ").length < 3) return false;
  return ` ${bare(text)} `.includes(` ${q} `);
}

/** The source a quote is really in: the one the writer named if it holds it, else the first that does. */
export function sourceOf(sources: SourceText[], quote: string, named?: string): SourceText | null {
  const first = named ? sources.find((s) => s.id === named) : undefined;
  if (first && quoteIn(first.text, quote)) return first;
  return sources.find((s) => quoteIn(s.text, quote)) ?? null;
}

const QUOTE_SECTIONS = new Set(["leader-quote", "customer-quote"]);
const FAQ_SECTIONS = new Set(["customer-faq", "internal-faq"]);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const missingLine = (text: string) => `> **Missing:** ${oneLine(text).replace(/^missing:\s*/i, "")}`;
const MARKER = /\[\^((?:s\d+)|(?:m:[a-z0-9]{8,40}))\]/gi;

/**
 * The PRFAQ in Markdown from the writer's draft, in the skill's order.
 * - generate: every kept statement ends with a new marker [^s<n>]; `sources` maps it to the quote and where it is.
 * - reformat: a statement's text must itself be in the current PRFAQ (sources = [the PRFAQ]); it is kept as
 *   written, markers and all, and nothing new is marked. Lines of the old PRFAQ the draft didn't place go
 *   under the format's "other" section, so a Reformat never loses anything.
 * Statements that fail the check are dropped and counted; a section with nothing kept gets a Missing line.
 */
export type DraftMode = "generate" | "reformat" | "update";
export function draftMarkdown(draft: Draft, format: FormatSection[], sourceTexts: SourceText[], mode: DraftMode = "generate", previous = "") {
  // Update (Doug, Nov 21: "it takes the last one, takes the additional information, and it enhances it"):
  // lines from the PRFAQ as it stood (from "prfaq") are kept word for word with their markers, like Reformat;
  // new lines need a quote from the new material and get new markers after the ones already used.
  const keepsOld = mode !== "generate";
  const startAt = keepsOld ? Math.max(0, ...prfaqMarkers(previous).filter((k) => /^s\d+$/.test(k)).map((k) => Number(k.slice(1)))) : 0;
  const sources: Record<string, Source> = {};
  const byQuote = new Map<string, string>();
  let kept = 0;
  let dropped = 0;
  let missing = 0;
  const mark = (quote: string, src: SourceText) => {
    if (mode === "reformat" || src.id === "prfaq") return "";
    const k = normalize(quote);
    let id = byQuote.get(k);
    if (!id) {
      id = `s${startAt + byQuote.size + 1}`;
      byQuote.set(k, id);
      sources[id] = { quote: oneLine(quote), from: src.id, name: src.name };
    }
    return ` [^${id}]`;
  };
  type Kept = DraftStatement & { src: SourceText };
  const check = (s: DraftStatement): Kept | null => {
    if (!oneLine(s.text)) return null;
    // A kept line: its text itself is in the PRFAQ as it stood (markers and all).
    const old = keepsOld && (mode === "reformat" || s.from === "prfaq" || !s.quote.trim());
    const src = old ? sourceOf(sourceTexts.filter((x) => x.id === "prfaq"), s.text.replace(MARKER, " "), "prfaq") : sourceOf(sourceTexts.filter((x) => x.id !== "prfaq" || mode === "generate"), s.quote, s.from);
    return src ? { ...s, src } : null;
  };
  const placed: string[] = [];
  const shownGaps = new Set<string>();
  const out: string[] = [];
  for (const f of format) {
    const sec = draft.sections.find((s) => s.key === f.key) ?? { key: f.key, statements: [], missing: [] };
    let good = sec.statements.map(check).filter((s): s is Kept => !!s);
    dropped += sec.statements.length - good.length;
    // Reformat: what the draft didn't place anywhere goes under the "other" section, word for word.
    if (keepsOld && f.key === "other") {
      const left = previousLines(previous).filter((l) => !placed.some((p) => quoteIn(p, l)));
      good = [...good, ...left.map((l) => ({ text: l, quote: l, src: sourceTexts[0] }))];
    }
    good.forEach((s) => placed.push(s.text, s.question ?? ""));
    kept += good.length;
    const asked = sec.missing.map(oneLine).filter(Boolean);
    // The same gap is shown once, wherever it was first asked.
    const gaps = (f.key === "other" ? [] : good.length ? asked : asked.length ? asked : [f.holds]).filter((g) => !shownGaps.has(normalize(g)));
    gaps.forEach((g) => shownGaps.add(normalize(g)));
    missing += gaps.length;
    const line = (s: Kept) => `${oneLine(s.text)}${mark(s.quote, s.src)}`;
    const block: string[] = [];
    if (f.key === "headline") {
      if (good.length) block.push(`# ${line(good[0]).replace(/^#\s+/, "")}`);
      // A second headline line (an update that rewrote it) stays, so nothing is lost.
      good.slice(1).forEach((s) => block.push("", line(s)));
    } else if (f.key === "subheading") {
      if (good.length) block.push(`_${oneLine(good.map((s) => s.text.replace(MARKER, "").trim()).join(" ")).replace(/^_|_$/g, "")}_${good.map((s) => (s.src.id === "prfaq" ? [...s.text.matchAll(MARKER)].map((m) => ` ${m[0]}`).join("") : mark(s.quote, s.src))).join("")}`);
    } else {
      if (f.key !== "summary" && (good.length || gaps.length)) block.push(`## ${f.title}`);
      if (QUOTE_SECTIONS.has(f.key)) good.forEach((s) => block.push(`> ${line(s).replace(/^>\s*/, "")}`, ""));
      else if (FAQ_SECTIONS.has(f.key)) good.forEach((s) => (s.question ? block.push(`**Q:** ${oneLine(s.question).replace(/^\*\*Q:\*\*\s*/, "")}`, "", `**A:** ${line(s).replace(/^\*\*[QA]:\*\*\s*/, "")}`, "") : block.push(line(s), "")));
      else if (good.length) block.push(good.map(line).join(" "), "");
    }
    gaps.forEach((g) => block.push(missingLine(g), ""));
    while (block.length && block[block.length - 1] === "") block.pop();
    if (block.length) out.push(block.join("\n"), "");
  }
  return { markdown: `${out.join("\n").trim()}\n`, sources, kept, dropped, missing };
}

/** The content lines of a PRFAQ (the headline and FAQ questions, but no section headings, Missing lines or Q/A labels), for the no-loss check. */
export function previousLines(markdown: string) {
  return markdown
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .flatMap((p) => p.split("\n"))
    .map((l) => l.trim())
    .filter((l) => l && !/^#{2,6}\s/.test(l) && !/^>\s*\*\*Missing:\*\*/.test(l) && !/^---+$/.test(l))
    .map((l) => l.replace(/^#\s+/, "").replace(/^>\s*/, "").replace(/^\*\*[QA]:\*\*\s*/, "").replace(/^[-*]\s+/, "").replace(/^_(.*)_(\s*(\[\^[^\]]+\]\s*)*)$/, "$1$2").trim())
    .filter((l) => normalize(l.replace(MARKER, " ")).split(" ").length >= 3);
}

/** The markers in a PRFAQ: [^s3] (what it was generated from) and [^m:<message id>] (a person's later answer). */
export function prfaqMarkers(markdown: string) {
  return [...new Set([...markdown.matchAll(MARKER)].map((m) => m[1]))];
}

/** The Missing lines still in a PRFAQ. */
export function prfaqGaps(markdown: string) {
  return [...markdown.matchAll(/^>\s*\*\*Missing:\*\*\s*(.+)$/gm)].map((m) => m[1].trim());
}

/** For the package: markers become Markdown footnotes with the words they rest on. */
export function prfaqWithFootnotes(markdown: string, sources: Record<string, Source>, answers: Record<string, string> = {}) {
  const used = prfaqMarkers(markdown);
  if (!used.length) return markdown;
  const notes = used
    .map((k) => (k.startsWith("m:") ? (answers[k.slice(2)] ? `[^${k}]: Answer in the conversation: “${oneLine(answers[k.slice(2)])}”` : "") : sources[k] ? `[^${k}]: ${sources[k].name}: “${sources[k].quote}”` : ""))
    .filter(Boolean);
  return notes.length ? `${markdown.trimEnd()}\n\n---\n\n${notes.join("\n")}\n` : markdown;
}
