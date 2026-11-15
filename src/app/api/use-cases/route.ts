import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureWorkspace, slugify } from "@/lib/workspace";

export async function GET() {
  const useCases = await prisma.useCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { reviews: { where: { status: "open" } }, documents: true } } },
  });
  return NextResponse.json(useCases);
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(20000).default(""),
});

export async function POST(req: Request) {
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const slug = slugify(parsed.data.name);
  await ensureWorkspace(slug);
  const useCase = await prisma.useCase.create({
    data: {
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      onboardingStep: 1,
      messages: {
        create: {
          role: "concierge",
          content:
            "Welcome. I'm your concierge. I'll guide you through BMAD, explain each question in plain words, and check my understanding with you before anything goes to the BMAD agents.",
        },
      },
    },
  });
  return NextResponse.json(useCase, { status: 201 });
}
