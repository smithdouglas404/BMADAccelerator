'use client'
// The generated app full screen, with the mark-up layer always one click away (Doug, Nov 16: "as I'm on
// the screen, I can circle something and give feedback by voice or typing, and it goes back in as a new
// requirement or a change to one"). Reuses the Studio's live frame, picture capture and voice; the note
// goes to the same feedback route as the Try & mark up view, so Socra curates it the same way.
import { useState } from 'react'
import { ArrowLeft, Check, CircleHelp, Maximize2, Mic, MousePointer2, PenLine, X } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { api, useLive } from './live'
import { LiveFrame, captureLive, useVoice, type Pick } from './vibe'

type Shape = 'object' | 'circle' | 'full-screen'

export default function TryIt({ id }: { id: string }) {
  const { data: live, error } = useLive(id)
  const [marking, setMarking] = useState(false)
  const [shape, setShape] = useState<Shape>('circle')
  const [pick, setPick] = useState<Pick | null>(null)
  const [target, setTarget] = useState('')
  const [image, setImage] = useState('')
  const [note, setNote] = useState('')
  const [spoken, setSpoken] = useState(false)
  const [toast, setToast] = useState('')
  const [sending, setSending] = useState(false)
  const voice = useVoice(!!live?.connections.voice, (text) => { setNote((c) => `${c}${c ? ' ' : ''}${text}`); setSpoken(true) }, setToast)

  if (!live) return <div className="studio-try is-loading"><p className="eyebrow">{error || 'Opening the app…'}</p></div>

  const reset = () => { setPick(null); setTarget(''); setImage(''); setNote(''); setSpoken(false) }
  const close = () => { reset(); setMarking(false) }

  const onPick = async (p: Pick) => {
    setPick(p)
    setTarget(p.kind === 'region' ? `Circled region on ${p.path}` : 'Finding the part you clicked…')
    try {
      const r = await captureLive(live, p)
      setImage(r.image)
      setTarget(p.kind === 'region' ? `Circled region on ${p.path}${r.target ? ` (${r.target})` : ''}` : r.target ? `${r.target} on ${p.path}` : `Spot on ${p.path}`)
    } catch (e) {
      setTarget(p.kind === 'region' ? `Circled region on ${p.path}` : `Spot on ${p.path}`)
      setToast(e instanceof Error ? e.message : String(e))
    }
  }

  const wholeScreen = async () => {
    const box = document.querySelector('.studio-try .live-frame') as HTMLElement | null
    const path = pick?.path ?? '/'
    try {
      const r = await captureLive(live, { kind: 'screen', path, width: Math.round(box?.clientWidth || 1280), height: Math.round(box?.clientHeight || 800) })
      setImage(r.image)
      setTarget(`Whole screen of ${path}`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    }
  }

  const send = async () => {
    const comment = note.trim()
    if (!comment || sending) return
    setSending(true)
    const region = pick?.kind === 'region' ? { x: pick.x, y: pick.y, w: pick.w, h: pick.h } : pick?.kind === 'point' ? { x: pick.x, y: pick.y, w: 0, h: 0 } : undefined
    try {
      await api(`/api/use-cases/${live.id}/feedback`, { json: { comment, image: image || undefined, target: target || 'selected product surface', shape, pageUrl: pick?.path ?? '/', region, voice: spoken } })
      setToast(`Sent to ${ASSISTANT_NAME}. It becomes a new requirement or a change to one, ready for the next build.`)
      close()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="studio-try">
      <LiveFrame live={live} annotationMode={marking && !image} shape={shape} onPick={(p) => void onPick(p)} tall />
      <div className="studio-try-bar">
        <a className="studio-try-chip" href={`/use-cases/${live.id}?view=review`}><ArrowLeft size={13} /> {live.name}</a>
        <button className={`studio-try-chip is-primary ${marking ? 'is-active' : ''}`} type="button" onClick={() => (marking ? close() : setMarking(true))}>
          {marking ? <><X size={13} /> Stop marking up</> : <><PenLine size={13} /> Mark up</>}
        </button>
      </div>
      {marking && (
        <div className="studio-try-panel">
          <p className="eyebrow">Tell {ASSISTANT_NAME} what to change</p>
          <div className="annotation-modes">
            <button className={shape === 'circle' ? 'is-active' : ''} type="button" onClick={() => { setShape('circle'); setImage('') }}><CircleHelp size={12} /> Circle</button>
            <button className={shape === 'object' ? 'is-active' : ''} type="button" onClick={() => { setShape('object'); setImage('') }}><MousePointer2 size={12} /> Click a part</button>
            <button className={shape === 'full-screen' ? 'is-active' : ''} type="button" onClick={() => { setShape('full-screen'); void wholeScreen() }}><Maximize2 size={12} /> Whole screen</button>
          </div>
          <div className="annotation-target-row"><span className="annotation-pin"><MousePointer2 size={14} /></span><span>{target || (shape === 'circle' ? 'Drag a circle around the part you mean' : shape === 'object' ? 'Click the part you mean' : 'Capturing the whole screen…')}</span>{image && <span className="selected-chip"><Check size={12} /> captured</span>}</div>
          {image && <img className="studio-try-shot" src={image} alt="The part you marked" />}
          <textarea className="studio-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should be different here? Type, or press the mic and talk." rows={3} />
          <div className="studio-try-actions">
            <button className={`voice-button ${voice.listening ? 'is-listening' : ''}`} type="button" onClick={voice.toggle}><Mic size={14} /> {voice.listening ? 'Listening… press to stop' : voice.working ? 'Writing it down…' : 'Talk'}</button>
            {image && <button className="button button-quiet button-small" type="button" onClick={() => { setImage(''); setPick(null); setTarget('') }}>Mark again</button>}
            <button className="button button-primary button-small" type="button" onClick={() => void send()} disabled={!note.trim() || sending}>{sending ? 'Sending…' : `Send to ${ASSISTANT_NAME}`}</button>
          </div>
        </div>
      )}
      {toast && <button className="studio-try-toast" type="button" onClick={() => setToast('')}>{toast}</button>}
    </div>
  )
}
