"use client";

import { useState } from "react";
import { GLOSSARY, KANBAN_COLUMNS } from "@/lib/bmad";
import type { TicketT, UseCaseFull } from "@/lib/types";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<string, string> = {
  story: "bg-primary/15 text-primary",
  bug: "bg-destructive/15 text-destructive",
  spike: "bg-warn/15 text-warn",
  feedback: "bg-brand2/20 text-foreground",
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
          <Badge variant="secondary" className="tabular-nums">{cards.length} cards</Badge>
          <span className="text-xs text-muted-foreground" title={`${GLOSSARY.Epic} ${GLOSSARY.Story}`}>
            Rows are epics (big features). Cards are stories (the pieces).
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={sync} disabled={syncing}>
          <RefreshCw className={cn(syncing && "animate-spin")} /> {syncing ? "Syncing..." : "Refresh from BMAD"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div className="grid min-w-[900px] grid-cols-5 gap-2">
          {KANBAN_COLUMNS.map((c) => (
            <div key={c.key} className="sticky top-0 z-10 flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
              {c.label}
              <span className="tabular-nums font-normal">{cards.filter((t) => t.status === c.key).length}</span>
            </div>
          ))}
        </div>
        {lanes.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Cards appear here as Sofia, BMAD&apos;s Product Owner, writes epics and stories from your answers.
          </p>
        ) : (
          lanes.map((lane, li) => (
            <section key={lane.epic?.id ?? `loose-${li}`} className="mt-3 min-w-[900px]">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                {lane.epic ? `Epic ${lane.epic.ref}: ${lane.epic.title}` : (lane.label ?? "Not in an epic")}
                {lane.epic && !lane.epic.refined && (
                  <Badge variant="outline" className="border-warn/40 bg-warn/10 text-[10px] text-warn">Needs detail</Badge>
                )}
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {KANBAN_COLUMNS.map((col) => (
                  <div
                    key={col.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dragging && move(dragging, col.key)}
                    className={cn("min-h-20 space-y-2 rounded-lg border border-dashed p-1.5 transition-colors", dragging && "border-primary/40 bg-accent/30")}
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
                          className="pop-in cursor-grab rounded-lg border bg-card p-2.5 text-sm shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge className={cn("border-transparent text-[10px] capitalize", KIND_STYLE[t.kind])}>
                              {t.kind} {t.ref}
                            </Badge>
                            <span className="flex gap-1">
                              {t.unknown && (
                                <Badge className="border-transparent bg-warn/20 text-[10px] text-warn" title={t.unknown}>
                                  ?
                                </Badge>
                              )}
                              {t.blocked && (
                                <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                              )}
                            </span>
                          </div>
                          <p className="mt-1.5 leading-snug">{t.title}</p>
                          {t.kind === "feedback" && t.verify.includes("/api/feedback/") && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.verify.slice(t.verify.indexOf("/api/feedback/"))}
                              alt="Marked-up screen"
                              className="mt-1.5 max-h-24 w-full rounded-md border object-cover object-top"
                            />
                          )}
                          {(() => {
                            const fromFb = data.feedback.find((f) => f.becameRef && f.becameRef === t.ref);
                            const fb = t.kind === "feedback" ? data.feedback.find((f) => f.ticketRef === t.ref) : undefined;
                            const title = (ref: string) => data.tickets.find((x) => x.ref === ref)?.title;
                            return (
                              <>
                                {fb?.becameRef && (
                                  <p className="mt-1 text-[11px] text-primary">Sofia made this ticket {fb.becameRef}</p>
                                )}
                                {fromFb && <p className="mt-1 text-[11px] text-primary">From screen feedback {fromFb.ticketRef}</p>}
                                {(fromFb?.changesRef || fb?.changesRef) && (
                                  <p className="mt-0.5 text-[11px] text-muted-foreground" title={title((fromFb ?? fb)!.changesRef)}>
                                    Changes {(fromFb ?? fb)!.changesRef}
                                    {title((fromFb ?? fb)!.changesRef) ? `: ${title((fromFb ?? fb)!.changesRef)}` : ""}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                          {t.trackerUrl && (
                            <a href={t.trackerUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                              Open in tracker <ExternalLink className="size-3" />
                            </a>
                          )}
                          {t.after.length > 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">Waiting on {t.after.join(", ")}</p>
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
