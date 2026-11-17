// Coming back after weeks: Socra must pick up exactly where the people left off, even when its own
// Claude session is gone (a rebuild, a new machine, a session that can't resume). The Studio's database
// holds the whole record; this turns it into a "where we left off" brief for the turn. Pure: no I/O.

export type ResumeInput = {
  now: Date;
  name: string;
  customer: string;
  businessArea: string;
  /** The conversation, oldest first, including the message that started this turn. */
  messages: { role: string; agent: string; author: string; content: string; createdAt: Date }[];
  openDecisions: { text: string; createdAt: Date }[];
  approved: { text: string }[];
  held: { title: string }[];
  lastBuild: { version: number; at: Date | null } | null;
  /** Long-term memory recalled for this use case only (Mem0), and its persona notes (Letta), if any. */
  remembered: string[];
  /** True when Socra's own session could not be resumed, so it starts with no memory of the chat. */
  sessionLost: boolean;
};

const DAY = 24 * 60 * 60 * 1000;
export const RESUME_AFTER_MS = 12 * 60 * 60 * 1000;

export function gapLabel(ms: number) {
  const days = Math.floor(ms / DAY);
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** The brief, or "" when the people never left (a short gap, and Socra still has its session). */
export function resumeBrief(r: ResumeInput, keepVerbatim = 40): string {
  const msgs = r.messages.filter((m) => m.role === "user" || m.role === "muse" || m.role === "agent");
  if (msgs.length < 2) return "";
  const latest = msgs[msgs.length - 1];
  const before = msgs.slice(0, -1);
  const lastBefore = before[before.length - 1];
  const gap = latest.createdAt.getTime() - lastBefore.createdAt.getTime();
  if (gap < RESUME_AFTER_MS && !r.sessionLost) return "";

  const who = (m: ResumeInput["messages"][number]) => (m.role === "user" ? `${m.author || "Owner"}` : m.agent || "Socra");
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const recent = before.slice(-keepVerbatim);
  const older = before.length - recent.length;
  const lines = [
    `[Where we left off] ${gap >= RESUME_AFTER_MS ? `The people on ${r.name} were away for ${gapLabel(gap)} (last message ${day(lastBefore.createdAt)}, now ${day(r.now)}).` : `Picking up ${r.name}.`}${r.sessionLost ? " Your own session could not be resumed, so this record is your memory of the conversation." : ""}`,
    `Welcome them back in one line, say where things stand in two or three plain sentences (what was decided, what is waiting on them, what you were about to ask), then carry on from their new message. Never ask them to repeat what is below.`,
    [r.customer && `Customer: ${r.customer}`, r.businessArea && `Business area: ${r.businessArea}`].filter(Boolean).join(" · "),
    r.openDecisions.length ? `Waiting on them (${r.openDecisions.length}):\n${r.openDecisions.slice(0, 8).map((d) => `- ${d.text}`).join("\n")}` : "",
    r.approved.length ? `Decided so far (${r.approved.length}, latest last):\n${r.approved.slice(-8).map((d) => `- ${d.text}`).join("\n")}` : "",
    r.held.length ? `Held thoughts not yet placed (${r.held.length}):\n${r.held.slice(-6).map((h) => `- ${h.title}`).join("\n")}` : "",
    r.lastBuild ? `Last build: version ${r.lastBuild.version}${r.lastBuild.at ? ` on ${day(r.lastBuild.at)}` : ""}.` : "No build yet.",
    r.remembered.length ? `Remembered for this use case (long-term memory):\n${r.remembered.slice(0, 8).map((x) => `- ${x}`).join("\n")}` : "",
    `The conversation${older ? ` (the ${older} earlier messages are in get_state and the spec)` : ""}, word for word:\n${recent.map((m) => `[${day(m.createdAt)}] ${who(m)}: ${m.content}`).join("\n")}`,
  ];
  return lines.filter(Boolean).join("\n\n");
}
