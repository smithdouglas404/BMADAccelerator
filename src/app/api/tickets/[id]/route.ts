import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { KANBAN_COLUMNS } from "@/lib/bmad";
import { markTicket } from "@/lib/bmadTickets";
import { pushTicketToTracker } from "@/lib/trackers";

type Ctx = { params: Promise<{ id: string }> };

const ORDER = KANBAN_COLUMNS.map((c) => c.key);

const Body = z.object({
  status: z.enum(ORDER as [string, ...string[]]),
  position: z.number().int().min(0).optional(),
});

// Moves a card. Every move is recorded for Sofia (BMAD's Product Owner), who stays
// the only writer of the ticket tree. Moving a card backward or reordering it
// prompts the concierge's "Do you want to provide an update?" in the Review queue;
// if the user skips it, the move is still passed to BMAD.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid move" }, { status: 400 });
  const before = await prisma.ticket.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: before.useCaseId } });
  // Write the move into BMAD's tree with Sofia's own script, so BMAD stays the source of truth.
  if (uc.provisioned && before.kind !== "epic" && before.kind !== "feedback" && before.status !== parsed.data.status) {
    try {
      await markTicket(uc.slug, before.ref, parsed.data.status);
    } catch (e) {
      console.error("tickets.py mark", e);
    }
  }
  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status: parsed.data.status, position: parsed.data.position ?? before.position },
  });

  const from = ORDER.indexOf(before.status);
  const to = ORDER.indexOf(parsed.data.status);
  const label = (k: string) => KANBAN_COLUMNS.find((c) => c.key === k)?.label ?? k;
  if (to !== from || parsed.data.position !== undefined) {
    const backward = to < from;
    await prisma.reviewItem.create({
      data: {
        useCaseId: ticket.useCaseId,
        kind: "move",
        title: `You moved "${ticket.title}" ${backward ? "back " : ""}to ${label(parsed.data.status)}`,
        detail:
          "Do you want to provide an update? If you skip this, I'll still tell Sofia about the move so the plan stays in sync.",
        reason: backward ? "Card moved backward" : to === from ? "Card reordered" : "Card moved forward",
        source: "Concierge",
        targetId: ticket.id,
      },
    });
  }
  void pushTicketToTracker(ticket.id).catch((e) => console.error("tracker sync", e));
  return NextResponse.json(ticket);
}
