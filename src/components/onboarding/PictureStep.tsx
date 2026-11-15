"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import WizardSteps from "@/components/WizardSteps";
import VoiceRecorder from "@/components/VoiceRecorder";
import type { UseCaseFull } from "@/lib/types";
import type { InspirationOptionsT } from "@/lib/inspire";

type Direction = InspirationOptionsT["directions"][number];

const loadedFonts = new Set<string>();
function useGoogleFont(family: string) {
  useEffect(() => {
    if (!family || loadedFonts.has(family)) return;
    loadedFonts.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }, [family]);
}

// A small rendered mock of a home page in one direction: its colors, fonts, corners and a headline.
function StylePreview({ d, nav, action }: { d: Direction; nav: string[]; action: string }) {
  useGoogleFont(d.displayFont);
  useGoogleFont(d.bodyFont);
  const r = d.radius === "none" ? 0 : d.radius === "small" ? 6 : 16;
  const p = d.palette;
  const display = `"${d.displayFont}", serif`;
  const body = `"${d.bodyFont}", system-ui, sans-serif`;
  return (
    <div className="overflow-hidden rounded-lg border border-line text-left" style={{ background: p.background, color: p.text, fontFamily: body }} aria-hidden>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${p.muted}33` }}>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 12 }}>{d.name}</span>
        <span className="flex gap-2" style={{ fontSize: 9, color: p.muted }}>
          {nav.slice(0, 2).map((n) => (
            <span key={n}>{n}</span>
          ))}
          <span style={{ background: p.accent, color: p.background, padding: "1px 6px", borderRadius: r }}>{nav[2] ?? "Contact"}</span>
        </span>
      </div>
      <div className="px-3 pb-3 pt-4">
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{d.headline}</div>
        <div className="mt-1" style={{ fontSize: 10, color: p.muted }}>
          {d.tagline}
        </div>
        <div className="mt-3 flex gap-2">
          <span style={{ background: p.accent, color: p.background, fontSize: 10, padding: "4px 10px", borderRadius: r, fontWeight: 600 }}>{action}</span>
          <span style={{ border: `1px solid ${p.accent2}`, color: p.accent2, fontSize: 10, padding: "4px 10px", borderRadius: r }}>Learn more</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[p.accent, p.accent2, p.muted].map((c, i) => (
            <div key={i} style={{ background: p.surface, borderRadius: r, padding: 6 }}>
              <div style={{ height: 26, borderRadius: Math.max(r - 2, 0), background: `linear-gradient(135deg, ${c}, ${c}88)` }} />
              <div className="mt-1" style={{ height: 4, width: "70%", background: `${p.text}55`, borderRadius: 2 }} />
              <div className="mt-1" style={{ height: 4, width: "40%", background: `${p.text}33`, borderRadius: 2 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Step 3 of setup: Claude researches products like this one; the client clicks the features
// they want and the look they like. The picks go to BMAD and Generate as the starting direction.
export default function PictureStep({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const ins = data.inspiration;
  const options = ins?.status === "ready" ? ins.options : undefined;
  const [features, setFeatures] = useState<string[] | null>(null);
  const [direction, setDirection] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  // Start the research when the step opens, and check for the result while it runs.
  useEffect(() => {
    if (!ins && !started.current) {
      started.current = true;
      void fetch(`/api/use-cases/${data.id}/inspire`, { method: "POST" }).then(() => reload());
    }
  }, [ins, data.id, reload]);
  useEffect(() => {
    if (ins?.status !== "working") return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [ins?.status, reload]);

  const picked = useMemo(() => features ?? options?.features.filter((f) => f.recommended).map((f) => f.id) ?? [], [features, options]);
  const toggle = (id: string) => setFeatures(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  async function savePicks(skipped = false) {
    setBusy(true);
    await fetch(`/api/use-cases/${data.id}/inspire`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skipped ? { features: [], direction: "", notes: "", skipped: true } : { features: picked, direction, notes }),
    });
    setBusy(false);
    reload();
  }

  async function retry() {
    await fetch(`/api/use-cases/${data.id}/inspire`, { method: "POST" });
    reload();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <WizardSteps current={2} />
      <section className="pop-in mt-6">
        <h1 className="text-2xl font-semibold tracking-tight">What are you picturing?</h1>
        <p className="mt-1 text-muted">
          Claude looked at products like yours. Tick the features you want and pick the look you like best. It&apos;s
          a starting point: Sally, the UX designer, refines it with you.
        </p>

        {(!ins || ins.status === "working") && (
          <div className="glass mt-6 flex items-center gap-3 rounded-2xl p-6 text-muted" role="status">
            <span className="typing" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Looking at products like yours. This takes about a minute.
          </div>
        )}

        {ins?.status === "failed" && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm" role="alert">
            <span className="min-w-0 flex-1">The research didn&rsquo;t finish{ins.error ? `: ${ins.error}` : ""}.</span>
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {options && (
          <>
            <p className="mt-6 text-sm">
              <span className="font-medium">{options.kind}</span>
              {options.similar.length > 0 && <span className="text-muted"> Looked at: {options.similar.map((s) => s.name).join(", ")}.</span>}
            </p>

            <h2 className="mt-6 text-lg font-semibold">Features</h2>
            <p className="text-sm text-muted">The ones that fit what you described are already ticked.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {options.features.map((f) => {
                const on = picked.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(f.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${on ? "border-accent bg-accent/10" : "border-line hover:border-accent/50"}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-accent bg-accent text-white" : "border-line"}`} aria-hidden>
                        {on ? "✓" : ""}
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{f.name}</span>
                        <span className="block text-xs text-muted">{f.description}</span>
                        {f.seenIn && <span className="mt-0.5 block text-[11px] text-muted">Seen in: {f.seenIn}</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <h2 className="mt-8 text-lg font-semibold">The look</h2>
            <p className="text-sm text-muted">Pick one. Colors and fonts can still change later.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Visual direction">
              {options.directions.map((d) => {
                const on = direction === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDirection(on ? "" : d.id)}
                    className={`rounded-2xl border p-3 text-left transition-colors ${on ? "border-accent bg-accent/10 ring-2 ring-accent/40" : "border-line hover:border-accent/50"}`}
                  >
                    <StylePreview d={d} nav={options.nav?.length ? options.nav : ["Home", "About", "Contact"]} action={options.primaryAction || "Get started"} />
                    <div className="mt-3 text-sm font-semibold">{d.name}</div>
                    <div className="text-xs text-muted">{d.mood}</div>
                    <div className="mt-2 flex gap-1" aria-hidden>
                      {Object.values(d.palette).map((c) => (
                        <span key={c} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {d.displayFont} and {d.bodyFont}. {d.signature}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="glass mt-6 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Anything else you&apos;re picturing?</h3>
                  <p className="text-xs text-muted">A site you like, a feature that&apos;s missing, a feel you want.</p>
                </div>
                <VoiceRecorder label="Say it" onTranscript={(t) => setNotes((n) => (n ? `${n} ${t}` : t))} />
              </div>
              <textarea className="field mt-3 min-h-20 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </>
        )}
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Link href="/" className="btn btn-ghost">
          Save and exit
        </Link>
        <button className="btn btn-ghost" disabled={busy} onClick={() => savePicks(true)}>
          Skip this step
        </button>
        <button className="btn btn-primary" disabled={busy || !options} onClick={() => savePicks(false)}>
          Next: confirm
        </button>
      </div>
    </main>
  );
}
