import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { AGENTS, KANBAN_COLUMNS } from "@/lib/bmad";
import { onGatePassed, rememberDecision } from "@/lib/memory";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  status: z.enum(["approved", "edited", "answered", "dismissed"]),
  answer: z.string().max(20000).optional(),
});

// Resolves a review-queue item. Every resolution goes back to the concierge, who
// passes it to the BMAD agent that owns it (a skipped card move still reaches Sofia).
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const item = await prisma.reviewItem.update({
    where: { id },
    data: { status: parsed.data.status, answer: parsed.data.answer ?? "", resolvedAt: new Date() },
  });
  const answer = parsed.data.answer?.trim() ?? "";
  if (answer) {
    await prisma.message.create({ data: { useCaseId: item.useCaseId, role: "user", content: `${item.title}: ${answer}` } });
  }
  await rememberReview(item, parsed.data.status, answer);
  if (!agentsEnabled() || item.kind === "document") return NextResponse.json(item);

  let prompt = "";
  switch (item.kind) {
    case "move": {
      const t = await prisma.ticket.findUnique({ where: { id: item.targetId } });
      const col = KANBAN_COLUMNS.find((c) => c.key === t?.status)?.label ?? t?.status;
      prompt = `The client moved ${t ? `${t.kind} ${t.ref} "${t.title}"` : "a card"} on the board to ${col} (${item.reason.toLowerCase()}). The move is already written to the ticket tree with tickets.py mark. ${
        answer ? `Their update: "${answer}"` : "They chose not to give an update."
      } Tell the BMAD agent that owns this work, in its own workflow, so the plan stays in sync, and tell the client in one line what happened.`;
      break;
    }
    case "unknown":
      prompt = `Answer to Sofia's open question on ticket ${item.targetId} ("${item.title}"): ${
        answer || (parsed.data.status === "dismissed" ? "the client skipped it for now" : "the client approved leaving it as is")
      }. Pass it to Sofia (\`bmad-agent-po\`) so she settles the unknown in the ticket tree.`;
      break;
    case "signoff":
      prompt = `Sign-off decision at the BMAD gate "${item.title.replace(/^Sign off: /, "")}": ${
        parsed.data.status === "approved" && !answer ? "approved" : parsed.data.status === "dismissed" ? "not yet, the client wants to come back to it" : `the client says "${answer}"`
      }. Continue the BMAD workflow from this gate accordingly.`;
      break;
    default:
      prompt = `The client ${parsed.data.status === "dismissed" ? "put off" : answer ? "answered" : "approved"} this review item (${item.kind}): "${item.title}"${answer ? `. Their answer: "${answer}"` : ""}. Use it in the BMAD work where it belongs.`;
  }
  await enqueue(item.useCaseId, "review", prompt);
  return NextResponse.json(item);
}

// The client's decision goes to long-term memory. A passed sign-off is a gate: the role also learns from it.
async function rememberReview(
  item: { useCaseId: string; kind: string; title: string; detail: string; source: string },
  status: string,
  answer: string,
) {
  if (item.kind === "document") return; // documents are remembered when approved in the Documents panel
  const uc = await prisma.useCase.findUnique({ where: { id: item.useCaseId } });
  if (!uc) return;
  const agent = agentFromSource(item.source);
  if (item.kind === "signoff" && status === "approved") {
    onGatePassed(uc, item.title.replace(/^Sign off: /, ""), item.detail, answer, agent);
    return;
  }
  const verb = status === "dismissed" ? "put off" : answer ? "answered" : "approved";
  rememberDecision(uc, agent ?? "concierge", `The client ${verb} the ${item.kind} "${item.title}".${item.detail ? ` It said: ${item.detail}` : ""}${answer ? `\nThe client's answer: ${answer}` : ""}`, `accelerator:review:${item.kind}`);
}

// Review items name their agent as "Mary, Analyst"; map that back to the agent key.
function agentFromSource(source: string): string | undefined {
  const name = source.split(",")[0]?.trim();
  return (Object.entries(AGENTS).find(([, a]) => a.name === name) ?? [])[0];
}
