"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, FileText, Flag, MessageSquareText } from "lucide-react";
import { STAGES, type StageKey } from "@/lib/bmad";
import type { DocFile } from "@/lib/bmadDocs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import Markdown, { Facts, splitFrontMatter } from "@/components/Markdown";

export function DocStatusBadge({ status }: { status: "missing" | "draft" | "approved" }) {
  if (status === "approved")
    return (
      <Badge variant="outline" className="border-good/40 bg-good/10 text-[10px] text-good">
        <CheckCircle2 /> Approved
      </Badge>
    );
  if (status === "draft")
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
        <FileText /> Draft
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      <CircleDashed /> Not started
    </Badge>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// One stage's BMAD documents beside the screen: a list on the left, the chosen document as formatted Markdown.
export default function DocsSheet({
  useCaseId,
  stage,
  docs,
  initialPath,
  isCurrent,
  onClose,
  onMakeCurrent,
}: {
  useCaseId: string;
  stage: StageKey | null;
  docs: DocFile[];
  initialPath: string | null;
  isCurrent: boolean;
  onClose: () => void;
  onMakeCurrent: (s: StageKey) => void;
}) {
  const def = STAGES.find((s) => s.key === stage);
  const keys = new Set(def?.docs.map((d) => d.key) ?? []);
  const mine = docs.filter((d) => keys.has(d.key));
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState<{ body: string; facts: [string, string][]; updatedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!stage) return;
    const order = def?.docs.map((d) => d.key) ?? [];
    const byStage = [...mine].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key) || (a.role === "main" ? -1 : 0) - (b.role === "main" ? -1 : 0));
    setPath(initialPath ?? byStage[0]?.path ?? null);
    // Only when the sheet opens or the clicked document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, initialPath]);

  useEffect(() => {
    if (!path) {
      setContent(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    fetch(`/api/use-cases/${useCaseId}/bmad-docs?path=${encodeURIComponent(path)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (!r.ok) return setError(j.error || "Could not open the document");
        setContent({ ...splitFrontMatter(j.content as string), updatedAt: j.updatedAt });
      })
      .catch(() => live && setError("Could not open the document"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, useCaseId]);

  const current = mine.find((d) => d.path === path);

  return (
    <Sheet open={!!stage} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-5xl" aria-label="BMAD documents">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-lg">
              Stage {STAGES.findIndex((s) => s.key === stage) + 1}: {def?.label}
            </SheetTitle>
            {isCurrent ? (
              <Badge className="bg-primary/10 text-primary" variant="outline">
                You are here
              </Badge>
            ) : (
              stage && (
                <Button size="sm" variant="outline" className="h-7" onClick={() => onMakeCurrent(stage)}>
                  <Flag /> Work on this stage
                </Button>
              )
            )}
          </div>
          <SheetDescription>The documents BMAD has written for this stage. Approved means you signed off its gate.</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
          <nav aria-label="Documents in this stage" className="min-h-0 overflow-y-auto border-b p-3 md:border-r md:border-b-0">
            {def?.docs.map((d) => {
              const files = mine.filter((f) => f.key === d.key);
              const status = !files.some((f) => f.role !== "review")
                ? "missing"
                : files.some((f) => f.status === "approved")
                  ? "approved"
                  : "draft";
              return (
                <div key={d.key} className="mb-3">
                  <div className="mb-1 flex items-center justify-between gap-2 px-1">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{d.label}</span>
                    <DocStatusBadge status={status} />
                  </div>
                  {files.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nothing written yet.</p>}
                  <ul className="space-y-0.5">
                    {files.map((f) => (
                      <li key={f.path}>
                        <button
                          type="button"
                          onClick={() => setPath(f.path)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                            f.path === path && "bg-accent font-medium text-accent-foreground",
                            f.role !== "main" && "text-muted-foreground",
                          )}
                        >
                          {f.role === "review" ? <MessageSquareText className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
                          <span className="truncate">{f.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className="min-h-0 overflow-y-auto">
            {!path ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleDashed />
                  </EmptyMedia>
                  <EmptyTitle>No documents yet</EmptyTitle>
                  <EmptyDescription>BMAD hasn&apos;t written anything for this stage. The agents add documents here as they work.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : loading && !content ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Spinner />
              </div>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error}</p>
            ) : content ? (
              <article className="px-6 py-5">
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {current && <DocStatusBadge status={current.status} />}
                  <span>Updated {when(content.updatedAt)}</span>
                  <span className="font-mono">{path}</span>
                </div>
                <Facts facts={content.facts} />
                <Markdown>{content.body}</Markdown>
              </article>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
