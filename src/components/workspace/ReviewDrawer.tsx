"use client";

import { useState } from "react";
import { REVIEW_KINDS } from "@/lib/bmad";
import type { ReviewT, UseCaseFull } from "@/lib/types";
import VoiceRecorder from "@/components/VoiceRecorder";
import DocumentCard from "@/components/DocumentCard";

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
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`glass fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col !bg-[var(--bg-elev)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Review queue"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <div>
            <h2 className="text-lg font-semibold">Review queue</h2>
            <p className="text-xs text-muted">One tap to approve, edit, or answer.</p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close review queue">
            Close
          </button>
        </div>
        <div className="flex border-b border-line text-sm" role="tablist">
          {(
            [
              ["todo", `To do (${open_.length})`],
              ["history", `History (${done.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`flex-1 px-3 py-2 font-medium ${tab === k ? "border-b-2 border-accent text-ink" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {tab === "todo" ? (
            <>
              {open_.length === 0 && <p className="text-center text-sm text-muted">All caught up.</p>}
              {items.map((r) => (
                <ReviewCard key={r.id} item={r} data={data} reload={reload} />
              ))}
              {older.length > 0 && (
                <div className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" className="text-left text-sm font-medium" onClick={() => setShowOld((v) => !v)} aria-expanded={showOld}>
                      From before version {data.generateCount} ({older.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 px-3 py-1 text-xs"
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
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted">Raised before the latest build, so they may no longer apply.</p>
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
              {done.length === 0 && <p className="text-center text-sm text-muted">Nothing decided yet.</p>}
              {[...done]
                .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))
                .map((r) => (
                  <HistoryRow key={r.id} item={r} />
                ))}
            </>
          )}
        </div>
      </aside>
    </>
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
    <div className="glass pop-in rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="chip">{REVIEW_KINDS[item.kind] ?? item.kind}</span>
        <span>{item.source}</span>
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{item.title}</h3>
      {item.detail && <p className="mt-1 text-sm text-muted">{item.detail}</p>}
      {item.reason && <p className="mt-1 text-xs text-muted">Why you&apos;re seeing this: {item.reason}</p>}
      <div className="mt-3 flex items-start gap-2">
        <textarea
          className="field min-h-14 flex-1 text-sm"
          placeholder={isMove ? "Optional: why did you move it?" : "Your answer (optional)"}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <VoiceRecorder label="" onTranscript={(t) => setAnswer((a) => (a ? `${a} ${t}` : t))} />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button className="btn btn-ghost" disabled={busy} onClick={() => resolve("dismissed")}>
          {isMove ? "Skip" : "Later"}
        </button>
        {answer.trim() ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => resolve("answered")}>
            Send answer
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => resolve("approved")}>
            {isMove ? "No update" : "Approve"}
          </button>
        )}
      </div>
    </div>
  );
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-good/15 text-good" },
  edited: { label: "Edited", cls: "bg-good/15 text-good" },
  answered: { label: "Answered", cls: "bg-accent/15 text-ink" },
  dismissed: { label: "Skipped", cls: "bg-warn/15 text-warn" },
};

// A decision already made: what it was, who asked, what the person said and when.
function HistoryRow({ item }: { item: ReviewT }) {
  const o = item.kind === "document" && item.status === "dismissed" ? { label: "Declined", cls: "bg-bad/15 text-bad" } : (OUTCOME[item.status] ?? OUTCOME.approved);
  const when = item.resolvedAt ? new Date(item.resolvedAt) : null;
  return (
    <div className="rounded-xl border border-line p-3 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="chip">{REVIEW_KINDS[item.kind] ?? item.kind}</span>
        <span className={`chip border-transparent ${o.cls}`}>{o.label}</span>
      </div>
      <p className="mt-1.5 font-medium leading-snug">{item.title}</p>
      {item.answer && <p className="mt-1 text-muted">You said: &ldquo;{item.answer}&rdquo;</p>}
      <p className="mt-1 text-xs text-muted">
        Asked by {item.source}
        {when ? `, decided ${when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}
      </p>
    </div>
  );
}
