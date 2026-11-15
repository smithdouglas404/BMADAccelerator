import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { rememberDecision } from "@/lib/memory";
import { SPEC_STATUSES, cleanTrace } from "@/lib/studio/spec";

type Ctx = { params: Promise<{ id: string; key: string }> };

const Body = z.object({
  review: z.enum(["keep", "revise", "challenge", "remove", ""]).optional(),
  note: z.string().max(4000).default(""),
  content: z.string().max(40000).optional(),
  status: z.enum(SPEC_STATUSES.map((s) => s.key) as [string, ...string[]]).optional(),
});

// Requirements review: Keep, Revise, Challenge or Remove an inferred section. The evidence and the
// conversation under it are always kept, whatever the choice; a removed section can come back.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, key } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const s = await prisma.specSection.findUnique({ where: { useCaseId_key: { useCaseId: id, key } } });
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { review, note, content, status } = parsed.data;
  const data: Record<string, unknown> = { updatedBy: "Owner" };
  const step = (detail: string) => cleanTrace([...(Array.isArray(s.trace) ? s.trace : []), { label: "Owner review", detail, type: "conversation" }]);
  if (review !== undefined) {
    data.review = review;
    data.reviewNote = note;
    if (review === "keep") Object.assign(data, { basis: "confirmed", status: ["draft", "exploring", "evidence-backed"].includes(s.status) ? "owner-approved" : s.status, trace: step("Kept as written") });
    if (review === "remove") data.trace = step(`Removed${note ? `: "${note}"` : ""}`);
    if (review === "challenge") data.trace = step(`Challenged${note ? `: "${note}"` : ""}`);
    if (review === "revise") data.trace = step(`Revised${note ? `: "${note}"` : ""}`);
  }
  if (content !== undefined && content !== s.content) Object.assign(data, { content, basis: "confirmed", source: "Owner's own words" });
  if (status) data.status = status;
  const after = await prisma.specSection.update({ where: { id: s.id }, data });
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
      );
  }
  return NextResponse.json(after);
}
