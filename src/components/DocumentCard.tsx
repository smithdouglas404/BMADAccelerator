"use client";

import { useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { AGENTS, BMAD_DOC_TYPES, DOC_STAGES, ROUTABLE_AGENTS } from "@/lib/bmad";
import type { DocumentT } from "@/lib/types";
import { FileText, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

function size(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-good/15 text-good" },
  declined: { label: "Declined", cls: "bg-destructive/15 text-destructive" },
  in_review: { label: "In review", cls: "bg-warn/15 text-warn" },
};

// Common tags a person can tap to add, besides the ones the document agent suggests.
const COMMON_TAGS = ["requirements", "customers", "design", "data", "security", "compliance", "budget", "timeline", "integration", "reporting"];

const add = (prev: string, t: string) => (prev ? `${prev} ${t}` : t);

// One uploaded document: the document agent's summary, its stage and BMAD type,
// and the person's decision (in review, approved or declined).
export default function DocumentCard({ doc, onSaved }: { doc: DocumentT; onSaved: () => void }) {
  const [type, setType] = useState(doc.bmadType);
  const [stage, setStage] = useState(doc.stage || "general");
  const [tags, setTags] = useState<string[]>(doc.tags);
  const [newTag, setNewTag] = useState("");
  const [description, setDescription] = useState(doc.description);
  const [summary, setSummary] = useState(doc.summary);
  const [routing, setRouting] = useState(doc.routing ?? []);
  const pending = !doc.summary || doc.summary.startsWith("No summary yet");
  // Fill in what the document agent writes while the person hasn't started editing.
  const edited = useRef(false);
  useEffect(() => {
    if (edited.current) return;
    setDescription(doc.description);
    setSummary(doc.summary);
    setTags(doc.tags);
    setType(doc.bmadType);
    setRouting(doc.routing ?? []);
  }, [doc.description, doc.summary, doc.tags, doc.bmadType, doc.routing]);
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
        tags,
        routing,
        description,
        ...(summary && !summary.startsWith("No summary yet") ? { summary } : {}),
        ...(next ? { status: next } : {}),
        ...(next === "declined" ? { declineNote: note } : {}),
      }),
    });
    setBusy(false);
    setDeclining(false);
    edited.current = false;
    onSaved();
  }

  return (
    <Card
      className={cn("pop-in gap-0 p-4", status === "declined" && "opacity-70")}
      onInput={() => (edited.current = true)}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("button")) edited.current = true;
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
          <p className="truncate font-medium">{doc.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {size(doc.sizeBytes)} · {DOC_STAGES.find((s) => s.key === (doc.stage || "general"))?.label}
          </p>
          </div>
        </div>
        <Badge className={cn("shrink-0 border-transparent", badge.cls)}>{badge.label}</Badge>
      </div>
      <label className="mt-3 block text-xs font-semibold text-muted-foreground">
        Description <span className="font-normal">(what this file is, in one line)</span>
        <div className="mt-1 flex items-start gap-2">
          <Input
            className="flex-1 text-sm font-normal"
            value={description}
            placeholder={pending ? "Claude fills this in after reading the file" : ""}
            onChange={(e) => setDescription(e.target.value)}
          />
          <VoiceRecorder label="" onTranscript={(t) => setDescription((v) => add(v, t))} />
        </div>
      </label>
      <label className="mt-3 block text-xs font-semibold text-muted-foreground">
        Summary <span className="font-normal">(what it says, who it&apos;s for, issues and outcomes)</span>
        <div className="mt-1 flex items-start gap-2">
          <Textarea
            className="min-h-36 flex-1 text-sm font-normal leading-relaxed"
            value={pending && !summary ? "" : summary}
            placeholder={doc.summary || "Claude is reading the file. Its summary appears here in a moment, and you can change or add to it."}
            onChange={(e) => setSummary(e.target.value)}
          />
          <VoiceRecorder label="" onTranscript={(t) => setSummary((v) => add(v.startsWith("No summary yet") ? "" : v, t))} />
        </div>
      </label>
      {status === "declined" && doc.declineNote && <p className="mt-2 text-xs text-muted-foreground">Declined because: {doc.declineNote}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Stage
          <NativeSelect wrapperClassName="mt-1 w-full" className="text-sm text-foreground" value={stage} onChange={(e) => setStage(e.target.value)}>
            {DOC_STAGES.map((s) => (
              <NativeSelectOption key={s.key} value={s.key}>
                {s.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="text-xs text-muted-foreground">
          What is it?
          <NativeSelect wrapperClassName="mt-1 w-full" className="text-sm text-foreground" value={type} onChange={(e) => setType(e.target.value)}>
            {BMAD_DOC_TYPES.map((t) => (
              <NativeSelectOption key={t.key} value={t.key}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        <p className="font-semibold">
          Goes to <span className="font-normal">(the BMAD agents who will use it; tap to add or remove)</span>
        </p>
        <ul className="mt-1 space-y-1">
          {routing.map((r) => {
            const a = AGENTS[r.agent as keyof typeof AGENTS];
            return (
              <li key={r.agent} className="flex items-start gap-2">
                <button
                  className="chip shrink-0 border-transparent text-foreground"
                  style={{ background: `${a?.color}26` }}
                  onClick={() => setRouting(routing.filter((x) => x.agent !== r.agent))}
                  aria-label={`Remove ${a?.name}`}
                >
                  {a?.name}, {a?.role} <X className="size-3" />
                </button>
                {r.why && <span className="pt-0.5">{r.why}</span>}
              </li>
            );
          })}
        </ul>
        <div className="mt-1 flex flex-wrap gap-1">
          {ROUTABLE_AGENTS.filter((k) => !routing.some((r) => r.agent === k)).map((k) => (
            <button key={k} className="chip" onClick={() => setRouting([...routing, { agent: k, why: "" }])} aria-label={`Add ${AGENTS[k].name}`}>
              <Plus className="size-3" /> {AGENTS[k].name}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        <p className="font-semibold">Tags <span className="font-normal">(labels that help the agents find this file; tap to add or remove)</span></p>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <button key={t} className="chip border-primary/30 bg-primary/10 text-foreground" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
              {t} <X className="size-3" />
            </button>
          ))}
          {COMMON_TAGS.filter((t) => !tags.includes(t)).map((t) => (
            <button key={t} className="chip" onClick={() => setTags([...tags, t])} aria-label={`Add tag ${t}`}>
              <Plus className="size-3" /> {t}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = newTag.trim().toLowerCase();
            if (t && !tags.includes(t)) setTags([...tags, t]);
            setNewTag("");
          }}
        >
          <Input className="h-8 flex-1 text-sm" value={newTag} placeholder="Your own tag" onChange={(e) => setNewTag(e.target.value)} aria-label="Add your own tag" />
          <Button variant="outline" size="sm" type="submit" disabled={!newTag.trim()}>
            Add
          </Button>
        </form>
      </div>
      {declining && (
        <label className="mt-2 block text-xs text-muted-foreground">
          Why decline it? (optional)
          <div className="mt-1 flex items-start gap-2">
            <Input className="flex-1 text-sm" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <VoiceRecorder label="" onTranscript={(t) => setNote((v) => add(v, t))} />
          </div>
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{routing.length ? "" : `Goes to: ${route}. `}Tap a mic button to talk instead of typing.</span>
        <div className="flex flex-wrap gap-2">
          {declining ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => save("declined")}>
                Decline
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => save()}>
                Save
              </Button>
              {status === "declined" ? (
                <Button variant="ghost" disabled={busy} onClick={() => save("in_review")}>
                  Back to review
                </Button>
              ) : (
                <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline
                </Button>
              )}
              {status !== "approved" && (
                <Button disabled={busy} onClick={() => save("approved")}>
                  Approve
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
