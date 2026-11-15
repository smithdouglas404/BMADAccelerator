"use client";

import { useEffect, useState } from "react";
import { KANBAN_COLUMNS } from "@/lib/bmad";
import type { TicketT } from "@/lib/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import Markdown, { Facts, splitFrontMatter } from "@/components/Markdown";

type Detail = { facts: [string, string][]; docs: { title: string; path: string; content: string }[]; bmadStatus: string };

// One board card or epic, opened: its entry in BMAD's ticket tree and its documents.
export default function TicketSheet({ ticket, tickets, onClose }: { ticket: TicketT | null; tickets: TicketT[]; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ticket) return;
    let live = true;
    setDetail(null);
    setError("");
    fetch(`/api/tickets/${ticket.id}/detail`)
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (!r.ok) return setError(j.error || "Could not open this card");
        setDetail(j);
      })
      .catch(() => live && setError("Could not open this card"));
    return () => {
      live = false;
    };
  }, [ticket]);

  const children = ticket?.kind === "epic" ? tickets.filter((t) => t.epicRef === ticket.ref && t.kind !== "epic") : [];
  const column = KANBAN_COLUMNS.find((c) => c.key === ticket?.status)?.label ?? "Backlog";

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" aria-label="Card details">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {ticket?.kind} {ticket?.ref}
            </Badge>
            <Badge variant="outline">{column}</Badge>
            {detail?.bmadStatus && <Badge variant="outline" className="text-muted-foreground">BMAD: {detail.bmadStatus}</Badge>}
            {ticket?.blocked && <Badge variant="destructive">Blocked</Badge>}
          </div>
          <SheetTitle className="text-lg leading-snug">{ticket?.title}</SheetTitle>
          {ticket?.unknown && <SheetDescription className="text-warn">Open question: {ticket.unknown}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !detail ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Spinner />
            </div>
          ) : (
            <>
              {ticket?.verify && (
                <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">How we know it&apos;s done</div>
                  {ticket.verify}
                </div>
              )}
              <Facts facts={detail.facts.filter(([k]) => !["verify", "unknown", "slug"].includes(k))} />
              {children.length > 0 && (
                <div className="mb-5">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Stories in this epic ({children.length})</div>
                  <ul className="space-y-1 text-sm">
                    {children.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                        <span>
                          <span className="font-mono text-xs text-muted-foreground">{c.ref}</span> {c.title}
                        </span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {KANBAN_COLUMNS.find((k) => k.key === c.status)?.label ?? "Backlog"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.docs.length === 0 && <p className="text-sm text-muted-foreground">BMAD hasn&apos;t written a plan for this card yet.</p>}
              {detail.docs.map((d, i) => {
                const { facts, body } = splitFrontMatter(d.content);
                return (
                  <section key={d.path}>
                    {i > 0 && <Separator className="my-6" />}
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{d.title}</h3>
                      <span className="font-mono text-[11px] text-muted-foreground">{d.path}</span>
                    </div>
                    <Facts facts={facts} />
                    <Markdown>{body}</Markdown>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
