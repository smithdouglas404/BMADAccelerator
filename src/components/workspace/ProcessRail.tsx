"use client";

import { STAGES, type StageKey } from "@/lib/bmad";
import type { UseCaseFull } from "@/lib/types";

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
            className={`glass rounded-xl p-3 text-left transition hover:border-accent/60 ${
              state === "now" ? "ring-2 ring-accent/60" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Stage {i + 1}</span>
              {state === "done" && <span className="text-xs text-good">Visited</span>}
              {state === "now" && <span className="text-xs text-accent">You are here</span>}
            </div>
            <div className="mt-0.5 font-semibold">{s.label}</div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {s.docs.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-2">
                  <span>{d.label}</span>
                  <span>
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
                    <span
                      key={g}
                      className={`chip text-[10px] ${ok ? "border-good/40 bg-good/10 text-good" : "text-muted"}`}
                      title={ok ? "Signed off (see Review, History)" : "Sign-off gate: waiting for your approval"}
                    >
                      {ok ? "✓" : <LockIcon />} {g}
                    </span>
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

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
