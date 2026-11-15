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
import PreviewPanel from "./PreviewPanel";

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
  // Decisions the client made after the latest build, which the running app doesn't have yet.
  const builtAt = data.lastGeneratedAt ?? "";
  const changesSince = builtAt
    ? data.reviews.filter(
        (r) => r.kind !== "move" && r.kind !== "document" && ["approved", "answered", "edited"].includes(r.status) && (r.resolvedAt ?? "") > builtAt,
      ).length + data.feedback.filter((f) => f.status !== "built" && f.createdAt > builtAt).length
    : 0;
  const [wide, setWide] = useState(false);

  async function generate(redesign = false) {
    setNotice("");
    setSide("preview");
    const r = await fetch(`/api/use-cases/${data.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redesign }),
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

  return (
    <main className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-[1600px] flex-col gap-3 px-4 py-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{data.name}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: agent.color }} />
            <span>
              Talking with <span className="font-medium text-ink">{agent.name}</span>, {agent.role}
              {data.bmadVersion && <span className="ml-2 text-xs">BMAD {data.bmadVersion}</span>}
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
          {data.generateCount > 0 && (
            <button
              className="btn btn-ghost"
              title="Keep every feature, and rebuild the look from a fresh design direction"
              onClick={() => generate(true)}
              disabled={data.generateBusy}
            >
              Redesign
            </button>
          )}
          <button
            className={`btn ${ready.ready ? "btn-primary" : "border-warn/60 text-warn"}`}
            title={
              changesSince
                ? `${changesSince} decision${changesSince === 1 ? "" : "s"} since version ${data.generateCount} aren't in the app yet. Regenerate to build them in.`
                : ready.ready
                  ? "Build the app now"
                  : `${ready.reason}. You can still generate now; it builds from what BMAD has so far.`
            }
            onClick={() => generate()}
            disabled={data.generateBusy}
          >
            <span className={`h-2 w-2 rounded-full ${ready.ready ? "bg-white" : "bg-warn"}`} aria-hidden />
            {data.generateBusy ? "Generating..." : data.generateCount ? "Regenerate" : "Generate"}
            {!data.generateBusy && changesSince > 0 && (
              <span className="rounded-full bg-warn px-2 py-0.5 text-xs text-white" aria-label={`${changesSince} new decisions not built yet`}>
                {changesSince} new
              </span>
            )}
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

      <div className={`grid min-h-0 flex-1 gap-3 ${side === "preview" && wide ? "lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.6fr)]" : "lg:grid-cols-[1fr_420px]"}`}>
        <section className="glass min-h-0 overflow-hidden rounded-2xl">
          <Conversation data={data} reload={reload} />
        </section>
        <section className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center border-b border-line text-sm" role="tablist">
            {(["documents", "preview"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={side === k}
                onClick={() => setSide(k)}
                className={`flex-1 px-3 py-2 font-medium capitalize ${side === k ? "border-b-2 border-accent text-ink" : "text-muted"}`}
              >
                {k}
                {k === "preview" && data.generateCount > 0 ? ` v${data.generateCount}` : ""}
              </button>
            ))}
            {side === "preview" && (
              <button className="px-2 text-xs text-muted hover:text-ink" onClick={() => setWide((w) => !w)} aria-pressed={wide}>
                {wide ? "Narrow" : "Wide"}
              </button>
            )}
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto p-3 ${side === "documents" ? "space-y-3" : "flex flex-col"}`}>
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
