'use client'
// The generated app full screen, with the mark-up layer always one click away (Doug, Nov 16: "as I'm on
// the screen, I can circle something and give feedback by voice or typing, and it goes back in as a new
// requirement or a change to one"). Reuses the Studio's live frame, picture capture and voice; the note
// goes to the same feedback route as the Try & mark up view, so Socra curates it the same way.
import { useState } from 'react'
import { ArrowLeft, Check, Circle, Maximize2, Mic, MousePointer2, PenLine, X } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
      <div data-ui className="fixed right-4 bottom-4 z-10 flex gap-2">
        <Button asChild variant="outline" className="rounded-full border-white/20 !bg-background/90 !text-foreground shadow-lg backdrop-blur"><a href={`/use-cases/${live.id}?view=review`} className="gap-1.5"><ArrowLeft className="size-4" /> {live.name}</a></Button>
        <Button type="button" variant={marking ? 'outline' : 'default'} aria-pressed={marking} onClick={() => (marking ? close() : setMarking(true))} className={cn('gap-1.5 rounded-full shadow-lg', marking && 'border-primary !bg-background/90 !text-foreground')}>
          {marking ? <><X className="size-4" /> Stop marking up</> : <><PenLine className="size-4" /> Mark it up</>}
        </Button>
      </div>
      {marking && (
        <section data-ui aria-label="Mark it up" className="fixed right-4 bottom-18 z-10 grid max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] gap-3 overflow-auto rounded-xl border border-primary/40 bg-card p-4 shadow-2xl">
          <h2 className="text-lg font-semibold">Tell {ASSISTANT_NAME} what to change</h2>
          <div role="group" aria-label="What to mark" className="flex flex-wrap gap-1.5">
            {([['circle', 'Circle', Circle], ['object', 'Click a part', MousePointer2], ['full-screen', 'Whole screen', Maximize2]] as const).map(([k, label, Icon]) => (
              <Button key={k} type="button" size="sm" variant={shape === k ? 'secondary' : 'ghost'} aria-pressed={shape === k} className={cn('gap-1.5', shape === k && 'ring-1 ring-primary/40')} onClick={() => { setShape(k); setImage(''); if (k === 'full-screen') void wholeScreen() }}><Icon className="size-4" />{label}</Button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"><MousePointer2 className="size-4 shrink-0 text-primary" /><span className={cn('min-w-0 flex-1', !target && 'text-muted-foreground')}>{target || (shape === 'circle' ? 'Drag a circle around the part you mean' : shape === 'object' ? 'Click the part you mean' : 'Capturing the whole screen…')}</span>{image && <span className="inline-flex items-center gap-1 text-xs text-primary"><Check className="size-3.5" /> Captured</span>}</div>
          {image && <img className="w-full rounded-lg border border-border" src={image} alt="The part you marked" />}
          <div className="grid gap-1.5"><Label htmlFor="try-note" className="text-sm font-medium">What should be different here?</Label><Textarea id="try-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type, or press Talk and say it." rows={3} className="text-base" /></div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={voice.listening ? 'default' : 'outline'} aria-pressed={voice.listening} onClick={voice.toggle} className="gap-1.5"><Mic className="size-4" /> {voice.listening ? 'Listening… press to stop' : voice.working ? 'Writing it down…' : 'Talk'}</Button>
            {image && <Button type="button" size="sm" variant="ghost" onClick={() => { setImage(''); setPick(null); setTarget('') }}>Mark again</Button>}
            <Button type="button" size="sm" onClick={() => void send()} disabled={!note.trim() || sending} className="ml-auto">{sending ? 'Sending…' : `Send to ${ASSISTANT_NAME}`}</Button>
          </div>
        </section>
      )}
      {toast && <button data-ui type="button" onClick={() => setToast('')} className="fixed top-4 left-1/2 z-20 max-w-[min(35rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg">{toast}</button>}
    </div>
  )
}
