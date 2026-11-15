"use client";

import { useState } from "react";
import { BMAD_DOC_TYPES, DOC_STAGES } from "@/lib/bmad";
import type { DocumentT } from "@/lib/types";

function size(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-good/15 text-good" },
  declined: { label: "Declined", cls: "bg-bad/15 text-bad" },
  in_review: { label: "In review", cls: "bg-warn/15 text-warn" },
};

// One uploaded document: the document agent's summary, its stage and BMAD type,
// and the person's decision (in review, approved or declined).
export default function DocumentCard({ doc, onSaved }: { doc: DocumentT; onSaved: () => void }) {
  const [type, setType] = useState(doc.bmadType);
  const [stage, setStage] = useState(doc.stage || "general");
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [description, setDescription] = useState(doc.description);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState(doc.declineNote || "");
  const [busy, setBusy] = useState(false);
  const route = BMAD_DOC_TYPES.find((t) => t.key === type)?.routesTo;
  const status = doc.status || (doc.approved ? "approved" : "in_review");
  const badge = BADGE[status] ?? BADGE.in_review;

  async function save(next?: "approved" | "declined" | "in_review") {
    setBusy(true);
    await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bmadType: type,
        stage,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        description,
        ...(next ? { status: next } : {}),
        ...(next === "declined" ? { declineNote: note } : {}),
      }),
    });
    setBusy(false);
    setDeclining(false);
    onSaved();
  }

  return (
    <div className={`glass pop-in rounded-xl p-4 ${status === "declined" ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{doc.fileName}</p>
          <p className="text-xs text-muted">
            {size(doc.sizeBytes)} · {DOC_STAGES.find((s) => s.key === (doc.stage || "general"))?.label}
          </p>
        </div>
        <span className={`chip shrink-0 border-transparent ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="mt-2 rounded-lg bg-white/40 p-2 text-sm dark:bg-white/5">
        <p className="text-xs font-semibold text-muted">Summary</p>
        <p className="mt-0.5 whitespace-pre-wrap">{doc.summary || "The document agent is reading this file. Its summary appears here in a moment."}</p>
      </div>
      {status === "declined" && doc.declineNote && <p className="mt-2 text-xs text-muted">Declined because: {doc.declineNote}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Stage
          <select className="field mt-1 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
            {DOC_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          What is it?
          <select className="field mt-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {BMAD_DOC_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-2 block text-xs text-muted">
        Tags (comma separated)
        <input className="field mt-1 text-sm" value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="mt-2 block text-xs text-muted">
        One-line description
        <input className="field mt-1 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {declining && (
        <label className="mt-2 block text-xs text-muted">
          Why decline it? (optional)
          <input className="field mt-1 text-sm" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">Goes to: {route}</span>
        <div className="flex flex-wrap gap-2">
          {declining ? (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setDeclining(false)}>
                Cancel
              </button>
              <button className="btn border-bad/40 text-bad" disabled={busy} onClick={() => save("declined")}>
                Decline
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => save()}>
                Save
              </button>
              {status === "declined" ? (
                <button className="btn btn-ghost" disabled={busy} onClick={() => save("in_review")}>
                  Back to review
                </button>
              ) : (
                <button className="btn btn-ghost text-bad" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline
                </button>
              )}
              {status !== "approved" && (
                <button className="btn btn-primary" disabled={busy} onClick={() => save("approved")}>
                  Approve
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
