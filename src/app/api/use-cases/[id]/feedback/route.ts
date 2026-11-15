import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import { enqueue, agentsEnabled } from "@/lib/agent/runner";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  comment: z.string().trim().min(1).max(20000),
  image: z.string().startsWith("data:image/png;base64,").max(30_000_000),
  pageUrl: z.string().max(2000).default("/"),
});

// Saves a marked-up screen (drawing + what the person said) as a backlog card and
// hands it to Sofia, so it goes into BMAD's ticket tree and the next Generate.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Add a comment and a drawing." }, { status: 400 });
  const uc = await prisma.useCase.findUnique({ where: { id } });
  if (!uc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const n = (await prisma.feedback.count({ where: { useCaseId: id } })) + 1;
  const dir = workspacePath(uc.slug, "bacc", "feedback");
  await fs.mkdir(dir, { recursive: true });
  const imagePath = path.join(dir, `feedback-${n}.png`);
  await fs.writeFile(imagePath, Buffer.from(parsed.data.image.split(",")[1], "base64"));
  await fs.writeFile(
    path.join(dir, `feedback-${n}.md`),
    `# Screen feedback ${n}\n\nPage: ${parsed.data.pageUrl}\n\nWhat the client said:\n\n> ${parsed.data.comment.replace(/\n/g, "\n> ")}\n\nMarked-up screenshot: feedback-${n}.png\n`,
  );
  const ref = `F${n}`;
  const fb = await prisma.feedback.create({
    data: { useCaseId: id, comment: parsed.data.comment, imagePath, pageUrl: parsed.data.pageUrl, ticketRef: ref },
  });
  await prisma.ticket.create({
    data: {
      useCaseId: id,
      ref,
      kind: "feedback",
      title: parsed.data.comment.slice(0, 140),
      status: "backlog",
      position: 1000 + n,
      verify: `Marked-up screenshot: /api/feedback/${fb.id}/image`,
    },
  });
  if (agentsEnabled()) {
    await enqueue(
      id,
      "feedback",
      `The client marked up a screen of the generated app (page ${parsed.data.pageUrl}) and said: "${parsed.data.comment}". The marked-up screenshot is bacc/feedback/feedback-${n}.png (open it with Read: the drawing shows the spot) with notes in bacc/feedback/feedback-${n}.md. Hand it to Sofia (\`bmad-agent-po\`) to turn into a backlog ticket (story or bug) in the ticket tree, referencing the screenshot, and confirm the meaning with the client first if it is unclear. It will be built in the next Generate.`,
    );
    await prisma.feedback.update({ where: { id: fb.id }, data: { status: "sent" } });
  }
  return NextResponse.json(fb, { status: 201 });
}
