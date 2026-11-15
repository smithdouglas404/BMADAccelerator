"use client";

import { useMemo, useState } from "react";
import { History, PenLine, Search } from "lucide-react";
import { AGENTS, type AgentKey } from "@/lib/bmad";
import type { MessageT } from "@/lib/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import VoiceRecorder from "@/components/VoiceRecorder";
import { cn } from "@/lib/utils";

export type QuestionT = {
  id: string;
  agent: string;
  question: string;
  explanation: string;
  status: string;
  answer: string;
  createdAt: string;
  answeredAt: string | null;
};

const agentFor = (key: string) => (key in AGENTS ? AGENTS[key as AgentKey] : AGENTS.concierge);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function Avatar({ agent }: { agent: string }) {
  const a = agentFor(agent);
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: a.color }} aria-hidden>
      {a.name.slice(0, 1)}
    </span>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-warn/30 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

function AnswerRow({ q, search, reload }: { q: QuestionT; search: string; reload: () => void }) {
  const a = agentFor(q.agent);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.answer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const r = await fetch(`/api/questions/${q.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: text }) });
    setSaving(false);
    if (!r.ok) return setError((await r.json()).error || "Could not save");
    setEditing(false);
    reload();
  }

  return (
    <li className="rounded-lg border bg-card p-3 text-sm">
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <Avatar agent={q.agent} />
        <span className="font-semibold" style={{ color: a.color }}>
          {a.name}
        </span>
        <span className="text-muted-foreground">
          {a.role} · {day(q.createdAt)}
        </span>
        <span className="ml-auto">
          {q.status === "open" ? (
            <Badge className="bg-primary text-primary-foreground">Waiting for you</Badge>
          ) : q.status === "waiting" ? (
            <Badge variant="outline">Next in line</Badge>
          ) : (
            <Badge variant="outline" className="border-good/40 bg-good/10 text-good">
              Answered
            </Badge>
          )}
        </span>
      </div>
      <p className="font-medium">
        <Highlight text={q.question} q={search} />
      </p>
      {q.explanation && <p className="mt-1 text-xs text-muted-foreground">{q.explanation}</p>}
      {q.status === "answered" && !editing && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
          <p className="whitespace-pre-wrap">
            <span className="text-xs text-muted-foreground">You: </span>
            <Highlight text={q.answer} q={search} />
          </p>
          <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => setEditing(true)}>
            <PenLine /> Change
          </Button>
        </div>
      )}
      {editing && (
        <div className="mt-2 space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="New answer" />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <VoiceRecorder label="" onTranscript={(t) => setText((v) => (v ? `${v} ${t}` : t))} />
            <Button size="sm" onClick={save} disabled={saving || !text.trim() || text.trim() === q.answer.trim()}>
              {saving ? "Saving" : "Save new answer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setText(q.answer))}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{a.name} gets the new answer and updates the documents.</p>
        </div>
      )}
    </li>
  );
}

// The whole conversation in one place: every question an agent asked you with your answer
// (which you can change), and the full transcript, searchable.
export default function HistorySheet({
  open,
  onClose,
  tab,
  setTab,
  messages,
  questions,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  tab: "questions" | "all";
  setTab: (t: "questions" | "all") => void;
  messages: MessageT[];
  questions: QuestionT[];
  reload: () => void;
}) {
  const [search, setSearch] = useState("");
  const [who, setWho] = useState("");
  const s = search.trim().toLowerCase();

  const qs = useMemo(
    () =>
      [...questions]
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : b.status === "open" ? 1 : a.status === "waiting" ? -1 : b.status === "waiting" ? 1 : 0))
        .filter((q) => !s || `${q.question} ${q.answer} ${q.explanation}`.toLowerCase().includes(s))
        .filter((q) => !who || q.agent === who),
    [questions, s, who],
  );
  const msgs = useMemo(
    () =>
      messages.filter((m) => !s || m.content.toLowerCase().includes(s)).filter((m) => !who || (who === "you" ? m.role === "user" : m.role !== "user" && (m.agent || "concierge") === who)),
    [messages, s, who],
  );
  const speakers = [...new Set(messages.filter((m) => m.role !== "user").map((m) => m.agent || "concierge"))];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" aria-label="Conversation history">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <History className="size-5" /> Conversation history
          </SheetTitle>
          <SheetDescription>Every question the BMAD agents asked you and what you said. Change an earlier answer and the agent updates its documents.</SheetDescription>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the conversation" className="pl-8" aria-label="Search" />
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {["", ...speakers, "you"].map((k) => (
              <Button key={k || "all"} size="sm" variant={who === k ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setWho(k)}>
                {k === "" ? "Everyone" : k === "you" ? "You" : agentFor(k).name}
              </Button>
            ))}
          </div>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-4 mt-3">
            <TabsTrigger value="questions">
              Questions for you <Badge variant="secondary" className="h-4 px-1 text-[10px]">{questions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all">Everything said</TabsTrigger>
          </TabsList>
          <TabsContent value="questions" className="min-h-0 overflow-y-auto p-4">
            {qs.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <History />
                  </EmptyMedia>
                  <EmptyTitle>{s || who ? "Nothing matches" : "No questions yet"}</EmptyTitle>
                  <EmptyDescription>The agents&apos; questions to you collect here as they ask them.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="space-y-2">
                {qs.map((q) => (
                  <AnswerRow key={`${q.id}:${q.answer}`} q={q} search={s} reload={reload} />
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="all" className="min-h-0 overflow-y-auto p-4">
            {msgs.length === 0 && <p className="text-sm text-muted-foreground">Nothing matches.</p>}
            <ol className="space-y-3">
              {msgs.map((m, i) => {
                const mine = m.role === "user";
                const a = agentFor(m.agent || "concierge");
                const newDay = i === 0 || day(msgs[i - 1].createdAt) !== day(m.createdAt);
                return (
                  <li key={m.id}>
                    {newDay && <div className="my-3 text-center text-[11px] font-medium text-muted-foreground">{day(m.createdAt)}</div>}
                    <div className="flex gap-2.5 text-sm">
                      {mine ? (
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">You</span>
                      ) : (
                        <Avatar agent={m.agent || "concierge"} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs">
                          <span className={cn("font-semibold", mine && "text-primary")} style={mine ? undefined : { color: a.color }}>
                            {mine ? "You" : a.name}
                          </span>
                          <span className="text-muted-foreground"> · {time(m.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap">
                          <Highlight text={m.content} q={s} />
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
