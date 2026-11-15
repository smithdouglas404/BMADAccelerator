import Link from "next/link";
import { prisma } from "@/lib/db";
import { AGENTS, STAGES, type AgentKey } from "@/lib/bmad";

export const dynamic = "force-dynamic";

export default async function Home() {
  const useCases = await prisma.useCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { reviews: { where: { status: "open" } }, documents: true } } },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your use cases</h1>
          <p className="mt-1 text-muted">Pick up where you left off, or start something new.</p>
        </div>
        <Link href="/use-cases/new" className="btn btn-primary">
          + New use case
        </Link>
      </div>

      {useCases.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <h2 className="text-xl font-semibold">Start with a sentence, or just talk</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted">
            Describe what you want to build, drop in any documents you have, and the concierge will guide you
            through BMAD from idea to a working pilot.
          </p>
          <Link href="/use-cases/new" className="btn btn-primary mt-6">
            Create your first use case
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((u) => {
            const agent = AGENTS[(u.activeAgent as AgentKey) in AGENTS ? (u.activeAgent as AgentKey) : "concierge"];
            const stage = STAGES.find((s) => s.key === u.stage)?.label ?? "Clarify";
            const setup = u.onboardingStep < 3;
            return (
              <li key={u.id} className="glass pop-in flex flex-col rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold leading-tight">{u.name}</h2>
                  {u._count.reviews > 0 && (
                    <span className="chip border-transparent bg-accent text-white">{u._count.reviews} to review</span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{u.description || "No description yet."}</p>
                <div className="mt-4 space-y-1 text-sm">
                  <div>
                    <span className="text-muted">Stopped at: </span>
                    {setup ? `Setup, step ${u.onboardingStep + 1} of 3` : stage}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: agent.color }} />
                    {agent.name}, {agent.role}
                  </div>
                  {u.pendingQuestion && <div className="text-muted">&ldquo;{u.pendingQuestion}&rdquo;</div>}
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {u._count.documents} document{u._count.documents === 1 ? "" : "s"}
                  </span>
                  <Link href={`/use-cases/${u.id}`} className="btn btn-primary">
                    Continue
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
