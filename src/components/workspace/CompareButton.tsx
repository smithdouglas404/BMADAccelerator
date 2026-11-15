"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Markdown, { splitFrontMatter } from "@/components/Markdown";

type Status = { state: "idle" | "building" | "judging" | "done" | "failed"; error?: string; comparison?: string; version?: number };

// "Would plain Claude Code have built more from the idea alone?" One button builds that control
// app from the client's own words and has the advisor score both side by side.
export default function CompareButton({ useCaseId, disabled }: { useCaseId: string; disabled?: boolean }) {
  const [s, setS] = useState<Status>({ state: "idle" });
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(`/api/use-cases/${useCaseId}/compare`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setS(j))
      .catch(() => {});
  }, [useCaseId]);
  useEffect(load, [load]);
  const working = s.state === "building" || s.state === "judging";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [working, load]);

  async function start() {
    setError("");
    const r = await fetch(`/api/use-cases/${useCaseId}/compare`, { method: "POST" });
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error || "Couldn't start it");
    setS({ state: "building" });
  }

  async function show() {
    setOpen(true);
    const r = await fetch(`/api/use-cases/${useCaseId}/bmad-docs?path=${encodeURIComponent(s.comparison || "bacc/advisor/comparison.md")}`);
    const j = await r.json().catch(() => ({}));
    setDoc(r.ok ? splitFrontMatter(j.content as string).body : "The comparison isn't written yet.");
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {working ? (
            <Button size="sm" variant="ghost" disabled>
              <Spinner /> {s.state === "building" ? "Plain Claude Code is building" : "Your advisor is comparing"}
            </Button>
          ) : s.comparison ? (
            <Button size="sm" variant="ghost" onClick={show}>
              <Scale /> Side by side
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={start} disabled={disabled}>
              <Scale /> Compare with plain Claude Code
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {error ||
            (s.state === "failed"
              ? `The last comparison stopped: ${s.error}`
              : "Plain Claude Code builds its own version from your intake and documents alone. Your advisor scores both; anything it has that yours lacks goes onto the product map.")}
        </TooltipContent>
      </Tooltip>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Side by side with plain Claude Code</SheetTitle>
            <SheetDescription>Your app against what Claude Code builds from your idea alone. Anything it had that yours lacked is now on the product map.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {doc ? <Markdown>{doc}</Markdown> : <Spinner />}
            <Button size="sm" variant="outline" className="mt-4" onClick={() => (setOpen(false), start())}>
              <Scale /> Compare again
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
