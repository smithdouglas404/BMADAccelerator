import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { rememberDecision } from "@/lib/memory";
import { SPEC_STATUSES, cleanTrace } from "@/lib/studio/spec";
import { recordChange } from "@/lib/studio/truthlog";
import { ownerEdited } from "@/lib/studio/ownerEdits";

type Ctx = { params: Promise<{ id: string; key: string }> };

const Body = z.object({
  review: z.enum(["keep", "revise", "challenge", "remove", ""]).optional(),
  note: z.string().max(4000).default(""),
  content: z.string().max(40000).optional(),
  status: z.enum(SPEC_STATUSES.map((s) => s.key) as [string, ...string[]]).optional(),
  // "Ask Socra to probe" this section (Doug, Nov 21: the agents push back and ask).
  probe: z.boolean().optional(),
  // Who made the change, for the record.
  by: z.string().max(80).default(""),
});

// Requirements review: Keep, Revise, Challenge or Remove an inferred section. The evidence and the
// conversation under it are always kept, whatever the choice; a removed section can come back.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, key } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const s = await prisma.specSection.findUnique({ where: { useCaseId_key: { useCaseId: id, key } } });
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { review, note, content, status, by, probe } = parsed.data;
  const who = by.trim() || "Owner";
  const data: Record<string, unknown> = { updatedBy: who };
  const step = (detail: string) => cleanTrace([...(Array.isArray(s.trace) ? s.trace : []), { label: `${who === "Owner" ? "Owner" : who} review`, detail, type: "conversation" }]);
  if (review !== undefined) {
    data.review = review;
    data.reviewNote = note;
    if (review === "keep") Object.assign(data, { basis: "confirmed", status: ["draft", "exploring", "evidence-backed"].includes(s.status) ? "owner-approved" : s.status, trace: step("Kept as written") });
    if (review === "remove") data.trace = step(`Removed${note ? `: "${note}"` : ""}`);
    if (review === "challenge") data.trace = step(`Challenged${note ? `: "${note}"` : ""}`);
    if (review === "revise") data.trace = step(`Revised${note ? `: "${note}"` : ""}`);
  }
  if (content !== undefined && content !== s.content) Object.assign(data, { content, basis: "confirmed", source: who === "Owner" ? "Owner's own words" : `${who}'s own words`, trace: cleanTrace([...((data.trace as unknown[]) ?? (Array.isArray(s.trace) ? s.trace : []) as unknown[]), { label: "Edited in place", detail: `${who} rewrote it in their own words`, type: "conversation" }]) });
  if (status) data.status = status;
  const after = await prisma.specSection.update({ where: { id: s.id }, data });
  if (review !== undefined || content !== undefined || status)
    await recordChange(id, {
      node: `spec:${key}`,
      kind: review === "keep" ? "approved" : review === "remove" ? "rejected" : review ? "reviewed" : "changed",
      summary: review ? `${who === "Owner" ? "The owner" : who} chose ${review === "keep" ? "Keep" : review === "remove" ? "Remove" : review === "challenge" ? "Challenge" : "Revise"} on ${s.ref} ${s.title}${note ? `: “${note}”` : ""}` : content !== undefined ? `${who === "Owner" ? "The owner" : who} edited ${s.ref} ${s.title} in their own words` : `${s.ref} ${s.title} moved to ${status}`,
      before: content !== undefined ? s.content : s.status,
      after: content !== undefined ? content : after.status,
      by: who,
    });
  // A plain edit (no review choice) still reaches Socra, so the sections it touches follow it.
  if (content !== undefined && content !== s.content && !review) await ownerEdited(id, { node: `spec:${key}`, what: `${s.ref} ${s.title}`, before: s.content, after: content, by: who, logged: true });
  if (review && review !== "keep") {
    const uc = await prisma.useCase.findUniqueOrThrow({ where: { id } });
    rememberDecision(uc, "muse", `The owner chose ${review} on ${s.ref} ${s.title}${note ? `: ${note}` : ""}`, "studio:spec-review");
    if (agentsEnabled())
      await enqueue(
        id,
        "spec",
        review === "remove"
          ? `The owner removed ${s.ref} ${s.title} from the specification${note ? ` ("${note}")` : ""}. Its evidence and conversation stay. If it held a floor item, mark that item [out] quoting them; tell them in one line what no longer gets built.`
          : review === "challenge"
            ? `The owner challenged ${s.ref} ${s.title}${note ? `: "${note}"` : ""}. Current text: "${s.content.slice(0, 800)}". Look at what it rests on (its trace and evidence), tell them honestly how sure you are, ask one question to settle it, and update the section (set_spec_section) once it is settled.`
            : `The owner asked to revise ${s.ref} ${s.title}${note ? `: "${note}"` : ""}${content !== undefined ? ` and edited it to: "${content.slice(0, 800)}"` : ""}. Carry the revision into this section and any sections it touches (set_spec_section), then tell them in one line.`,
        `spec:${key}`,
      );
  }
  if (probe) {
    if (!agentsEnabled()) return NextResponse.json({ error: "The team isn't switched on here, so nobody can ask about this section yet." }, { status: 422 });
    const skill = s.tab === "prd" ? "studio-prd" : "studio-trd";
    await prisma.message.create({ data: { useCaseId: id, role: "user", agent: "You", content: `Probe ${s.title}${note ? `: ${note}` : ""}`, author: who, about: [`spec:${key}`] } });
    await enqueue(
      id,
      "spec",
      `${who} asked you to probe ${s.tab.toUpperCase()} section ${s.ref} ${s.title} (${key})${note ? `: "${note}"` : ""}. Current text: "${s.content.slice(0, 800) || "(empty)"}". Open the ${skill} skill: find this section's walkthrough question and bar (or what the section holds), send the specialist it names, and ask the one or two sharpest questions that would raise it to its bar, with numbered options and one marked "(suggested)" where they may not know. Push back honestly on anything vague. When they answer, update the section (set_spec_section) and the sections it informs.`,
      `spec:${key}`,
    );
  }
  return NextResponse.json(after);
}
