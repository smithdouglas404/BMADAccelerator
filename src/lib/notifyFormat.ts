import { numberedOptions } from "./studio/core.ts";

// What a notification says. Pure, so it is tested (tests/notify.test.mjs).

export type WaitingItem = {
  key: string; // decision:<id> | ask:<message id> | review:<move id>
  useCase: string; // "Acme Insurance · ClaimSnap"
  link: string;
  kind: "question" | "checkpoint" | "review";
  text: string;
  options: string[];
  from: string;
};

/** Socra's message asks the people something: numbered options, or it ends on a question. */
export function asksSomething(text: string): boolean {
  if (numberedOptions(text).length >= 2) return true;
  const last = text.trim().split(/\n/).map((l) => l.trim()).filter(Boolean).pop() ?? "";
  return /\?\s*$/.test(last) || /\?\s*\**\s*$/.test(last.replace(/[*_`]/g, ""));
}

/** The question itself: the last sentence before the options, or the last line that ends with "?". */
export function questionOf(text: string): { question: string; options: string[] } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const options = numberedOptions(text).map((o) => `${o.n}. ${o.label}`);
  const asked = [...lines].reverse().find((l) => /\?\s*(\*\*)?$/.test(l) && !/^\d{1,2}[.)]/.test(l));
  const question = (asked ?? lines.find((l) => !/^\d{1,2}[.)]/.test(l)) ?? text).replace(/[*_`]/g, "").slice(0, 400);
  return { question, options };
}

const KIND = { question: "Question", checkpoint: "Needs your Approve or Reject", review: "Ready for you to try" } as const;

export function subjectFor(items: WaitingItem[]) {
  if (items.length === 1) return `${items[0].useCase}: ${items[0].text.slice(0, 90)}`;
  return `${items.length} things are waiting on you in the Studio`;
}

/** Plain text, for email and Slack. Answer by number in the Studio (or from a connected assistant). */
export function bodyFor(items: WaitingItem[], assistant: string) {
  const blocks = items.map((i) => {
    const opts = i.options.length ? `\n${i.options.map((o) => `   ${o}`).join("\n")}` : "";
    return `${KIND[i.kind]} · ${i.useCase}${i.from ? ` · from ${i.from}` : ""}\n${i.text}${opts}\nAnswer: ${i.link}`;
  });
  const tail = items.some((i) => i.options.length) ? `\n\nA number is enough. You can also answer from a connected assistant: "what's waiting on me in the Studio?"` : "";
  return `${blocks.join("\n\n")}${tail}\n\n— ${assistant}, Working Backwards Studio`;
}
