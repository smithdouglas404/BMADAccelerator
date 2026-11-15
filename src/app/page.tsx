import Link from "next/link";
import { ArrowRight, FileText, Inbox, Plus, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { AGENTS, STAGES, type AgentKey } from "@/lib/bmad";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { BlurFade } from "@/components/magicui/blur-fade";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const useCases = await prisma.useCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { reviews: { where: { status: "open" } }, documents: true } } },
  });
  const toReview = useCases.reduce((n, u) => n + u._count.reviews, 0);

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-10">
      <DotPattern
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 text-muted-foreground/25 [mask-image:radial-gradient(420px_circle_at_top_left,white,transparent)]"
        aria-hidden
      />
      <BlurFade>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your use cases</h1>
            <p className="mt-1 text-muted-foreground">Pick up where you left off, or start something new.</p>
          </div>
          <div className="flex items-center gap-6">
            {useCases.length > 0 && (
              <dl className="hidden gap-6 text-sm sm:flex">
                <div>
                  <dt className="text-muted-foreground">Use cases</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    <NumberTicker value={useCases.length} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Waiting for you</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {toReview ? <NumberTicker value={toReview} /> : 0}
                  </dd>
                </div>
              </dl>
            )}
            <Button asChild size="lg">
              <Link href="/use-cases/new">
                <Plus /> New use case
              </Link>
            </Button>
          </div>
        </div>
      </BlurFade>

      {useCases.length === 0 ? (
        <BlurFade delay={0.1}>
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>Start with a sentence, or just talk</EmptyTitle>
              <EmptyDescription>
                Describe what you want to build, drop in any documents you have, and the concierge will guide you through BMAD
                from idea to a working pilot.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/use-cases/new">Create your first use case</Link>
              </Button>
            </EmptyContent>
          </Empty>
        </BlurFade>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((u, i) => {
            const agent = AGENTS[(u.activeAgent as AgentKey) in AGENTS ? (u.activeAgent as AgentKey) : "concierge"];
            const stageIndex = Math.max(0, STAGES.findIndex((s) => s.key === u.stage));
            const stage = STAGES[stageIndex]?.label ?? "Clarify";
            const setup = u.onboardingStep < 3;
            const setupStep = u.onboardingStep < 2 ? u.onboardingStep + 1 : (u.inspiration as { picks?: unknown } | null)?.picks ? 4 : 3;
            return (
              <BlurFade key={u.id} delay={0.05 + i * 0.04} inView className="h-full">
                  <Card className="group h-full gap-4 transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base leading-snug">{u.name}</CardTitle>
                      {u._count.reviews > 0 && (
                        <CardAction>
                          <Badge>
                            <Inbox /> {u._count.reviews} to review
                          </Badge>
                        </CardAction>
                      )}
                      <CardDescription className="line-clamp-2">{u.description || "No description yet."}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{setup ? "Setup" : "Stage"}</span>
                          <span className="font-medium text-foreground">{setup ? `Step ${setupStep} of 4` : stage}</span>
                        </div>
                        <div className="flex gap-1" aria-hidden>
                          {(setup ? [0, 1, 2, 3] : STAGES.map((_, n) => n)).map((n) => (
                            <span
                              key={n}
                              className={cn(
                                "h-1.5 flex-1 rounded-full bg-muted",
                                (setup ? n < setupStep : n <= stageIndex) && "bg-primary",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block size-2 rounded-full" style={{ background: agent.color }} />
                        <span>
                          {agent.name}
                          <span className="text-muted-foreground">, {agent.role}</span>
                        </span>
                      </div>
                      {u.pendingQuestion && (
                        <p className="line-clamp-2 rounded-md bg-muted px-3 py-2 text-muted-foreground">&ldquo;{u.pendingQuestion}&rdquo;</p>
                      )}
                    </CardContent>
                    <CardFooter className="mt-auto justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="size-3.5" />
                        {u._count.documents} document{u._count.documents === 1 ? "" : "s"}
                      </span>
                      <Button asChild size="sm">
                        <Link href={`/use-cases/${u.id}`}>
                          Continue <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
              </BlurFade>
            );
          })}
        </div>
      )}
    </main>
  );
}
