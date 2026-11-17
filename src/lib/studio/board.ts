import { prisma } from "@/lib/db";
import { recordChange } from "./truthlog";

// The Board moves itself: Socra moves a card as the conversation settles it, a build
// picks up what is ready and hands it back for review, and a person's yes or mark finishes it or sends
// it back. Every move says who or what made it and why, and lands in "Why did this change?".

export const BOARD = ["queued", "ready", "building", "review", "done"] as const;
export type BoardStatus = (typeof BOARD)[number];
export const BOARD_LABEL: Record<BoardStatus, string> = { queued: "Backlog", ready: "Ready to shape", building: "Being made real", review: "Human review", done: "Done" };

export async function moveCard(useCaseId: string, moveId: string, status: BoardStatus, by: string, why: string, causes: string[] = []) {
  const m = await prisma.move.findFirst({ where: { id: moveId, useCaseId } });
  if (!m) return null;
  if (m.status === status && m.moveReason === why) return m;
  const back = BOARD.indexOf(status) < BOARD.indexOf(m.status as BoardStatus);
  const after = await prisma.move.update({ where: { id: m.id }, data: { status, movedBy: by, moveReason: why } });
  await recordChange(useCaseId, {
    node: `move:${m.id}`,
    kind: back ? "moved back" : "moved",
    summary: `${by} moved “${m.title}” ${back ? "back " : ""}to ${BOARD_LABEL[status]}: ${why}`,
    before: BOARD_LABEL[m.status as BoardStatus] ?? m.status,
    after: BOARD_LABEL[status],
    causes,
    by,
  });
  return after;
}
