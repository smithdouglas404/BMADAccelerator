"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Called with the text of each finished recording, so the parent can append it.
  onTranscript: (text: string) => void;
  label?: string;
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Records with no time limit. Audio is collected in 10-second slices while
// recording, then sent for transcription when the user stops. Recording again
// continues where they left off, because the parent appends each transcript.
export default function VoiceRecorder({ onTranscript, label = "Talk instead" }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setState("transcribing");
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "recording.webm");
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed.");
          if (data.text) onTranscript(data.text);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed.");
        } finally {
          setState("idle");
        }
      };
      rec.start(10_000);
      recorder.current = rec;
      setElapsed(0);
      timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setState("recording");
    } catch {
      setError("Microphone access was blocked. Allow it in your browser to talk instead of typing.");
    }
  }

  function stop() {
    recorder.current?.stop();
  }

  return (
    <div className="flex flex-col gap-1">
      {state === "recording" ? (
        <button type="button" onClick={stop} className="btn recording border-transparent bg-red-500 text-white">
          <span className="h-2.5 w-2.5 rounded-sm bg-white" aria-hidden /> Stop, {fmt(elapsed)}
        </button>
      ) : (
        <button type="button" onClick={start} disabled={state === "transcribing"} className="btn btn-ghost">
          <MicIcon /> {state === "transcribing" ? "Transcribing..." : label}
        </button>
      )}
      {error && <p className="max-w-xs text-xs text-bad">{error}</p>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
