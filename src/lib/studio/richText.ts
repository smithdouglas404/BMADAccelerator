// One place that turns a raw string (agent notes, answers, lessons, memory blocks, skill text, logs) into structure the
// screens can render legibly (Doug, Nov 21: "format it so it's readable, not jumbled together, for every single thing").
// Pure and data-driven: it only re-shapes the text it is given; it never adds, drops or invents words.

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "pairs"; rows: { key: string; value: string }[] }
  | { kind: "code"; text: string };

const BULLET = /^\s*(?:[-*•–]|\d+[.)])\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*(#{1,4})\s+(.*\S)\s*$|^\s*\*\*([^*]{1,80})\*\*:?\s*$/;
// "Key: value" with a short, plain key (letters, digits, spaces, _ - /), so ordinary sentences with a colon stay prose.
const PAIR = /^\s*([A-Za-z][\w /-]{0,31}?)\s*[:=]\s+(\S.*)$/;

/** A run-on like "- Use plain words. - Ask the owner first. - Never guess" becomes one line per item. */
function splitRunOn(text: string): string {
  return text.split("\n").map((line) => {
    const marks = line.match(/(?:^|\s)[-•]\s+(?=\S)/g) ?? [];
    if (marks.length < 2) return line;
    return line.replace(/\s+([-•])\s+(?=\S)/g, "\n$1 ").replace(/^\s+/, "");
  }).join("\n");
}

/** A string that is really JSON becomes rows (flat object) or an indented code block. */
function fromJson(text: string): Block[] | null {
  const t = text.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    const v = JSON.parse(t);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length > 0 && entries.every(([, x]) => x === null || ["string", "number", "boolean"].includes(typeof x))) {
        return [{ kind: "pairs", rows: entries.map(([key, value]) => ({ key: humanKey(key), value: String(value ?? "—") })) }];
      }
    }
    return [{ kind: "code", text: JSON.stringify(v, null, 2) }];
  } catch {
    return null;
  }
}

/** "lastReadAt" and "last_read_at" both read as "Last read at". */
export function humanKey(k: string): string {
  const s = k.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseRich(input: string | null | undefined): Block[] {
  const raw = (input ?? "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return [];
  const json = fromJson(raw);
  if (json) return json;
  const blocks: Block[] = [];
  for (const chunk of splitRunOn(raw).split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const h = line.match(HEADING);
      if (h) { blocks.push({ kind: "heading", text: (h[2] ?? h[3]).trim() }); i++; continue; }
      if (BULLET.test(line)) {
        const ordered = ORDERED.test(line);
        const items: string[] = [];
        while (i < lines.length && BULLET.test(lines[i])) { items.push(lines[i].replace(BULLET, "").trim()); i++; }
        blocks.push({ kind: "list", ordered, items });
        continue;
      }
      if (PAIR.test(line) && !/^https?:/i.test(line.trim())) {
        const rows: { key: string; value: string }[] = [];
        while (i < lines.length && PAIR.test(lines[i]) && !BULLET.test(lines[i])) { const m = lines[i].match(PAIR)!; rows.push({ key: m[1].trim(), value: m[2].trim() }); i++; }
        // One lone "Note: something" line is a sentence, not a table.
        if (rows.length >= 2) blocks.push({ kind: "pairs", rows });
        else blocks.push({ kind: "paragraph", text: `${rows[0].key}: ${rows[0].value}` });
        continue;
      }
      const para: string[] = [];
      while (i < lines.length && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !(PAIR.test(lines[i]) && para.length === 0)) { para.push(lines[i].trim()); i++; }
      if (para.length) blocks.push({ kind: "paragraph", text: para.join(" ") });
      else i++;
    }
  }
  return blocks;
}

/** "3 of 12" readable numbers and dates, one way everywhere. */
export const fmtNumber = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—");
export function fmtWhen(s: string | number | Date | null | undefined): string {
  if (!s) return "never";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
