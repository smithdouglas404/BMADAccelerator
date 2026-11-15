"use client";

import { useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { previewUrl, type UseCaseFull } from "@/lib/types";
import { ArrowLeft, Circle, ExternalLink, Hammer, Map as MapIcon, Pencil, PenLine, Square, Undo2, X as XIcon } from "lucide-react";
import type { FloorT } from "./ProductMap";
import CompareButton from "./CompareButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { cn } from "@/lib/utils";

type Tool = "pen" | "box" | "circle" | "x";
type Shape = { tool: Tool; points: { x: number; y: number }[] };

// The generated app, live, on its own URL. "Mark up" freezes the screen as a picture
// so the person can circle, box or cross out what to change and say why.
export default function PreviewPanel({
  data,
  reload,
  floor = null,
  onPick,
}: {
  data: UseCaseFull;
  reload: () => void;
  floor?: FloorT | null;
  onPick?: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("/");
  const [mode, setMode] = useState<"live" | "markup">("live");
  const [nonce, setNonce] = useState(0);
  const frameBox = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // "Show what's assumed": the app marks every assumed feature on the page (bacc-floor.js in the app).
  const [flags, setFlags] = useState(true);
  const [flagInfo, setFlagInfo] = useState<{ ready: boolean; count: number }>({ ready: false, count: 0 });
  const items = JSON.stringify(
    Object.fromEntries((floor?.areas ?? []).flatMap((a) => a.items).map((i) => [i.id, { state: i.state, text: i.text }])),
  );
  const send = () => frame.current?.contentWindow?.postMessage({ type: "bacc-floor-show", on: flags, items: JSON.parse(items) }, "*");

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = (e.data || {}) as { type?: string; id?: string; count?: number };
      if (d.type === "bacc-floor-ready") {
        setFlagInfo({ ready: true, count: 0 });
        send();
      } else if (d.type === "bacc-floor-count") setFlagInfo({ ready: true, count: d.count ?? 0 });
      else if (d.type === "bacc-floor-pick" && d.id) onPick?.(d.id);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // send reads the latest flags and items through the closure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPick, flags, items]);
  useEffect(send, [flags, items]);
  useEffect(() => setFlagInfo({ ready: false, count: 0 }), [nonce]);

  useEffect(() => setUrl(previewUrl(data.preview.port)), [data.preview.port]);
  // Reload the frame when a new version is generated.
  useEffect(() => setNonce((n) => n + 1), [data.generateCount, data.preview.running]);

  if (data.generateBusy) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="text-primary" />
          </EmptyMedia>
          <EmptyTitle>Generating version {data.generateCount + 1}</EmptyTitle>
          <EmptyDescription>
            <AnimatedShinyText className="max-w-none">{data.generateStatus || "Claude Code is building your app from the BMAD documents."}</AnimatedShinyText>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!data.preview.hasApp) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Hammer />
          </EmptyMedia>
          <EmptyTitle>No app yet</EmptyTitle>
          <EmptyDescription>
            Press Generate at any point. Claude Code builds the app from BMAD&apos;s documents as they stand and it runs here, on its own link.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const full = `${url}${path}`;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("size-2 rounded-full", data.preview.running ? "bg-good" : "bg-warn")} aria-hidden />
        <a href={full} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate font-mono text-primary hover:underline" title="Open the app in a new tab">
          {url || "starting"} <ExternalLink className="size-3" />
        </a>
        <Badge variant="secondary" className="font-mono text-[10px]">
          v{data.generateCount}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-1">
          {mode === "live" && <CompareButton useCaseId={data.id} disabled={!data.generateCount} />}
          {mode === "live" && flagInfo.ready && (
            <Button
              size="sm"
              variant={flags ? "secondary" : "ghost"}
              aria-pressed={flags}
              onClick={() => setFlags((f) => !f)}
              title="Mark the features that were assumed for you, so you can keep, change or remove them"
            >
              <MapIcon /> {flags ? `${flagInfo.count} assumed here` : "Show what's assumed"}
            </Button>
          )}
          {mode === "live" ? (
            <Button
              size="sm"
              onClick={() => setMode("markup")}
              disabled={!data.preview.running}
              title="Click or draw a box on the page, then say what you want changed"
            >
              <Pencil /> Mark up: draw on the page to give feedback
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setMode("live")}>
              <ArrowLeft /> Back to live
            </Button>
          )}
        </div>
      </div>
      {mode === "live" ? (
        <>
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              setNonce((n) => n + 1);
            }}
          >
            <Input className="h-8 flex-1 font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value || "/")} aria-label="Page path" />
          </form>
          <div ref={frameBox} className="min-h-72 flex-1 overflow-hidden rounded-lg border bg-white shadow-xs">
            {data.preview.running && url ? (
              <iframe ref={frame} key={nonce} src={full} title="Generated app preview" className="h-full w-full" />
            ) : (
              <Centered>
                <Spinner />
                <p>Starting the app...</p>
              </Centered>
            )}
          </div>
        </>
      ) : (
        <Markup data={data} path={path} onDone={() => { setMode("live"); reload(); }} />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function Markup({ data, path, onDone }: { data: UseCaseFull; path: string; onDone: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<Tool>("circle");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drawing = useRef<Shape | null>(null);

  useEffect(() => {
    const width = Math.max(360, Math.round(box.current?.clientWidth ?? 800));
    fetch(`/api/use-cases/${data.id}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, width, height: Math.round(width * 0.75) }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not capture the screen");
        const i = new Image();
        i.onload = () => setImg(i);
        i.src = j.image;
      })
      .catch((e) => setError(e.message));
  }, [data.id, path]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const all = drawing.current ? [...shapes, drawing.current] : shapes;
    for (const s of all) drawShape(ctx, s);
  }, [img, shapes]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
      y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
    };
  }

  async function save() {
    if (!canvas.current || !comment.trim()) return;
    setSaving(true);
    const r = await fetch(`/api/use-cases/${data.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, image: canvas.current.toDataURL("image/png"), pageUrl: path }),
    });
    setSaving(false);
    if (r.ok) onDone();
    else setError((await r.json()).error || "Could not save");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 text-xs" role="toolbar" aria-label="Drawing tools">
        <ToggleGroup type="single" variant="outline" size="sm" value={tool} onValueChange={(v) => v && setTool(v as Tool)}>
          {(
            [
              ["circle", "Circle", Circle],
              ["box", "Box", Square],
              ["x", "Cross out", XIcon],
              ["pen", "Pen", PenLine],
            ] as const
          ).map(([t, label, Icon]) => (
            <ToggleGroupItem key={t} value={t} aria-label={label} className="gap-1 px-2.5">
              <Icon /> {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button variant="outline" size="sm" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>
          <Undo2 /> Undo
        </Button>
        <span className="ml-auto text-muted-foreground">Draw on the screen, then say what to change.</span>
      </div>
      <div ref={box} className="min-h-72 flex-1 overflow-auto rounded-lg border bg-white">
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {!img && !error && <Centered><Spinner /><p>Capturing the screen...</p></Centered>}
        {img && (
          <canvas
            ref={canvas}
            className="block w-full cursor-crosshair touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = { tool, points: [pos(e)] };
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const p = pos(e);
              drawing.current = {
                ...drawing.current,
                points: tool === "pen" ? [...drawing.current.points, p] : [drawing.current.points[0], p],
              };
              setShapes((s) => [...s]);
            }}
            onPointerUp={() => {
              const d = drawing.current;
              drawing.current = null;
              if (d && d.points.length > 1) setShapes((s) => [...s, d]);
            }}
            aria-label="Screenshot to draw on"
          />
        )}
      </div>
      <div className="flex items-start gap-2">
        <Textarea
          className="min-h-14 flex-1 text-sm"
          placeholder="What should change here? Type, or tap the mic and talk."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <VoiceRecorder label="" onTranscript={(t) => setComment((c) => (c ? `${c} ${t}` : t))} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={saving || !comment.trim() || !img} onClick={save}>
          {saving ? "Saving..." : "Add to backlog"}
        </Button>
      </div>
    </div>
  );
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  ctx.save();
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = Math.max(3, ctx.canvas.width / 300);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (s.tool === "pen") {
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  } else if (s.tool === "box") {
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (s.tool === "circle") {
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(b.x, a.y);
    ctx.lineTo(a.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}
