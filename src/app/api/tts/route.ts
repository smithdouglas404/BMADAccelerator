import { z } from "zod";

const Body = z.object({ text: z.string().trim().min(1).max(5000) });

// Reads an agent's question aloud with ElevenLabs text to speech.
export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response("Voice is off: add ELEVENLABS_API_KEY.", { status: 503 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response("Nothing to read", { status: 400 });
  const voice = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: parsed.data.text, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2" }),
  });
  if (!r.ok) return new Response(`ElevenLabs error ${r.status}`, { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
