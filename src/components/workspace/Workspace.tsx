"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AGENTS, type AgentKey, type StageKey } from "@/lib/bmad";
import { patchUseCase, type UseCaseFull } from "@/lib/types";
import { buildSummary, pendingForBuild } from "@/lib/buildQueue";
import ProcessRail from "./ProcessRail";
import Conversation from "./Conversation";
import KanbanBoard from "./KanbanBoard";
import ReviewDrawer from "./ReviewDrawer";
import UploadDropzone from "@/components/UploadDropzone";
import DocumentCard from "@/components/DocumentCard";
import PreviewPanel from "./PreviewPanel";
import { Focus, Hammer, Inbox, LogOut, Maximize2, Minimize2, Paintbrush, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BorderBeam } from "@/components/magicui/border-beam";
import { cn } from "@/lib/utils";

function readiness(data: UseCaseFull) {
  const gaps: string[] = [];
  if (!data.intentDone.trim()) gaps.push("what done looks like");
  if (!data.customer.trim()) gaps.push("who it's for");
  if (!data.problem.trim()) gaps.push("the problem");
  const open = data.reviews.filter(
    (r) => r.status === "open" && ["assumption", "question", "unknown"].includes(r.kind),
  ).length;
  if (open) gaps.push(`${open} open question${open === 1 ? "" : "s"}`);
  return { ready: gaps.length === 0, reason: gaps.length ? `Still missing: ${gaps.join(", ")}` : "Ready to build" };
}

