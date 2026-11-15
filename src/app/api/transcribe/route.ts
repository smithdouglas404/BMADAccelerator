import { NextResponse } from "next/server";

// Transcribes a recording of any length with ElevenLabs Speech to Text.
// Needs ELEVENLABS_API_KEY in the environment.
export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Voice transcription is not set up yet. Add ELEVENLABS_API_KEY to the server environment." },
      { status: 503 },
    );
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "No audio" }, { status: 400 });

  const upstream = new FormData();
  upstream.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
  upstream.append("file", audio, audio.name || "recording.webm");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: upstream,
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Transcription failed (${res.status}).` }, { status: 502 });
  }
  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: data.text ?? "" });
}
