"use client";

import { useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { AGENTS, type AgentKey } from "@/lib/bmad";
import type { MessageT, UseCaseFull } from "@/lib/types";

function agentOf(m: MessageT) {
  if (m.role === "user") return null;
  return m.agent in AGENTS ? AGENTS[m.agent as AgentKey] : AGENTS.concierge;
}

export default function Conversation({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [playing, setPlaying] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const lastSeen = useRef<string>("");

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

  const working = data.agentBusy ? (data.activeAgent in AGENTS ? AGENTS[data.activeAgent as AgentKey] : AGENTS.concierge) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-muted">
        <span>Conversation</span>
        <button
          className={`chip ${readAloud ? "border-accent bg-accent/15 text-ink" : ""}`}
          onClick={toggleReadAloud}
          aria-pressed={readAloud}
          title="Read the agents' messages aloud with ElevenLabs"
        >
          {readAloud ? "Reading aloud" : "Read aloud"}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {data.messages.map((m) => {
          const agent = agentOf(m);
          const mine = !agent;
          return (
            <div key={m.id} className={`pop-in flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  mine ? "bg-gradient-to-br from-accent to-accent2 text-white" : "glass"
                }`}
              >
                {agent && (
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="flex items-center gap-1.5" style={{ color: agent.color }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: agent.color }} />
                      <span>
                        {agent.name}, {agent.role}
                      </span>
                    </span>
                    <button
                      className="text-muted hover:text-ink"
                      onClick={() => speak(m)}
                      aria-label="Read this message aloud"
                      title="Read aloud"
                    >
                      {playing === m.id ? "Playing" : "Play"}
                    </button>
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          );
        })}
        {working && (
          <div className="flex justify-start" role="status">
            <div className="glass flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-muted">
              <span className="typing" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span>
                <span className="font-medium" style={{ color: working.color }}>
                  {working.name}
                </span>{" "}
                is working{data.agentStatus ? `: ${data.agentStatus.toLowerCase()}` : ""}
              </span>
            </div>
          </div>
        )}
        {data.agentError && !data.agentBusy && (
          <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-sm" role="alert">
            Something went wrong: {data.agentError}. Send another message to try again.
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        {data.pendingQuestion && (
          <p className="mb-2 truncate text-xs text-muted">
            Answering: <span className="text-ink">{data.pendingQuestion}</span>
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            className="field min-h-11 flex-1 resize-none text-sm"
            rows={2}
            placeholder="Type, or tap the mic and talk as long as you like"
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
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
