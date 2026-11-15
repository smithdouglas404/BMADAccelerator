"use client";

import { useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { AGENTS, type AgentKey } from "@/lib/bmad";
import type { UseCaseFull } from "@/lib/types";

export default function Conversation({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data.messages.length]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {data.messages.map((m) => {
          const mine = m.role === "user";
          const agent =
            m.role === "bmad-agent" && m.agent in AGENTS ? AGENTS[m.agent as AgentKey] : AGENTS.concierge;
          return (
            <div key={m.id} className={`pop-in flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  mine ? "bg-gradient-to-br from-accent to-accent2 text-white" : "glass"
                }`}
              >
                {!mine && (
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: agent.color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: agent.color }} />
                    {agent.name}, {agent.role}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
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
