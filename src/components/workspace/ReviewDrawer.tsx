"use client";

import { useEffect, useState } from "react";
import { REVIEW_KINDS } from "@/lib/bmad";
import type { ReviewT, UseCaseFull } from "@/lib/types";
import VoiceRecorder from "@/components/VoiceRecorder";
import DocumentCard from "@/components/DocumentCard";
import { ChevronDown, ChevronRight, CircleCheck, Hammer, PenLine } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildSummary, isBuildDecision, pendingForBuild } from "@/lib/buildQueue";
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
          <SheetDescription>One tap to approve, edit, or answer. Click anything in History to refine it.</SheetDescription>
          <p className="mt-1 flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            <Hammer className="size-3.5 shrink-0" />
            {buildSummary(pendingForBuild(data.reviews).length, data.feedback.filter((f) => f.status !== "built").length, data.generateCount + 1)}
          </p>
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
                  <HistoryRow key={r.id} item={r} reload={reload} nextVersion={data.generateCount + 1} />
                ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Ticks a decision in or out of the next build. Shared by to-do cards and history rows.
function IncludeSwitch({ item, reload, hint }: { item: ReviewT; reload: () => void; hint: string }) {
  const [on, setOn] = useState(item.includeInBuild);
  useEffect(() => setOn(item.includeInBuild), [item.includeInBuild]);
  if (!isBuildDecision(item.kind)) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
      <Label htmlFor={`inc-${item.id}`} className="flex flex-col items-start gap-0.5 text-xs font-medium">
        Include in next build
        <span className="font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Switch
        id={`inc-${item.id}`}
        checked={on}
        onCheckedChange={async (v) => {
          setOn(v);
          await fetch(`/api/reviews/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ include: v }),
          });
          reload();
        }}
      />
    </div>
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
      // Answering or approving puts it into the next build; "Later" keeps whatever the tick says.
      body: JSON.stringify({ status, answer: answer || undefined, include: status === "dismissed" ? false : true }),
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
      <div className="mt-3">
        <IncludeSwitch
          item={item}
          reload={reload}
          hint={item.includeInBuild ? "Built in as it stands, with the agent's best answer." : "Off until you answer. Approving or answering turns it on."}
        />
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

const fmt = (d: string) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// A decision already made. Click it to see the whole thing and refine it; a refinement shows "Updated"
// and goes into the next build unless the client unticks it.
function HistoryRow({ item, reload, nextVersion }: { item: ReviewT; reload: () => void; nextVersion: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(item.answer ?? "");
  const [busy, setBusy] = useState(false);
  const o = item.refinedAt
    ? { label: "Updated", cls: "bg-primary/15 text-primary" }
    : item.kind === "document" && item.status === "dismissed"
      ? { label: "Declined", cls: "bg-destructive/15 text-destructive" }
      : (OUTCOME[item.status] ?? OUTCOME.approved);
  const decision = isBuildDecision(item.kind);
  const build =
    !decision || item.status === "dismissed"
      ? null
      : item.builtInVersion > 0
        ? { label: `Built in v${item.builtInVersion}`, cls: "border-good/40 text-good" }
        : item.includeInBuild
          ? { label: `Goes into v${nextVersion}`, cls: "border-primary/40 text-primary" }
          : { label: "Held back", cls: "text-muted-foreground" };

  async function refine() {
    if (!text.trim()) return;
    setBusy(true);
    await fetch(`/api/reviews/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refine: true, answer: text.trim() }),
    });
    setBusy(false);
    setOpen(false);
    reload();
  }

  return (
    <div className={cn("rounded-lg border bg-card text-sm transition-shadow", open ? "shadow-sm ring-1 ring-primary/20" : "hover:shadow-xs")}>
      <button type="button" className="w-full p-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline">{REVIEW_KINDS[item.kind] ?? item.kind}</Badge>
          <Badge className={cn("border-transparent", o.cls)}>{o.label}</Badge>
          {build && (
            <Badge variant="outline" className={build.cls}>
              {build.label}
            </Badge>
          )}
          <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
        </div>
        <p className="mt-1.5 font-medium leading-snug">{item.title}</p>
        {item.answer && <p className="mt-1 line-clamp-2 text-muted-foreground">You said: &ldquo;{item.answer}&rdquo;</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Asked by {item.source}
          {item.resolvedAt ? `, decided ${fmt(item.resolvedAt)}` : ""}
          {item.refinedAt ? `, updated ${fmt(item.refinedAt)}` : ""}
        </p>
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {item.detail && <p className="text-muted-foreground">{item.detail}</p>}
          {item.previousAnswer && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Before: <span className="line-through">{item.previousAnswer}</span>
            </p>
          )}
          {item.kind !== "move" && (
            <>
              <div className="flex items-start gap-2">
                <Textarea
                  className="min-h-20 flex-1 text-sm"
                  placeholder="Refine it: what should it say now?"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  aria-label="Refine this decision"
                />
                <VoiceRecorder label="" onTranscript={(t) => setText((a) => (a ? `${a} ${t}` : t))} />
              </div>
              <IncludeSwitch
                item={item}
                reload={reload}
                hint={item.builtInVersion > 0 && !item.refinedAt ? `Already in v${item.builtInVersion}. A refinement goes into v${nextVersion}.` : "Untick to hold it back from the next build."}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button size="sm" disabled={busy || !text.trim() || text.trim() === (item.answer ?? "").trim()} onClick={refine}>
                  <PenLine /> {busy ? "Saving..." : "Save refinement"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