export default function Workspace({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [side, setSide] = useState<"documents" | "preview">("documents");
  const [boardHeight, setBoardHeight] = useState(260);
  const [focus, setFocus] = useState(false);
  const [notice, setNotice] = useState("");
  const dragStart = useRef<{ y: number; h: number } | null>(null);

  // Live updates while agents work.
  const fast = data.agentBusy || data.generateBusy || data.preview?.starting;
  useEffect(() => {
    const t = setInterval(reload, fast ? 2000 : 5000);
    return () => clearInterval(t);
  }, [reload, fast]);

  const agentKey = (data.activeAgent in AGENTS ? data.activeAgent : "concierge") as AgentKey;
  const agent = AGENTS[agentKey];
  const openCount = data.reviews.filter((r) => r.status === "open").length;
  const ready = readiness(data);
  // What the next build takes in: ticked review-queue decisions not built yet, plus unbuilt screen mark-ups.
  const tickedCount = pendingForBuild(data.reviews).length;
  const markupCount = data.feedback.filter((f) => f.status !== "built").length;
  const changesSince = tickedCount + markupCount;
  const [wide, setWide] = useState(false);
  const [boardFull, setBoardFull] = useState(false);

  async function generate(mode: "" | "redesign" | "fresh" = "") {
    setNotice("");
    setSide("preview");
    const r = await fetch(`/api/use-cases/${data.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redesign: mode === "redesign", fresh: mode === "fresh" }),
    });
    if (!r.ok) setNotice((await r.json()).error || "Generate could not start.");
    reload();
  }

  async function selectStage(stage: StageKey) {
    await patchUseCase(data.id, { stage });
    reload();
  }

  function onHandleDown(e: React.PointerEvent) {
    dragStart.current = { y: e.clientY, h: boardHeight };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const next = dragStart.current.h - (e.clientY - dragStart.current.y);
    setBoardHeight(Math.min(Math.max(next, 140), window.innerHeight * 0.7));
  }

  const generateTip = changesSince
    ? `${buildSummary(tickedCount, markupCount, data.generateCount + 1)}${ready.ready ? "" : ` ${ready.reason}.`}`
    : ready.ready
      ? "Build the app now"
      : `${ready.reason}. You can still generate now; it builds from what BMAD has so far.`;

  return (
    <main className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-[1600px] flex-col gap-3 px-4 py-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{data.name}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex size-2">
              {data.agentBusy && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: agent.color }} />}
              <span className="relative inline-flex size-2 rounded-full" style={{ background: agent.color }} />
            </span>
            <span>
              Talking with <span className="font-medium text-foreground">{agent.name}</span>, {agent.role}
            </span>
            {data.bmadVersion && (
              <Badge variant="outline" className="font-mono text-[10px]">
                BMAD {data.bmadVersion}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setReviewOpen(true)} aria-label={`Review queue, ${openCount} open`}>
            <Inbox /> Review
            {openCount > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">{openCount}</Badge>}
          </Button>
          <Button variant="ghost" onClick={() => setFocus((f) => !f)} aria-pressed={focus}>
            <Focus /> {focus ? "Show board" : "Focus"}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">
              <LogOut /> Save and exit
            </Link>
          </Button>
          {data.generateCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" onClick={() => generate("redesign")} disabled={data.generateBusy}>
                  <Paintbrush /> Redesign
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keep every feature, and rebuild the look from a fresh design direction</TooltipContent>
            </Tooltip>
          )}
          {data.generateCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" disabled={data.generateBusy}>
                  <RotateCcw /> Start fresh
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Start fresh?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The current app is set aside (kept in the project&apos;s archive) and a new one is built from BMAD&apos;s documents, as if
                    it were the first time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => generate("fresh")}>Start fresh</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={ready.ready || data.generateBusy ? "default" : "outline"}
                className={cn("relative overflow-hidden", !ready.ready && !data.generateBusy && "border-warn/60 text-warn hover:text-warn")}
                onClick={() => generate()}
                disabled={data.generateBusy}
              >
                <Hammer />
                {data.generateBusy ? "Generating..." : data.generateCount ? "Regenerate" : "Generate"}
                {!data.generateBusy && changesSince > 0 && (
                  <Badge className="bg-warn text-white" aria-label={`${changesSince} changes go into the next build`}>
                    {changesSince} to build
                  </Badge>
                )}
                {data.generateBusy && <BorderBeam size={60} duration={3} colorFrom="#ffffff" colorTo="#c4b5fd" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{generateTip}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {notice && (
        <div className="pop-in flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2 text-sm shadow-xs" role="status">
          {notice}
          <Button variant="ghost" size="icon-sm" onClick={() => setNotice("")} aria-label="Dismiss">
            <X />
          </Button>
        </div>
      )}

      <ProcessRail data={data} onSelect={selectStage} />

      <div className={cn("grid min-h-0 flex-1 gap-3", side === "preview" && wide ? "lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.6fr)]" : "lg:grid-cols-[1fr_420px]")}>
        <Card className="min-h-0 gap-0 overflow-hidden py-0">
          <Conversation data={data} reload={reload} />
        </Card>
        <Card className="flex min-h-0 flex-col gap-0 overflow-hidden py-0">
          <Tabs value={side} onValueChange={(v) => setSide(v as typeof side)} className="gap-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <TabsList className="flex-1">
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="preview">
                  Preview
                  {data.generateCount > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 font-mono text-[10px]">
                      v{data.generateCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              {side === "preview" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => setWide((w) => !w)} aria-pressed={wide} aria-label={wide ? "Narrow preview" : "Wide preview"}>
                      {wide ? <Minimize2 /> : <Maximize2 />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{wide ? "Narrow" : "Wide"}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </Tabs>
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", side === "documents" ? "space-y-3" : "flex flex-col")}>
            {side === "documents" ? (
              <>
                <UploadDropzone useCaseId={data.id} onUploaded={reload} />
                {data.documents.map((d) => (
                  <DocumentCard key={d.id} doc={d} onSaved={reload} />
                ))}
              </>
            ) : (
              <PreviewPanel data={data} reload={reload} />
            )}
          </div>
        </Card>
      </div>

      {!focus && (
        <Card
          className={cn("flex flex-col gap-0 overflow-hidden py-0", boardFull && "fixed inset-x-3 top-16 bottom-3 z-40 shadow-2xl")}
          style={boardFull ? undefined : { height: boardHeight }}
        >
          {!boardFull && <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize board"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={() => (dragStart.current = null)}
            className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center"
          >
            <span className="h-1 w-12 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
          </div>}
          <div className="min-h-0 flex-1">
            <KanbanBoard data={data} reload={reload} full={boardFull} onToggleFull={() => setBoardFull((f) => !f)} />
          </div>
        </Card>
      )}

      <ReviewDrawer data={data} open={reviewOpen} onClose={() => setReviewOpen(false)} reload={reload} />
    </main>
  );
}
