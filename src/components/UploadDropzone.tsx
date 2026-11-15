"use client";

import { useRef, useState } from "react";

type Props = { useCaseId: string; onUploaded: () => void };

export default function UploadDropzone({ useCaseId, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    const res = await fetch(`/api/use-cases/${useCaseId}/documents`, { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) setError("Upload failed. Try again.");
    else onUploaded();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
        over ? "border-accent bg-accent/10" : "border-line"
      }`}
    >
      <p className="font-medium">Drop documents here</p>
      <p className="mt-1 text-sm text-muted">PowerPoint, Excel, Word, PDF, images, notes. As many as you like.</p>
      <button type="button" className="btn mt-4" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Uploading..." : "Choose files"}
      </button>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
