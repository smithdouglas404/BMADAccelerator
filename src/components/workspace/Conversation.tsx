"use client";

import { useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { AGENTS, type AgentKey } from "@/lib/bmad";
import type { MessageT, UseCaseFull } from "@/lib/types";
import { AlertCircle, History, MessageCircleQuestion, Pause, SendHorizontal, Volume2 } from "lucide-react";
import HistorySheet, { type QuestionT } from "./HistorySheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { cn } from "@/lib/utils";

function agentOf(m: MessageT) {
  if (m.role === "user") return null;
  return m.agent in AGENTS ? AGENTS[m.agent as AgentKey] : AGENTS.concierge;
}

export default function Conversation({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [playing, setPlaying] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const lastSeen = useRef<string>("");
  const input = useRef<HTMLTextAreaElement>(null);
  const [questions, setQuestions] = useState<QuestionT[]>([]);
  const [history, setHistory] = useState<"" | "questions" | "all">("");
  const [whyOpen, setWhyOpen] = useState(false);

  const loadQuestions = () =>
    fetch(`/api/use-cases/${data.id}/questions`)
      .then((r) => r.json())
      .then((j) => setQuestions(j.questions ?? []))
      .catch(() => {});
  useEffect(() => {
    void loadQuestions();
    // Re-read when the conversation moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, data.messages.length, data.pendingQuestion]);

  useEffect(() => {
    try {
      setReadAloud(localStorage.getItem("bacc-read-aloud") === "1");
    } catch {
      /* storage off */
    }
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data.messages.length, data.agentBusy]);

  // Read new agent messages aloud with ElevenLabs when the person turned it on.
  useEffect(() => {
    const last = data.messages[data.messages.length - 1];
    if (!last) return;
    if (!lastSeen.current) {
      lastSeen.current = last.id;
      return;
    }
    if (last.id === lastSeen.current) return;
    lastSeen.current = last.id;
    if (readAloud && last.role !== "user") void speak(last);
  }, [data.messages, readAloud]);

  async function speak(m: MessageT) {
    audio.current?.pause();
    setPlaying(m.id);
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: m.content }),
      });
      if (!r.ok) throw new Error(await r.text());
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setPlaying("");
      await a.play();
    } catch {
      setPlaying("");
    }
  }

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    try {
      localStorage.setItem("bacc-read-aloud", next ? "1" : "0");
    } catch {
      /* storage off */
    }
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    await fetch(`/api/use-cases/${data.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    setText("");
    setBusy(false);
    reload();
  }

  const asking = questions.find((q) => q.status === "open");
  const asker = asking ? (asking.agent in AGENTS ? AGENTS[asking.agent as AgentKey] : AGENTS.concierge) : null;
  const waiting = questions.filter((q) => q.status === "waiting").length;
  const working = data.agentBusy ? (data.activeAgent in AGENTS ? AGENTS[data.activeAgent as AgentKey] : AGENTS.concierge) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">Conversation</span>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-7" onClick={() => setHistory("questions")}>
            <History /> History
            {questions.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
                {questions.length}
              </Badge>
            )}
          </Button>
          <div className="flex items-center gap-2" title="Read the agents' messages aloud with ElevenLabs">
            <Switch id="read-aloud" checked={readAloud} onCheckedChange={toggleReadAloud} />
            <Label htmlFor="read-aloud" className="text-xs font-normal text-muted-foreground">
              Read aloud
            </Label>
          </div>
        </div>
      </div>
      {asking && asker && (
        <div className="border-b bg-primary/5 px-4 py-2.5" role="region" aria-label="Question for you">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white shadow-xs" style={{ background: asker.color }} aria-hidden>
              {asker.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-xs">
                <MessageCircleQuestion className="size-3.5 text-primary" />
                <span>
                  <span className="font-semibold" style={{ color: asker.color }}>
                    {asker.name}
                  </span>
                  <span className="text-muted-foreground">, {asker.role}, asks you</span>
                </span>
                {waiting > 0 && (
                  <button type="button" onClick={() => setHistory("questions")} className="rounded-sm">
                    <Badge variant="secondary" className="text-[10px] hover:bg-secondary/70">
                      {waiting} more after this
                    </Badge>
                  </button>
                )}
                {(asking.explanation || asking.question.length > 160) && (
                  <button type="button" className="text-primary hover:underline" onClick={() => setWhyOpen((w) => !w)}>
                    {whyOpen ? "Less" : asking.explanation ? "Why they ask" : "Read all"}
                  </button>
                )}
              </div>
              <p className={cn("mt-0.5 text-sm font-medium", !whyOpen && "line-clamp-2")}>{asking.question}</p>
              {asking.explanation && whyOpen && <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{asking.explanation}</p>}
            </div>
            <Button size="sm" className="h-7 shrink-0" onClick={() => input.current?.focus()}>
              Answer
            </Button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {data.messages.map((m) => {
          const agent = agentOf(m);
          const mine = !agent;
          return (
            <div key={m.id} className={cn("pop-in flex gap-2.5", mine ? "justify-end" : "justify-start")}>
              {agent && (
                <span
                  className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white shadow-xs"
                  style={{ background: agent.color }}
                  aria-hidden
                >
                  {agent.name.slice(0, 1)}
                </span>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-tl-md border bg-muted/50",
                )}
              >
                {agent && (
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span>
                      <span className="font-semibold" style={{ color: agent.color }}>
                        {agent.name}
                      </span>
                      <span className="text-muted-foreground">, {agent.role}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground"
                      onClick={() => speak(m)}
                      aria-label="Read this message aloud"
                      title="Read aloud"
                    >
                      {playing === m.id ? <Pause /> : <Volume2 />}
                    </Button>
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          );
        })}
        {working && (
          <div className="flex items-center gap-2.5" role="status">
            <span className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: working.color }} aria-hidden>
              {working.name.slice(0, 1)}
            </span>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border bg-muted/50 px-4 py-2.5 text-sm">
              <span className="typing text-muted-foreground" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <AnimatedShinyText className="mx-0 max-w-none">
                {working.name} is working{data.agentStatus ? `: ${data.agentStatus.toLowerCase()}` : ""}
              </AnimatedShinyText>
            </div>
          </div>
        )}
        {data.agentError && !data.agentBusy && (
          <Alert variant="destructive" className="items-center">
            <AlertCircle />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-0 flex-1">The last step didn&rsquo;t finish: {data.agentError.replace(/\.$/, "")}.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await fetch(`/api/use-cases/${data.id}/retry`, { method: "POST" });
                  } finally {
                    setRetrying(false);
                    reload();
                  }
                }}
              >
                {retrying ? "Retrying" : "Try again"}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div ref={end} />
      </div>
      <div className="border-t bg-muted/20 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            className="min-h-11 flex-1 resize-none bg-background text-sm"
            rows={2}
            ref={input}
            placeholder={asker ? `Answer ${asker.name}, or say anything else. Type, or tap the mic.` : "Type, or tap the mic and talk as long as you like"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Message"
          />
          <VoiceRecorder label="" onTranscript={(t) => setText((v) => (v ? `${v} ${t}` : t))} />
          <Button disabled={busy || !text.trim()} onClick={send}>
            <SendHorizontal /> Send
          </Button>
        </div>
      </div>
      <HistorySheet
        open={!!history}
        tab={history || "questions"}
        setTab={(t) => setHistory(t)}
        onClose={() => setHistory("")}
        messages={data.messages}
        questions={questions}
        reload={() => {
          reload();
          void loadQuestions();
        }}
      />
    </div>
  );
}
