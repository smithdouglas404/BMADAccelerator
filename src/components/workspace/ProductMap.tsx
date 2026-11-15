"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Lightbulb, Map as MapIcon, PenLine, Plus, RotateCcw, Search, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export type FloorItemT = { id: string; area: string; state: "assumed" | "confirmed" | "out"; text: string };
export type FloorT = {
  exists: boolean;
  category?: string;
  leaders?: string[];
  areas?: { name: string; items: FloorItemT[] }[];
  gaps?: string[];
  ideas?: string[];
  updatedAt?: string;
};

export function useFloor(useCaseId: string, pulse: unknown) {
  const [floor, setFloor] = useState<FloorT | null>(null);
  const load = useCallback(() => {
    fetch(`/api/use-cases/${useCaseId}/floor`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setFloor(j))
      .catch(() => {});
  }, [useCaseId]);
  useEffect(load, [load, pulse]);
  return { floor, setFloor, load };
}

const STATE = {
  confirmed: { label: "Yours", cls: "border-good/40 bg-good/10 text-good" },
  assumed: { label: "Assumed", cls: "border-primary/30 bg-primary/10 text-primary" },
  out: { label: "Removed", cls: "text-muted-foreground line-through decoration-1" },
} as const;

// The product map: everything this kind of product has, from the floor. The client keeps,
// changes or removes each assumed feature, adds ideas, and every change builds straight away.
export default function ProductMap({
  useCaseId,
  floor,
  onChanged,
  focusId,
}: {
  useCaseId: string;
  floor: FloorT | null;
  onChanged: (f: FloorT, building: boolean) => void;
  focusId: string | null;
}) {
  const [filter, setFilter] = useState<"all" | "assumed" | "confirmed" | "out">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; mode: "change" | "remove" } | null>(null);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState<{ area: string; text: string } | null>(null);
  const rows = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!focusId) return;
    setFilter("all");
    setQ("");
    const t = setTimeout(() => rows.current[focusId]?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    return () => clearTimeout(t);
  }, [focusId]);

  const all = useMemo(() => floor?.areas?.flatMap((a) => a.items) ?? [], [floor]);
  const counts = useMemo(
    () => ({
      assumed: all.filter((i) => i.state === "assumed").length,
      confirmed: all.filter((i) => i.state === "confirmed").length,
      out: all.filter((i) => i.state === "out").length,
    }),
    [all],
  );

  async function act(body: Record<string, string>) {
    setBusy(body.id || body.text || "add");
    setError("");
    const r = await fetch(`/api/use-cases/${useCaseId}/floor`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setError(j.error || "Couldn't save that");
    setEditing(null);
    setNote("");
    setAdding(null);
    onChanged({ exists: true, ...j }, !!j.building);
  }

  if (!floor) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }
  if (!floor.exists) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapIcon />
          </EmptyMedia>
          <EmptyTitle>The product map is on its way</EmptyTitle>
          <EmptyDescription>
            Right after your intake, your advisor maps everything a leading product of this kind has. You&apos;ll keep, change or remove each part here, and the
            first version of the app is built from it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const live = all.length - counts.out;
  const s = q.trim().toLowerCase();
  const visible = (i: FloorItemT) => (filter === "all" || i.state === filter) && (!s || `${i.id} ${i.text} ${i.area}`.toLowerCase().includes(s));

  return (
    <div className="space-y-4 text-sm">
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex items-start gap-2">
          <MapIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold">Product map</p>
            <p className="text-xs text-muted-foreground">{floor.category?.split(/\r?\n/)[0]}</p>
          </div>
        </div>
        <Progress value={live ? (counts.confirmed / live) * 100 : 0} aria-label="Confirmed share" />
        <p className="text-xs text-muted-foreground">
          {counts.confirmed} yours, {counts.assumed} assumed, {counts.out} removed. Assumed items are built already, because leading products have them. Keep, change or
          remove each one; changes show in the preview within a couple of minutes.
        </p>
        {!!floor.leaders?.length && (
          <div className="flex flex-wrap items-center gap-1 pt-1 text-xs">
            <Trophy className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Measured against</span>
            {floor.leaders.map((l) => (
              <Badge key={l} variant="outline" className="font-normal" title={l}>
                {l.split(":")[0]}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" size="sm" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
          <ToggleGroupItem value="all">All {all.length}</ToggleGroupItem>
          <ToggleGroupItem value="assumed">Assumed {counts.assumed}</ToggleGroupItem>
          <ToggleGroupItem value="confirmed">Yours {counts.confirmed}</ToggleGroupItem>
          <ToggleGroupItem value="out">Removed {counts.out}</ToggleGroupItem>
        </ToggleGroup>
        <div className="relative min-w-32 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a feature" className="h-8 pl-7 text-xs" aria-label="Find a feature" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {floor.areas?.map((a) => {
        const items = a.items.filter(visible);
        if (!items.length && (filter !== "all" || s)) return null;
        return (
          <section key={a.name}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{a.name}</h3>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setAdding({ area: a.name, text: "" })}>
                <Plus /> Add
              </Button>
            </div>
            <ul className="space-y-1">
              {items.map((i) => (
                <li
                  key={i.id}
                  ref={(el) => {
                    rows.current[i.id] = el;
                  }}
                  className={cn("rounded-md border bg-card px-2.5 py-2", focusId === i.id && "ring-2 ring-primary")}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{i.id}</span>
                    <p className={cn("min-w-0 flex-1", i.state === "out" && "text-muted-foreground line-through")}>{i.text}</p>
                    <Badge variant="outline" className={cn("shrink-0 text-[10px]", STATE[i.state].cls)}>
                      {STATE[i.state].label}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {i.state === "out" ? (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={!!busy} onClick={() => act({ action: "restore", id: i.id })}>
                        <RotateCcw /> Bring back
                      </Button>
                    ) : (
                      <>
                        {i.state === "assumed" && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={!!busy} onClick={() => act({ action: "keep", id: i.id })}>
                            {busy === i.id ? <Spinner /> : <Check />} Keep
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={!!busy} onClick={() => (setEditing({ id: i.id, mode: "change" }), setNote(""))}>
                          <PenLine /> Change
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" disabled={!!busy} onClick={() => (setEditing({ id: i.id, mode: "remove" }), setNote(""))}>
                          <Trash2 /> Remove
                        </Button>
                      </>
                    )}
                  </div>
                  {editing?.id === i.id && (
                    <form
                      className="mt-2 space-y-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act({ action: editing.mode, id: i.id, note });
                      }}
                    >
                      <Textarea
                        autoFocus
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={editing.mode === "change" ? "How should it work instead?" : "Why not? (optional, helps your advisor)"}
                        aria-label={editing.mode === "change" ? "How to change it" : "Why remove it"}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" type="submit" disabled={!!busy || (editing.mode === "change" && !note.trim())}>
                          {editing.mode === "change" ? "Change it" : "Remove it"}
                        </Button>
                        <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
              {adding?.area === a.name && (
                <li>
                  <form
                    className="flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act({ action: "add", area: a.name, text: adding.text });
                    }}
                  >
                    <Input autoFocus value={adding.text} onChange={(e) => setAdding({ ...adding, text: e.target.value })} placeholder="What should it have?" className="h-8 text-xs" />
                    <Button size="sm" type="submit" disabled={!adding.text.trim() || !!busy}>
                      Add
                    </Button>
                  </form>
                </li>
              )}
            </ul>
          </section>
        );
      })}

      {!!floor.ideas?.length && (
        <section>
          <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Lightbulb className="size-3.5" /> Ideas from your advisor
          </h3>
          <ul className="space-y-1">
            {floor.ideas.map((idea) => (
              <li key={idea} className="flex items-start gap-2 rounded-md border border-dashed bg-card px-2.5 py-2">
                <p className="min-w-0 flex-1">{idea}</p>
                <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" disabled={!!busy} onClick={() => act({ action: "add", area: "Ideas we're adding", text: idea })}>
                  <Plus /> Add to product
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!floor.gaps?.length && (
        <section>
          <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <CircleHelp className="size-3.5" /> Questions your advisor will ask
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {floor.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
