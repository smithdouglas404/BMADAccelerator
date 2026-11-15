"use client";

import { useState } from "react";
import { BMAD_DOC_TYPES } from "@/lib/bmad";
import type { DocumentT } from "@/lib/types";

function size(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// One uploaded document: confirm its BMAD type, tags and description, then approve.
export default function DocumentCard({ doc, onSaved }: { doc: DocumentT; onSaved: () => void }) {
  const [type, setType] = useState(doc.bmadType);
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [description, setDescription] = useState(doc.description);
  const [busy, setBusy] = useState(false);
  const route = BMAD_DOC_TYPES.find((t) => t.key === type)?.routesTo;

  async function save(approved: boolean) {
    setBusy(true);
    await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bmadType: type,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        description,
        approved,
      }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    <div className="glass pop-in rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{doc.fileName}</p>
          <p className="text-xs text-muted">{size(doc.sizeBytes)}</p>
        </div>
        {doc.approved ? (
          <span className="chip border-transparent bg-good/15 text-good">Approved</span>
        ) : (
          <span className="chip border-transparent bg-warn/15 text-warn">Needs a look</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        {doc.summary || "The concierge's summary appears here once the agents are connected."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
        <label className="text-xs text-muted">
          Tags (comma separated)
          <input className="field mt-1 text-sm" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <label className="mt-2 block text-xs text-muted">
        One-line description
        <input className="field mt-1 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Goes to: {route}</span>
        <div className="flex gap-2">
          <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
            Save
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
