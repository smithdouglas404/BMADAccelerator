import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";
import { AGENTS, KANBAN_COLUMNS } from "@/lib/bmad";
import { onGatePassed, rememberDecision } from "@/lib/memory";
import { defaultInclude, isBuildDecision } from "@/lib/buildQueue";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  status: z.enum(["approved", "edited", "answered", "dismissed"]).optional(),
  answer: z.string().max(20000).optional(),
  // Whether this decision goes into the next Generate run.
  include: z.boolean().optional(),
  // A change to a decision already in History.
  refine: z.boolean().optional(),
});

// Resolves a review-queue item. Every resolution goes back to the concierge, who
// passes it to the BMAD agent that owns it (a skipped card move still reaches Sofia).
// With only `include`, it just ticks the item in or out of the next build.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const { include, refine } = parsed.data;
  const before = await prisma.reviewItem.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!parsed.data.status && !refine) {
    if (include === undefined) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    const item = await prisma.reviewItem.update({ where: { id }, data: { includeInBuild: include && isBuildDecision(before.kind) } });
    return NextResponse.json(item);
  }

  if (refine) return refineDecision(before, parsed.data.answer?.trim() ?? "", include);

  const status = parsed.data.status!;
  const item = await prisma.reviewItem.update({
    where: { id },
    data: {
      status,
      answer: parsed.data.answer ?? "",
      resolvedAt: new Date(),
      includeInBuild: isBuildDecision(before.kind) && (include ?? defaultInclude(status)),
      builtInVersion: 0,
    },
  });
  parsed.data.status = status;
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
      }. Continue the BMAD workflow from this gate accordingly.${
        parsed.data.status === "approved" ? " If this gate ends an agent's part, hand over to the next BMAD agent now, in this turn (set_stage, then start its workflow), and tell the client in one line who is taking over." : ""
      }${
        parsed.data.status === "approved" && /\bPRD\b|product requirements/i.test(item.title)
          ? " This is the PRD: before Sally starts, write the component list from the shadcn MCP as your skill describes (Components from the PRD) and show it for approval."
          : ""
      }`;
      break;
    default:
      prompt = `The client ${parsed.data.status === "dismissed" ? "put off" : answer ? "answered" : "approved"} this review item (${item.kind}): "${item.title}"${answer ? `. Their answer: "${answer}"` : ""}. Use it in the BMAD work where it belongs.`;
  }
  await enqueue(item.useCaseId, "review", prompt);
  return NextResponse.json(item);
}

type Item = NonNullable<Awaited<ReturnType<typeof prisma.reviewItem.findUnique>>>;

// The client changed a decision they made earlier. The old answer is kept, the item shows "Updated",
// it goes into the next build unless they untick it, and the owning BMAD agent hears about it.
async function refineDecision(before: Item, answer: string, include: boolean | undefined) {
  if (!answer) return NextResponse.json({ error: "Write what changes" }, { status: 400 });
  const item = await prisma.reviewItem.update({
    where: { id: before.id },
    data: {
      status: "edited",
      previousAnswer: before.answer || (before.status === "approved" ? "Approved as written" : before.status === "dismissed" ? "Put off" : ""),
      answer,
      refinedAt: new Date(),
      resolvedAt: before.resolvedAt ?? new Date(),
      includeInBuild: isBuildDecision(before.kind) && (include ?? true),
      builtInVersion: 0,
    },
  });
  await prisma.message.create({ data: { useCaseId: item.useCaseId, role: "user", content: `Change to an earlier decision, "${item.title}": ${answer}` } });
  await rememberReview(item, "answered", answer);
  if (agentsEnabled() && item.kind !== "document") {
    await enqueue(
      item.useCaseId,
      "review",
      `The client refined an earlier decision (${item.kind}): "${item.title}". Before, they said: "${item.previousAnswer || "approved as written"}". Now: "${answer}". The new answer replaces the old one. Pass it to the BMAD agent that owns this in its own update workflow, so the documents say the new thing, and tell the client in one line what you changed.${
        item.includeInBuild ? " It is ticked for the next build, so Generate will also read it directly." : ""
      }`,
    );
  }
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
