"use client";

import { useEffect, useState } from "react";
import { STAGES, type StageKey } from "@/lib/bmad";
import type { UseCaseFull } from "@/lib/types";
import { statusOf, type DocFile, type DocKey } from "@/lib/bmadDocs";
import { Check, ChevronRight, Lock } from "lucide-react";
import DocsSheet, { DocStatusBadge } from "./DocsSheet";
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
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [open, setOpen] = useState<{ stage: StageKey; path: string | null } | null>(null);
  // Re-read the workspace whenever the agents may have written something.
  const pulse = `${data.messages.length}:${data.tickets.length}:${data.reviews.length}:${data.generateCount}`;
  useEffect(() => {
    let live = true;
    fetch(`/api/use-cases/${data.id}/bmad-docs`)
      .then((r) => r.json())
      .then((j) => live && setDocs(j.docs ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [data.id, pulse]);
  const epics = data.tickets.filter((t) => t.kind === "epic").length;
  const stories = data.tickets.length - epics;
  const openQuestions = data.reviews.filter(
    (r) => r.status === "open" && ["assumption", "question", "unknown"].includes(r.kind),
  ).length;

  return (
    <nav aria-label="BMAD process" className="grid gap-2 md:grid-cols-4">
      {STAGES.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <div
            key={s.key}
            aria-current={state === "now" ? "step" : undefined}
            className={cn(
              "relative flex flex-col justify-start overflow-hidden rounded-xl border bg-card p-3 text-left shadow-xs transition-all hover:border-primary/40 hover:shadow-sm",
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
            <button
              type="button"
              onClick={() => setOpen({ stage: s.key, path: null })}
              className="group mt-0.5 flex items-center gap-1 rounded-sm text-left font-semibold hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              title="Open this stage's documents"
            >
              {s.label}
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {s.docs.map((d) => {
                const status = statusOf(d.key as DocKey, docs);
                const first = docs.find((f) => f.key === d.key && f.role === "main") ?? docs.find((f) => f.key === d.key);
                const note =
                  d.key === "prd" && openQuestions > 0
                    ? `${openQuestions} open`
                    : d.key === "tickets" && data.tickets.length
                      ? `${epics} epics, ${stories} stories`
                      : "";
                return (
                  <li key={d.key}>
                    <button
                      type="button"
                      onClick={() => setOpen({ stage: s.key, path: first?.path ?? null })}
                      className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className={cn("truncate", status === "missing" ? "text-muted-foreground" : "text-foreground")}>{d.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {note && <span className="text-[10px] text-muted-foreground tabular-nums">{note}</span>}
                        <DocStatusBadge status={status} />
                      </span>
                    </button>
                  </li>
                );
              })}
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
          </div>
        );
      })}
      <DocsSheet
        useCaseId={data.id}
        stage={open?.stage ?? null}
        initialPath={open?.path ?? null}
        docs={docs}
        isCurrent={open?.stage === data.stage}
        onClose={() => setOpen(null)}
        onMakeCurrent={(st) => {
          onSelect(st);
          setOpen(null);
        }}
      />
    </nav>
  );
}
