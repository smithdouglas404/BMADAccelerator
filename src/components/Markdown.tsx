"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Splits YAML front matter off so it shows as a small facts table instead of raw text.
export function splitFrontMatter(md: string): { facts: [string, string][]; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { facts: [], body: md };
  const facts: [string, string][] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)$/);
    if (kv && kv[2].trim()) facts.push([kv[1].trim().replace(/[_-]/g, " "), kv[2].trim().replace(/^["']|["']$/g, "")]);
  }
  return { facts, body: md.slice(m[0].length) };
}

export function Facts({ facts }: { facts: [string, string][] }) {
  if (!facts.length) return null;
  return (
    <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
      {facts.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground capitalize">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// BMAD documents as readable pages: headings, tables, checklists, code.
export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-a:text-primary prose-table:text-xs prose-th:bg-muted/60 prose-th:px-2 prose-td:px-2",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href && /^https?:/.test(href) ? (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ) : (
              <span className="text-primary">{children}</span>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
