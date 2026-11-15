"use client";

import { useRef, useState } from "react";
import { DOC_STAGES } from "@/lib/bmad";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type Props = { useCaseId: string; onUploaded: () => void };

export default function UploadDropzone({ useCaseId, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("general");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    form.append("stage", stage);
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
      className={cn("rounded-xl border-2 border-dashed bg-muted/30 p-6 text-center transition-colors", over ? "border-primary bg-accent" : "border-border")}
    >
      <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-background shadow-xs">
        <Upload className="size-4 text-muted-foreground" />
      </span>
      <p className="font-medium">Drop documents here</p>
      <p className="mt-1 text-sm text-muted-foreground">PowerPoint, Excel, Word, PDF, images, notes. As many as you like.</p>
      <label className="mx-auto mt-4 flex max-w-xs items-center justify-center gap-2 text-sm text-muted-foreground">
        For
        <NativeSelect size="sm" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Which stage these documents are for">
          {DOC_STAGES.map((s) => (
            <NativeSelectOption key={s.key} value={s.key}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <Button type="button" variant="outline" className="mt-3" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Uploading..." : "Choose files"}
      </Button>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
