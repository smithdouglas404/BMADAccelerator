"use client";

import { useState } from "react";
import { REVIEW_KINDS } from "@/lib/bmad";
import type { ReviewT, UseCaseFull } from "@/lib/types";
import VoiceRecorder from "@/components/VoiceRecorder";
import DocumentCard from "@/components/DocumentCard";
import { ChevronRight, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// One human-in-the-loop inbox, modeled on BMAD's project context flow:
// you bring what you have, BMAD verifies the rest, you approve.
export default function ReviewDrawer({
  data,
  open,
  onClose,
  reload,
}: {
  data: UseCaseFull;
  open: boolean;
  onClose: () => void;
  reload: () => void;
}) {
  const [tab, setTab] = useState<"todo" | "history">("todo");
  const open_ = data.reviews.filter((r) => r.status === "open");
  // Items raised before the latest build may belong to an earlier version; they sit in their own group.
  const cut = data.lastGeneratedAt ?? "";
  const isOld = (r: ReviewT) => !!cut && r.kind !== "document" && r.createdAt < cut;
  const items = open_.filter((r) => !isOld(r));
  const older = open_.filter(isOld);
  const [showOld, setShowOld] = useState(false);
  const [closing, setClosing] = useState(false);
  const done = data.reviews.filter((r) => r.status !== "open");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md" aria-label="Review queue">
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg">Review queue</SheetTitle>
          <SheetDescription>One tap to approve, edit, or answer.</SheetDescription>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="todo">
                To do <Badge variant="secondary" className="h-4 px-1.5 tabular-nums">{open_.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="history">
                History <Badge variant="secondary" className="h-4 px-1.5 tabular-nums">{done.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {tab === "todo" ? (
            <>
              {open_.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CircleCheck />
                    </EmptyMedia>
                    <EmptyTitle>All caught up</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
              {items.map((r) => (
                <ReviewCard key={r.id} item={r} data={data} reload={reload} />
              ))}
              {older.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left text-sm font-medium"
                      onClick={() => setShowOld((v) => !v)}
                      aria-expanded={showOld}
                    >
                      <ChevronRight className={cn("size-4 transition-transform", showOld && "rotate-90")} />
                      From before version {data.generateCount} ({older.length})
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={closing}
                      onClick={async () => {
                        setClosing(true);
                        try {
                          await fetch(`/api/use-cases/${data.id}/reviews/close-old`, { method: "POST" });
                        } finally {
                          setClosing(false);
                          reload();
                        }
                      }}
                    >
                      {closing ? "Closing" : "Close these"}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Raised before the latest build, so they may no longer apply.</p>
                  {showOld && (
                    <div className="mt-3 space-y-3">
                      {older.map((r) => (
                        <ReviewCard key={r.id} item={r} data={data} reload={reload} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {done.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing decided yet.</p>}
              {[...done]
                .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))
                .map((r) => (
                  <HistoryRow key={r.id} item={r} />
                ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewCard({ item, data, reload }: { item: ReviewT; data: UseCaseFull; reload: () => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve(status: "approved" | "answered" | "dismissed") {
    setBusy(true);
    await fetch(`/api/reviews/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, answer: answer || undefined }),
    });
    setBusy(false);
    reload();
  }

  if (item.kind === "document") {
    const doc = data.documents.find((d) => d.id === item.targetId);
    if (doc) return <DocumentCard doc={doc} onSaved={reload} />;
  }

  const isMove = item.kind === "move";
  return (
    <Card className="pop-in gap-0 p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{REVIEW_KINDS[item.kind] ?? item.kind}</Badge>
        <span>{item.source}</span>
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{item.title}</h3>
      {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
      {item.reason && <p className="mt-1 text-xs text-muted-foreground">Why you&apos;re seeing this: {item.reason}</p>}
      <div className="mt-3 flex items-start gap-2">
        <Textarea
          className="min-h-14 flex-1 text-sm"
          placeholder={isMove ? "Optional: why did you move it?" : "Your answer (optional)"}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <VoiceRecorder label="" onTranscript={(t) => setAnswer((a) => (a ? `${a} ${t}` : t))} />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => resolve("dismissed")}>
          {isMove ? "Skip" : "Later"}
        </Button>
        {answer.trim() ? (
          <Button disabled={busy} onClick={() => resolve("answered")}>
            Send answer
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => resolve("approved")}>
            {isMove ? "No update" : "Approve"}
          </Button>
        )}
      </div>
    </Card>
  );
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-good/15 text-good" },
  edited: { label: "Edited", cls: "bg-good/15 text-good" },
  answered: { label: "Answered", cls: "bg-primary/15 text-foreground" },
  dismissed: { label: "Skipped", cls: "bg-warn/15 text-warn" },
};

// A decision already made: what it was, who asked, what the person said and when.
function HistoryRow({ item }: { item: ReviewT }) {
  const o = item.kind === "document" && item.status === "dismissed" ? { label: "Declined", cls: "bg-destructive/15 text-destructive" } : (OUTCOME[item.status] ?? OUTCOME.approved);
  const when = item.resolvedAt ? new Date(item.resolvedAt) : null;
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{REVIEW_KINDS[item.kind] ?? item.kind}</Badge>
        <Badge className={cn("border-transparent", o.cls)}>{o.label}</Badge>
      </div>
      <p className="mt-1.5 font-medium leading-snug">{item.title}</p>
      {item.answer && <p className="mt-1 text-muted-foreground">You said: &ldquo;{item.answer}&rdquo;</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        Asked by {item.source}
        {when ? `, decided ${when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}
      </p>
    </div>
  );
}
