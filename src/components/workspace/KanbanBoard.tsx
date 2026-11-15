"use client";

import { useState } from "react";
import { GLOSSARY, KANBAN_COLUMNS } from "@/lib/bmad";
import type { TicketT, UseCaseFull } from "@/lib/types";

const KIND_STYLE: Record<string, string> = {
  story: "bg-accent/15 text-accent",
  bug: "bg-bad/15 text-bad",
  spike: "bg-warn/15 text-warn",
  feedback: "bg-accent2/20 text-ink",
};

// Live view of BMAD's ticket tree: epics are swimlanes, stories, bugs and spikes
// are cards. Every move is passed to Sofia, BMAD's Product Owner.
export default function KanbanBoard({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const epics = data.tickets.filter((t) => t.kind === "epic");
  const cards = data.tickets.filter((t) => t.kind !== "epic");
  const lanes: { epic: TicketT | null; cards: TicketT[]; label?: string }[] = [
    ...epics.map((e) => ({ epic: e, cards: cards.filter((c) => c.epicRef === e.ref) })),
  ];
  const loose = cards.filter((c) => c.kind !== "feedback" && !epics.some((e) => e.ref === c.epicRef));
  if (loose.length) lanes.push({ epic: null, cards: loose });
  const feedback = cards.filter((c) => c.kind === "feedback");
  if (feedback.length) lanes.push({ epic: null, cards: feedback, label: "Screen feedback (Sofia turns these into tickets)" });

  async function move(id: string, status: string) {
    await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  async function sync() {
    setSyncing(true);
    await fetch(`/api/use-cases/${data.id}/tickets`, { method: "POST" });
    setSyncing(false);
    reload();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">Backlog board</span>
          <span className="text-xs text-muted" title={`${GLOSSARY.Epic} ${GLOSSARY.Story}`}>
            Rows are epics (big features). Cards are stories (the pieces).
          </span>
        </div>
        <button className="btn btn-ghost text-xs" onClick={sync} disabled={syncing}>
          {syncing ? "Syncing..." : "Refresh from BMAD"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div className="grid min-w-[900px] grid-cols-5 gap-2">
          {KANBAN_COLUMNS.map((c) => (
            <div key={c.key} className="sticky top-0 z-10 rounded-lg bg-elev/90 px-2 py-1 text-xs font-semibold text-muted">
              {c.label}
            </div>
          ))}
        </div>
        {lanes.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">
            Cards appear here as Sofia, BMAD&apos;s Product Owner, writes epics and stories from your answers.
          </p>
        ) : (
          lanes.map((lane, li) => (
            <section key={lane.epic?.id ?? `loose-${li}`} className="mt-3 min-w-[900px]">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                {lane.epic ? `Epic ${lane.epic.ref}: ${lane.epic.title}` : (lane.label ?? "Not in an epic")}
                {lane.epic && !lane.epic.refined && (
                  <span className="chip border-transparent bg-warn/15 text-[10px] text-warn">Needs detail</span>
                )}
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {KANBAN_COLUMNS.map((col) => (
                  <div
                    key={col.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dragging && move(dragging, col.key)}
                    className="min-h-20 space-y-2 rounded-xl border border-dashed border-line p-1.5"
                  >
                    {lane.cards
                      .filter((t) => t.status === col.key)
                      .map((t) => t)
                      .sort((a, b) => a.position - b.position)
                      .map((t) => (
                        <article
                          key={t.id}
                          draggable
                          onDragStart={() => setDragging(t.id)}
                          onDragEnd={() => setDragging(null)}
                          className="glass pop-in cursor-grab rounded-lg p-2.5 text-sm active:cursor-grabbing"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`chip border-transparent text-[10px] ${KIND_STYLE[t.kind] ?? ""}`}>
                              {t.kind} {t.ref}
                            </span>
                            <span className="flex gap-1">
                              {t.unknown && (
                                <span className="chip border-transparent bg-warn/20 text-[10px] text-warn" title={t.unknown}>
                                  ?
                                </span>
                              )}
                              {t.blocked && (
                                <span className="chip border-transparent bg-bad/20 text-[10px] text-bad">Blocked</span>
                              )}
                            </span>
                          </div>
                          <p className="mt-1.5 leading-snug">{t.title}</p>
                          {t.kind === "feedback" && t.verify.includes("/api/feedback/") && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.verify.slice(t.verify.indexOf("/api/feedback/"))}
                              alt="Marked-up screen"
                              className="mt-1.5 max-h-24 w-full rounded border border-line object-cover object-top"
                            />
                          )}
                          {(() => {
                            const fromFb = data.feedback.find((f) => f.becameRef && f.becameRef === t.ref);
                            const fb = t.kind === "feedback" ? data.feedback.find((f) => f.ticketRef === t.ref) : undefined;
                            const title = (ref: string) => data.tickets.find((x) => x.ref === ref)?.title;
                            return (
                              <>
                                {fb?.becameRef && (
                                  <p className="mt-1 text-[11px] text-accent">Sofia made this ticket {fb.becameRef}</p>
                                )}
                                {fromFb && <p className="mt-1 text-[11px] text-accent">From screen feedback {fromFb.ticketRef}</p>}
                                {(fromFb?.changesRef || fb?.changesRef) && (
                                  <p className="mt-0.5 text-[11px] text-muted" title={title((fromFb ?? fb)!.changesRef)}>
                                    Changes {(fromFb ?? fb)!.changesRef}
                                    {title((fromFb ?? fb)!.changesRef) ? `: ${title((fromFb ?? fb)!.changesRef)}` : ""}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                          {t.trackerUrl && (
                            <a href={t.trackerUrl} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-accent underline">
                              Open in tracker
                            </a>
                          )}
                          {t.after.length > 0 && (
                            <p className="mt-1 text-[11px] text-muted">Waiting on {t.after.join(", ")}</p>
                          )}
                        </article>
                      ))}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
