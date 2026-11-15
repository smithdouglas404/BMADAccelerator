"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Role = { key: string; name: string; title: string; agent: string | null; lessons: string };
type Status = {
  mem0: { configured: boolean; up: boolean };
  letta: { up: boolean; note?: string };
  roles: Role[];
  portfolio: { useCaseId: string; title: string; gatesPassed: string[]; lastHandoff: string }[];
};
type Hit = { id: string; memory: string; kind: string; role: string; useCase: string };

const KIND: Record<string, string> = {
  decision: "Decision",
  qa: "Question and answer",
  lesson: "Lesson",
  requirement: "Screen feedback",
  run_summary: "What was built",
  fact: "Fact",
  discussion: "Discussion",
};

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-400" : "bg-rose-400"}`} />;
}

// What the agents remember across use cases: Mem0 (long-term memory) and each role's Letta agent.
export function MemoryTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/memory").then(async (r) => setStatus(await r.json()));
  }
  useEffect(load, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/memory/search?q=${encodeURIComponent(q)}`);
    setHits((await r.json()).hits);
    setBusy(false);
  }

  async function refreshLessons() {
    setBusy(true);
    await fetch("/api/memory", { method: "POST" });
    setBusy(false);
    load();
  }

  if (!status) return <p className="text-muted-foreground">Checking memory...</p>;
  const roleName = (k: string) => status.roles.find((r) => r.key === k)?.name ?? k;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        The agents remember across use cases. Every answer, approval, sign-off, piece of screen feedback and build is saved, and each BMAD role keeps
        the lessons that would help the next, similar use case. Before each turn, the agents get what earlier use cases taught. Everything runs on this
        computer.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 font-semibold">
            <Dot on={status.mem0.up} /> Long-term memory (Mem0)
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{status.mem0.up ? "Running" : status.mem0.configured ? "Not answering" : "Not set up"}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 font-semibold">
            <Dot on={status.letta.up && status.roles.every((r) => r.agent)} /> Role agents (Letta)
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {status.letta.up ? (status.roles.every((r) => r.agent) ? "All six roles ready" : status.letta.note ?? "Setting up") : status.letta.note ?? "Not answering"}
          </div>
        </div>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search what earlier use cases taught, for example: payments in retail pilots"
          className="flex-1"
        />
        <Button variant="outline" disabled={busy || !status.mem0.up}>
          Search
        </Button>
      </form>
      {hits && (
        <ul className="space-y-2">
          {hits.length === 0 && <li className="text-sm text-muted-foreground">Nothing found.</li>}
          {hits.map((h) => (
            <li key={h.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">
                {KIND[h.kind] ?? h.kind}
                {h.role ? ` · ${roleName(h.role)}` : ""}
                {h.useCase ? ` · ${h.useCase}` : ""}
              </div>
              <div className="whitespace-pre-wrap">{h.memory}</div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">What each role has learned</h3>
          <Button variant="outline" size="sm" onClick={refreshLessons} disabled={busy || !status.letta.up}>
            Refresh lessons
          </Button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {status.roles.map((r) => (
            <li key={r.key} className="rounded-lg border p-3">
              <div className="font-semibold">
                {r.name}, {r.title}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.lessons || "No lessons yet. They come after sign-offs and builds."}</div>
            </li>
          ))}
        </ul>
      </div>

      {status.portfolio.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Use cases the roles know about</h3>
          <ul className="space-y-1 text-sm">
            {status.portfolio.map((p) => (
              <li key={p.useCaseId}>
                <span className="font-medium">{p.title}</span>
                <span className="text-muted-foreground"> · gates passed: {p.gatesPassed.length ? p.gatesPassed.join(", ") : "none"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
