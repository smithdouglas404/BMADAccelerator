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
  const items = data.reviews.filter((r) => r.status === "open");
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`glass fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col transition-transform duration-300 ${
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
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.length === 0 && <p className="text-center text-sm text-muted">All caught up.</p>}
          {items.map((r) => (
            <ReviewCard key={r.id} item={r} data={data} reload={reload} />
          ))}
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
