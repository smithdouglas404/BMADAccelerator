"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AGENTS, type AgentKey, type StageKey } from "@/lib/bmad";
import { patchUseCase, type UseCaseFull } from "@/lib/types";
import ProcessRail from "./ProcessRail";
import Conversation from "./Conversation";
import KanbanBoard from "./KanbanBoard";
import ReviewDrawer from "./ReviewDrawer";
import UploadDropzone from "@/components/UploadDropzone";
import DocumentCard from "@/components/DocumentCard";

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
  useEffect(() => {
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  const agentKey = (data.activeAgent in AGENTS ? data.activeAgent : "concierge") as AgentKey;
  const agent = AGENTS[agentKey];
  const openCount = data.reviews.filter((r) => r.status === "open").length;
  const ready = readiness(data);

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

  return (
    <main className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-[1600px] flex-col gap-3 px-4 py-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{data.name}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: agent.color }} />
            <span>
              Talking with <span className="font-medium text-ink">{agent.name}</span>, {agent.role}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => setReviewOpen(true)} aria-label={`Review queue, ${openCount} open`}>
            Review
            {openCount > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">{openCount}</span>
            )}
          </button>
          <button className="btn btn-ghost" onClick={() => setFocus((f) => !f)} aria-pressed={focus}>
            {focus ? "Show board" : "Focus"}
          </button>
          <Link href="/" className="btn btn-ghost">
            Save and exit
          </Link>
          <button
            className={`btn ${ready.ready ? "btn-primary" : "border-warn/60 text-warn"}`}
            title={ready.reason}
            onClick={() =>
              setNotice(
                `${ready.reason}. Generate (building with Claude Code and a live preview) arrives in step 3 of the plan.`,
              )
            }
          >
            <span className={`h-2 w-2 rounded-full ${ready.ready ? "bg-white" : "bg-warn"}`} aria-hidden />
            Generate
          </button>
        </div>
      </header>

      {notice && (
        <div className="glass pop-in flex items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm" role="status">
          {notice}
          <button className="text-muted hover:text-ink" onClick={() => setNotice("")} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <ProcessRail data={data} onSelect={selectStage} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_380px]">
        <section className="glass min-h-0 overflow-hidden rounded-2xl">
          <Conversation data={data} reload={reload} />
        </section>
        <section className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
          <div className="flex border-b border-line text-sm" role="tablist">
            {(["documents", "preview"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={side === k}
                onClick={() => setSide(k)}
                className={`flex-1 px-3 py-2 font-medium capitalize ${side === k ? "border-b-2 border-accent text-ink" : "text-muted"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {side === "documents" ? (
              <>
                <UploadDropzone useCaseId={data.id} onUploaded={reload} />
                {data.documents.map((d) => (
                  <DocumentCard key={d.id} doc={d} onSaved={reload} />
                ))}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
                <p className="font-medium text-ink">Live preview</p>
                <p>
                  After Generate, your app runs here in a split view. You can circle or box any part of a screen and
                  say what to change.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {!focus && (
        <section className="glass flex flex-col overflow-hidden rounded-2xl" style={{ height: boardHeight }}>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize board"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={() => (dragStart.current = null)}
            className="flex h-3 cursor-row-resize items-center justify-center"
          >
            <span className="h-1 w-12 rounded-full bg-line" />
          </div>
          <div className="min-h-0 flex-1">
            <KanbanBoard data={data} reload={reload} />
          </div>
        </section>
      )}

      <ReviewDrawer data={data} open={reviewOpen} onClose={() => setReviewOpen(false)} reload={reload} />
    </main>
  );
}
