import { prisma } from "@/lib/db";
import { ASSISTANT_NAME, PRODUCT_NAME, brand } from "@/lib/brand";
import { decrypt } from "@/lib/settings";
import { asksSomething, bodyFor, questionOf, subjectFor, type WaitingItem } from "./notifyFormat";

// Sends what is waiting on people to where they want it (Doug, Nov 16: "option 2"): a new open question
// or checkpoint, Socra's question in the conversation, a card ready for review. Checked every minute;
// things that arrive together go out as one message. Each item goes to each target once.

const SETTLE_MS = 60_000; // let Socra finish a burst of messages before sending
const MAX_AGE_MS = 3 * 86_400_000;

function base() {
  return (process.env.STUDIO_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
}

/** Everything waiting on people that appeared after `since`, for the use cases a target covers. */
export async function waitingSince(since: Date, customer = ""): Promise<WaitingItem[]> {
  const until = new Date(Date.now() - SETTLE_MS);
  const where = customer ? { customer: { equals: customer, mode: "insensitive" as const } } : {};
  const ucs = await prisma.useCase.findMany({ where, select: { id: true, name: true, customer: true } });
  if (!ucs.length) return [];
  const ids = ucs.map((u) => u.id);
  const name = new Map(ucs.map((u) => [u.id, `${u.customer ? `${u.customer} · ` : ""}${u.name}`]));
  const link = (id: string, view: string) => `${base()}/use-cases/${id}?view=${view}`;
  const [decisions, asks, reviews] = await Promise.all([
    prisma.decision.findMany({ where: { useCaseId: { in: ids }, status: "open", createdAt: { gt: since, lte: until } }, orderBy: { createdAt: "asc" } }),
    prisma.message.findMany({ where: { useCaseId: { in: ids }, role: "muse", createdAt: { gt: since, lte: until } }, orderBy: { createdAt: "asc" } }),
    prisma.move.findMany({ where: { useCaseId: { in: ids }, status: "review", updatedAt: { gt: since, lte: until } } }),
  ]);
  const items: WaitingItem[] = [];
  for (const d of decisions) {
    const options = Array.isArray(d.options) ? (d.options as { label?: string }[]).map((o, i) => `${i + 1}. ${o.label ?? ""}`).filter((o) => o.length > 3) : [];
    items.push({ key: `decision:${d.id}`, useCase: name.get(d.useCaseId)!, link: link(d.useCaseId, "conversation"), kind: options.length ? "question" : "checkpoint", text: brand(d.text), options, from: brand(d.agent) });
  }
  // Socra's latest question in each conversation, if nobody has answered it yet.
  const latest = new Map<string, (typeof asks)[number]>();
  for (const m of asks) latest.set(m.useCaseId, m);
  for (const m of latest.values()) {
    if (!asksSomething(m.content)) continue;
    const answered = await prisma.message.findFirst({ where: { useCaseId: m.useCaseId, role: "user", createdAt: { gt: m.createdAt } }, select: { id: true } });
    if (answered) continue;
    const q = questionOf(brand(m.content));
    items.push({ key: `ask:${m.id}`, useCase: name.get(m.useCaseId)!, link: link(m.useCaseId, "conversation"), kind: "question", text: q.question, options: q.options, from: ASSISTANT_NAME });
  }
  for (const c of reviews) items.push({ key: `review:${c.id}:${c.updatedAt.getTime()}`, useCase: name.get(c.useCaseId)!, link: link(c.useCaseId, "vibe"), kind: "review", text: `${c.title}${c.moveReason ? ` (${c.moveReason})` : ""}`, options: [], from: "" });
  return items;
}

async function send(kind: string, address: string, items: WaitingItem[]) {
  const subject = subjectFor(items);
  const text = bodyFor(items, ASSISTANT_NAME);
  if (kind === "email") {
    const smtp = process.env.SMTP_URL;
    if (!smtp) throw new Error("Email sending isn't set up: add the SMTP address on Settings > Models and keys.");
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport(smtp);
    const from = process.env.NOTIFY_FROM || (() => { try { return decodeURIComponent(new URL(smtp).username) || "studio@localhost"; } catch { return "studio@localhost"; } })();
    await t.sendMail({ from: `${PRODUCT_NAME} <${from}>`, to: address, subject, text });
    return;
  }
  const body = kind === "slack" ? { text: `*${subject}*\n\n${text}` } : { subject, text, items };
  const res = await fetch(address, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${kind === "slack" ? "Slack" : "The webhook"} answered ${res.status}`);
}

/** One pass: for each target, what is new since it was added, minus what it already got. */
export async function notifyWaiting() {
  const targets = await prisma.notifyTarget.findMany({ where: { enabled: true } });
  for (const t of targets) {
    const since = new Date(Math.max(t.createdAt.getTime(), Date.now() - MAX_AGE_MS));
    const all = await waitingSince(since, t.customer);
    if (!all.length) continue;
    const sent = new Set((await prisma.notifySent.findMany({ where: { targetId: t.id, key: { in: all.map((i) => i.key) } }, select: { key: true } })).map((s) => s.key));
    const fresh = all.filter((i) => !sent.has(i.key));
    if (!fresh.length) continue;
    try {
      await send(t.kind, await decrypt(t.address), fresh.slice(0, 20));
      await prisma.notifySent.createMany({ data: fresh.map((i) => ({ targetId: t.id, key: i.key })), skipDuplicates: true });
      await prisma.notifyTarget.update({ where: { id: t.id }, data: { lastSent: new Date(), lastError: "" } });
    } catch (e) {
      await prisma.notifyTarget.update({ where: { id: t.id }, data: { lastError: (e instanceof Error ? e.message : String(e)).slice(0, 300) } });
    }
  }
}

/** Settings > Connect's "Send a test". */
export async function sendTest(targetId: string) {
  const t = await prisma.notifyTarget.findUniqueOrThrow({ where: { id: targetId } });
  const item: WaitingItem = { key: "test", useCase: "Test", link: `${base()}/`, kind: "question", text: "This is a test from the Studio. Questions waiting on you will arrive like this.", options: ["1. Looks good (suggested)", "2. Change something"], from: ASSISTANT_NAME };
  await send(t.kind, await decrypt(t.address), [item]);
}

let started = false;
export function startNotifier() {
  if (started) return;
  started = true;
  setInterval(() => void notifyWaiting().catch((e) => console.error("notify", e)), 60_000).unref?.();
}
