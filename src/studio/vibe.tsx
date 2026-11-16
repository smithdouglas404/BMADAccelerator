'use client'
// Vibe review on the live product: the built app in a frame, and an annotation layer over it for
// clicking a part (object), drawing a circle around a region, or capturing the whole screen. Styled with
// the design team's classes (product-preview-shell, annotate-trigger); new pieces use studio-extras.css.
import { useEffect, useRef, useState } from 'react'
import { api, previewUrl, type Live } from './live'

export type Pick =
  | { kind: 'point'; x: number; y: number; width: number; height: number; path: string; scrollY: number }
  | { kind: 'region'; x: number; y: number; w: number; h: number; width: number; height: number; path: string; scrollY: number }

/** Where the owner is in the live app (the studio bridge in the app reports it). */
export function useAppLocation() {
  const [loc, setLoc] = useState({ path: '/', scrollY: 0 })
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as { type?: string; path?: string; scrollY?: number }
      if (d?.type === 'studio-location' && typeof d.path === 'string') setLoc({ path: d.path || '/', scrollY: d.scrollY ?? 0 })
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])
  return loc
}

export function LiveFrame({ live, annotationMode, shape, onPick, tall = false }: { live: Live; annotationMode: boolean; shape: 'object' | 'circle' | 'full-screen'; onPick: (p: Pick) => void; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const loc = useAppLocation()
  const [nonce, setNonce] = useState(0)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const url = previewUrl(live.preview.port, '/')
  useEffect(() => setNonce((n) => n + 1), [live.generateCount, live.preview.running])

  // While a build runs, an early version the builder already put in the preview stays visible.
  if (!live.preview.hasApp || !live.preview.running) {
    const stopped = !live.generateBusy && live.preview.hasApp && !live.preview.starting
    return (
      <div className={`product-preview-shell live-empty ${tall ? 'is-tall' : ''}`}>
        <div className="preview-app-top"><span className="preview-kite">{live.name.toLowerCase()}.</span><span className="preview-preview-label">{live.generateBusy ? `building version ${live.generateCount + 1}` : 'no version yet'}</span><span className="preview-avatar">CC</span></div>
        <div className="live-empty-copy">
          <span className="live-pulse" />
          <strong>{live.generateBusy ? live.generateStatus || 'Claude Code is building' : stopped ? `Version ${live.generateCount} is built; its preview is stopped` : live.preview.hasApp ? 'Starting the preview…' : 'The first version builds from the floor'}</strong>
          <small>{live.generateBusy ? 'An early version appears here as soon as it runs.' : stopped ? <button type="button" className="annotate-trigger" onClick={() => void api(`/api/use-cases/${live.id}/preview`, { method: 'POST' })}>Start the preview</button> : live.preview.hasApp ? 'One moment.' : 'Ask Socra, or press “Build it now” on the prototype brief.'}</small>
        </div>
      </div>
    )
  }

  const rect = () => box.current!.getBoundingClientRect()
  const local = (e: React.PointerEvent) => ({ x: e.clientX - rect().left, y: e.clientY - rect().top })
  const down = (e: React.PointerEvent) => {
    if (!annotationMode || shape !== 'circle') return
    const p = local(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const p = local(e)
    setDrag({ ...drag, x1: p.x, y1: p.y })
  }
  const up = (e: React.PointerEvent) => {
    const r = rect()
    if (shape === 'circle' && drag) {
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0)
      setDrag(null)
      if (w > 8 && h > 8) onPick({ kind: 'region', x, y, w, h, width: Math.round(r.width), height: Math.round(r.height), path: loc.path, scrollY: loc.scrollY })
      return
    }
    if (shape === 'object') {
      const p = local(e)
      onPick({ kind: 'point', x: p.x, y: p.y, width: Math.round(r.width), height: Math.round(r.height), path: loc.path, scrollY: loc.scrollY })
    }
  }
  const d = drag ? { left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) } : null
  return (
    <div ref={box} className={`product-preview-shell live-frame ${tall ? 'is-tall' : ''} ${annotationMode ? 'is-annotatable' : ''}`}>
      <iframe key={nonce} src={url} title={`${live.name} live preview`} />
      {annotationMode && shape !== 'full-screen' && (
        <div className={`live-overlay ${shape}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          {d && <span className="live-circle" style={d} />}
          <span className="live-overlay-hint">{shape === 'circle' ? 'Drag a circle around the part you mean' : 'Click the part you mean'}</span>
        </div>
      )}
      <a className="live-open" href={previewUrl(live.preview.port, loc.path)} target="_blank" rel="noreferrer">{loc.path}</a>
    </div>
  )
}

/** Takes the picture the owner is annotating and names the part under a click. */
export async function captureLive(live: Live, p: Pick | { kind: 'screen'; path: string; width: number; height: number }) {
  const body =
    p.kind === 'screen'
      ? { path: p.path, width: p.width, height: p.height, full: true }
      : { path: p.path, width: p.width, height: p.height, full: false, scrollY: p.scrollY, ...(p.kind === 'point' ? { point: { x: p.x, y: p.y } } : {}) }
  const r = await api<{ image: string; target: string }>(`/api/use-cases/${live.id}/snapshot`, { json: body })
  if (p.kind === 'screen') return { image: r.image, target: r.target }
  return { image: await mark(r.image, p), target: r.target }
}

/** Draws the owner's mark (a pin or a circle) on the picture, in the Studio's acid colour. */
async function mark(src: string, p: Pick): Promise<string> {
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src })
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  const s = img.width / p.width
  g.strokeStyle = '#d7f58b'
  g.fillStyle = 'rgba(215,245,139,.18)'
  g.lineWidth = 4 * s
  g.beginPath()
  if (p.kind === 'point') g.arc(p.x * s, p.y * s, 18 * s, 0, Math.PI * 2)
  else g.ellipse((p.x + p.w / 2) * s, (p.y + p.h / 2) * s, (p.w / 2) * s, (p.h / 2) * s, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  return c.toDataURL('image/png')
}

type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null }

/**
 * Voice, off until pressed: press the mic, talk as long as you like (it never stops on its own: a pause
 * doesn't end it), press again to stop. The platform transcription (ElevenLabs) is used when its key is
 * set, the browser's own speech recognition otherwise, and typing always. With `clean`, what was said is
 * turned into clean natural language before it is handed on; the words as spoken come with it.
 */
export function useVoice(platform: boolean, onText: (text: string, raw?: string) => void, onNote: (msg: string) => void, opts: { clean?: boolean } = {}) {
  const [listening, setListening] = useState(false)
  const [working, setWorking] = useState(false)
  const rec = useRef<Recognizer | null>(null)
  const media = useRef<MediaRecorder | null>(null)
  const wanted = useRef(false)
  const heard = useRef<string[]>([])

  const deliver = async (raw: string) => {
    const said = raw.replace(/\s+/g, ' ').trim()
    if (!said) { onNote('Nothing was heard. Press the mic and try again.'); return }
    if (!opts.clean) { onText(said); return }
    setWorking(true)
    onNote('Turning what you said into clean text…')
    try {
      const r = await api<{ text: string }>('/api/voice/clean', { json: { text: said } })
      onText(r.text || said, said)
    } catch {
      onText(said, said)
    } finally {
      setWorking(false)
    }
  }

  const browser = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return false
    heard.current = []
    const begin = () => {
      const r = new Ctor()
      r.lang = 'en-US'
      r.interimResults = false
      r.continuous = true
      let session: string[] = []
      r.onresult = (e) => {
        session = []
        for (let i = 0; i < e.results.length; i++) session.push(e.results[i][0].transcript)
      }
      // Browsers end recognition after a pause; keep listening until the mic is pressed again.
      r.onend = () => {
        heard.current.push(session.join(' '))
        if (wanted.current) { try { begin() } catch { wanted.current = false } return }
        setListening(false)
        void deliver(heard.current.join(' '))
      }
      r.onerror = (e) => {
        const err = e.error
        if (err === 'not-allowed' || err === 'service-not-allowed') { wanted.current = false; setListening(false); onNote('The microphone is blocked for this page. Allow it in the browser’s address bar, then press the mic again.') }
        else if (err === 'audio-capture') { wanted.current = false; setListening(false); onNote('No microphone was found. Plug one in or type it instead.') }
        else if (err === 'network') { wanted.current = false; setListening(false); onNote('Voice needs a connection to the browser’s speech service. Type it instead, or try again.') }
      }
      rec.current = r
      r.start()
    }
    wanted.current = true
    begin()
    setListening(true)
    onNote('Listening. Talk as long as you like, then press the mic again to stop.')
    return true
  }

  let denied = ''
  const recorder = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e: unknown) => { denied = (e as { name?: string })?.name ?? 'denied'; return null })
    if (!stream) {
      if (denied === 'NotAllowedError' || denied === 'SecurityError') onNote('The microphone is blocked for this page. Allow it in the browser’s address bar (the lock or camera icon), then press the mic again.')
      else if (denied === 'NotFoundError') onNote('No microphone was found. Plug one in or type it instead.')
      return denied === 'NotAllowedError' || denied === 'SecurityError' || denied === 'NotFoundError'
    }
    const mr = new MediaRecorder(stream)
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setListening(false)
      onNote('Transcribing what you said…')
      const form = new FormData()
      form.append('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'voice-note.webm')
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
      if (res.ok && j.text) await deliver(j.text)
      else onNote(j.error || 'What you said could not be transcribed; type it instead.')
    }
    media.current = mr
    mr.start(1000)
    setListening(true)
    onNote('Recording. Talk as long as you like, then press the mic again to stop.')
    return true
  }

  const toggle = async () => {
    if (listening) {
      wanted.current = false
      rec.current?.stop()
      if (media.current && media.current.state !== 'inactive') media.current.stop()
      return
    }
    if (platform && (await recorder())) return
    if (browser()) return
    if (!platform && (await recorder())) return
    onNote('This browser can’t listen; type it instead.')
  }
  return { listening, working, toggle: () => void toggle() }
}
