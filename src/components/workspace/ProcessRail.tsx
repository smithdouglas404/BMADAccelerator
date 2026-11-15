"use client";

import { STAGES, type StageKey } from "@/lib/bmad";
import type { UseCaseFull } from "@/lib/types";
import { Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BorderBeam } from "@/components/magicui/border-beam";
import { cn } from "@/lib/utils";

// BMAD's loop as clickable navigation. Each stage lists its documents with a
// readiness note (not a single percentage) and shows sign-off gates as locks.
export default function ProcessRail({
  data,
  onSelect,
}: {
  data: UseCaseFull;
  onSelect: (stage: StageKey) => void;
}) {
  const current = STAGES.findIndex((s) => s.key === data.stage);
  const openQuestions = data.reviews.filter(
    (r) => r.status === "open" && ["assumption", "question", "unknown"].includes(r.kind),
  ).length;

  return (
    <nav aria-label="BMAD process" className="grid gap-2 md:grid-cols-4">
      {STAGES.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            aria-current={state === "now" ? "step" : undefined}
            className={cn(
              "relative flex flex-col justify-start overflow-hidden rounded-xl border bg-card p-3 text-left shadow-xs transition-all hover:border-primary/40 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              state === "now" && "border-primary/50 bg-accent/40",
            )}
          >
            {state === "now" && <BorderBeam size={80} duration={8} colorFrom="var(--primary)" colorTo="var(--brand-2)" />}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Stage {i + 1}</span>
              {state === "done" && (
                <span className="inline-flex items-center gap-1 text-xs text-good">
                  <Check className="size-3" /> Visited
                </span>
              )}
              {state === "now" && <span className="text-xs font-medium text-primary">You are here</span>}
            </div>
            <div className="mt-0.5 font-semibold">{s.label}</div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {s.docs.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-2">
                  <span>{d.label}</span>
                  <span className="tabular-nums">
                    {d.key === "prd" && openQuestions > 0
                      ? `${openQuestions} open`
                      : d.key === "tickets" && data.tickets.length
                        ? `${data.tickets.length} cards`
                        : "Not started"}
                  </span>
                </li>
              ))}
            </ul>
            {s.gates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {s.gates.map((g) => {
                  const ok = data.reviews.some(
                    (r) => r.kind === "signoff" && (r.status === "approved" || r.status === "answered") && r.title.toLowerCase().includes(g.toLowerCase()),
                  );
                  return (
                    <Badge
                      key={g}
                      variant="outline"
                      className={cn("text-[10px]", ok ? "border-good/40 bg-good/10 text-good" : "text-muted-foreground")}
                      title={ok ? "Signed off (see Review, History)" : "Sign-off gate: waiting for your approval"}
                    >
                      {ok ? <Check /> : <Lock />} {g}
                    </Badge>
                  );
                })}
              </div>
            )}
          </button>
        );
      })}
    </nav>
  );
}
