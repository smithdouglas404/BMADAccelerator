'use client'
// Try & mark up on shadcn/ui + Animate UI: the live product, the mark-up panel (point, circle or whole
// screen, say what should change, add a voice note or a picture) and the marks so far with what Socra
// read from each. PreviewCard and AnnotationPanel are shared with Whole product and Work with Socra.
// Same calls as the older screen.
import { useState } from 'react'
import { ArrowRight, Check, Circle, Maximize2, Mic, MousePointer2, MoveUpRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, ago, previewUrl, type Live, type LiveFeedback } from './live'
import { LiveFrame, type Pick } from './vibe'
import type { StudioView } from './flow'
import { Empty, PageHeader, Section, StatusBadge } from './kit'

type Shape = 'object' | 'circle' | 'full-screen'
type Tone = 'ok' | 'warn' | 'off' | 'info' | 'suggest'
const MARK_TONE: Record<string, Tone> = { built: 'ok', new: 'warn' }
const MARK_LABEL: Record<string, string> = { built: 'Built', new: 'For the next build' }

/** The live product in a card: try it, switch to the latest held thought, or start marking it up. */
export function PreviewCard({ live, mode, setPreview, setToast, annotationMode = false, setAnnotationMode, onSelectTarget, annotationShape = 'object', onPick, tall = false }: { live: Live; mode: 'home' | 'thread'; setPreview: (mode: 'home' | 'thread') => void; setToast: (value: string) => void; annotationMode?: boolean; setAnnotationMode?: (value: boolean) => void; onSelectTarget?: (value: string) => void; annotationShape?: Shape; onPick?: (p: Pick) => void; tall?: boolean }) {
  const held = live.backlog.filter((b) => b.kind === 'capture' && b.state !== 'suggested' && b.state !== 'probing').slice(-1)[0]
  const holdAs = (kind: 'epic' | 'distraction') => {
    if (!held) return
    void api(`/api/use-cases/${live.id}/backlog/${held.id}`, { method: 'PATCH', json: { kind, group: kind === 'distraction' ? undefined : live.capabilities.find((c) => c.key === live.focus)?.label } })
      .then(() => setToast(kind === 'distraction' ? 'Parked without losing the thought' : 'Kept in the product shape'))
      .catch((e: Error) => setToast(e.message))
  }
  const open = previewUrl(live.preview.port, '/')
  const fullScreen = () => (open ? window.open(`/use-cases/${live.id}/try`, '_blank', 'noopener') : setToast('The product opens full screen once its first version runs'))
  return (
    <section data-ui aria-label="Live product" className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-lg font-semibold">What {live.name} feels like in the hand</h2>
          {open
            ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={`/use-cases/${live.id}/try`} target="_blank" rel="noopener noreferrer">Try it full screen and mark it up <MoveUpRight className="size-4" /></a><a className="truncate font-mono text-xs text-muted-foreground hover:text-foreground" href={open} target="_blank" rel="noopener noreferrer">{open.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></div>
            : <p className="text-sm text-muted-foreground">The product appears here once its first version runs.</p>}
        </div>
        <div className="flex items-center gap-2">
          {setAnnotationMode && <Button type="button" size="sm" variant={annotationMode ? 'default' : 'outline'} aria-pressed={annotationMode} onClick={() => setAnnotationMode(!annotationMode)} className="gap-1.5"><MousePointer2 className="size-4" />{annotationMode ? (annotationShape === 'circle' ? 'Drag a circle' : annotationShape === 'full-screen' ? 'Whole screen' : 'Click a part') : 'Mark it up'}</Button>}
          <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="Open the product full screen" onClick={fullScreen}><Maximize2 className="size-4" /></Button></TooltipTrigger><TooltipContent>Full screen</TooltipContent></Tooltip>
        </div>
      </div>
      <Tabs value={mode} onValueChange={(v) => setPreview(v as 'home' | 'thread')}>
        <TabsList><TabsTrigger value="home">The product</TabsTrigger><TabsTrigger value="thread">Latest held thought</TabsTrigger></TabsList>
      </Tabs>
      {mode === 'home'
        ? <LiveFrame live={live} annotationMode={annotationMode} shape={annotationShape} tall={tall} onPick={(p) => { onSelectTarget?.(p.kind === 'region' ? 'Circled region' : 'Selected surface'); onPick?.(p) }} />
        : (
          <div className="grid gap-4 rounded-lg border border-primary/20 bg-muted/40 p-5">
            <blockquote className="grid gap-2">
              <p className="font-serif text-xl leading-snug">“{held ? held.title : 'Nothing is waiting. Every thought you have had already has a home.'}”</p>
              <footer className="text-xs text-muted-foreground">{held ? `Held ${ago(held.createdAt)}. Socra is listening.` : 'Hold one any time from the sidebar or your phone.'}</footer>
            </blockquote>
            {held && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => holdAs('epic')}>Keep with {live.name}</Button><Button type="button" size="sm" variant="outline" onClick={() => holdAs('distraction')}>Let it wait</Button></div>}
          </div>
        )}
    </section>
  )
}

const SHAPES: [Shape, string, typeof MousePointer2][] = [['object', 'Point at a part', MousePointer2], ['circle', 'Circle a region', Circle], ['full-screen', 'Whole screen', Maximize2]]

/** Say what should change about the part you pointed at. The note goes to Socra with the picture attached. */
export function AnnotationPanel({ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }: { annotationMode: boolean; setAnnotationMode: (value: boolean) => void; annotationTarget: string; annotationNote: string; setAnnotationNote: (value: string) => void; isListening: boolean; toggleVoice: () => void; addAnnotation: () => void; captureFrame: (mode?: 'surface' | 'screen') => void; capturedFrame: string; annotationShape: Shape; setAnnotationShape: (value: Shape) => void }) {
  if (!annotationMode && !annotationTarget) return null
  return (
    <section data-ui aria-label="Mark it up" className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-primary/40 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Point at the part you want to change</h2>
          <p className="text-sm text-muted-foreground">Click a part of the product or drag a circle around a region, then say what you see. It goes to Socra with the picture attached.</p>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Stop marking up" onClick={() => setAnnotationMode(false)}><X className="size-4" /></Button>
      </div>
      <div role="group" aria-label="What to mark" className="flex flex-wrap gap-1.5">
        {SHAPES.map(([s, label, Icon]) => <Button key={s} type="button" size="sm" variant={annotationShape === s ? 'secondary' : 'ghost'} aria-pressed={annotationShape === s} onClick={() => setAnnotationShape(s)} className={cn('gap-1.5', annotationShape === s && 'ring-1 ring-primary/40')}><Icon className="size-4" />{label}</Button>)}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <MousePointer2 className="size-4 text-primary" />
        <span className={cn('min-w-0 flex-1 truncate', !annotationTarget && 'text-muted-foreground')}>{annotationTarget || (annotationShape === 'full-screen' ? 'The whole screen' : 'Nothing picked yet')}</span>
        {annotationTarget && <StatusBadge tone="ok"><Check className="mr-1 inline size-3" />Picked</StatusBadge>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mark-note" className="text-sm font-medium">What should feel different here?</Label>
        <Textarea id="mark-note" value={annotationNote} onChange={(e) => setAnnotationNote(e.target.value)} rows={3} placeholder="Say it the way you would to a colleague…" className="text-base" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={isListening ? 'default' : 'outline'} aria-pressed={isListening} onClick={toggleVoice} className="gap-1.5"><Mic className="size-4" />{isListening ? 'Listening… press to stop' : 'Say it'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => captureFrame(annotationShape === 'full-screen' ? 'screen' : 'surface')} className="gap-1.5"><Maximize2 className="size-4" />{annotationShape === 'full-screen' ? 'Take the whole screen' : annotationShape === 'circle' ? 'Take the circle' : 'Take a picture'}</Button>
        <Button type="button" size="sm" onClick={addAnnotation} disabled={!annotationNote.trim()} className="ml-auto gap-1.5">Send to Socra <ArrowRight className="size-4" /></Button>
      </div>
      {capturedFrame && <figure className="grid gap-1.5"><img src={capturedFrame} alt="The picture attached to this mark" className="max-h-64 w-full rounded-lg border border-border object-contain" /><figcaption className="text-xs text-muted-foreground">Picture attached to the mark</figcaption></figure>}
    </section>
  )
}

/** The picture attached to a mark; hidden if it can't be loaded. */
function MarkImage({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return <a href={src} target="_blank" rel="noreferrer" className="self-start"><img src={src} alt={alt} onError={() => setBroken(true)} className="max-h-40 w-full rounded-lg border border-border object-cover object-top" /></a>
}

/** One mark and what Socra read from it: the region, the observation, the behaviour, and where it goes. */
function MarkDetails({ mark }: { mark: LiveFeedback }) {
  const it = mark.interpretation ?? {}
  const changes = [...(it.prd ?? []), ...(it.trd ?? [])]
  const rows: [string, string][] = [
    ['Where', `${mark.shape === 'circle' ? 'Circled' : mark.shape === 'full-screen' ? 'The whole screen' : 'Pointed at'} ${mark.target ? mark.target.replace(/^Circled /, '') : 'the product'}`],
    ['Behaviour', it.behaviour || 'Socra is reading what this means…'],
    ...(it.acceptance?.length ? [['Done when', it.acceptance.join(' · ')] as [string, string]] : []),
    ...(it.component ? [['Component', it.component] as [string, string]] : []),
    ...(changes.length ? [['Changes', changes.join(', ')] as [string, string]] : []),
    ...(it.question ? [['Socra asks', it.question] as [string, string]] : []),
    ['Build', mark.status === 'built' ? 'In the latest version' : 'Goes into the next build'],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{k}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
    </dl>
  )
}

type ReviewProps = {
  live: Live; previewMode: 'home' | 'thread'; setPreview: (mode: 'home' | 'thread') => void; setToast: (value: string) => void
  annotationMode: boolean; setAnnotationMode: (value: boolean) => void; setAnnotationTarget: (value: string) => void; annotationTarget: string
  annotationNote: string; setAnnotationNote: (value: string) => void; isListening: boolean; toggleVoice: () => void; addAnnotation: () => void
  captureFrame: (mode?: 'surface' | 'screen') => void; capturedFrame: string; annotationShape: Shape; setAnnotationShape: (value: Shape) => void
  onPick: (p: Pick) => void; changeView: (view: StudioView) => void
}

/** The live product, full width: click or circle what should change, say why, and it goes to Socra. */
export function ReviewView({ live, previewMode, setPreview, setToast, annotationMode, setAnnotationMode, setAnnotationTarget, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape, onPick, changeView }: ReviewProps) {
  const marks = live.feedback.slice(0, 6)
  const panel = annotationMode || !!annotationTarget
  return (
    <div data-ui className="mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Try it and mark it up"
        description="Use the product the way a customer would. Press Mark it up, click or circle the part you mean, and say what should change. Socra turns it into the next build."
        actions={<>
          <span className="text-sm text-muted-foreground">{live.feedback.length} {live.feedback.length === 1 ? 'mark' : 'marks'} so far</span>
          <Button type="button" variant={annotationMode ? 'secondary' : 'default'} aria-pressed={annotationMode} onClick={() => setAnnotationMode(!annotationMode)} className="gap-1.5"><MousePointer2 className="size-4" />{annotationMode ? 'Stop marking up' : 'Mark it up'}</Button>
        </>}
      />
      <div className={cn('grid min-w-0 grid-cols-1 gap-6', panel && 'xl:grid-cols-[minmax(0,1fr)_26rem]')}>
        <PreviewCard live={live} mode={previewMode} setPreview={setPreview} setToast={setToast} annotationMode={annotationMode} onSelectTarget={setAnnotationTarget} annotationShape={annotationShape} onPick={onPick} tall />
        {panel && <div className="min-w-0 xl:sticky xl:top-4 xl:self-start"><AnnotationPanel {...{ annotationMode, setAnnotationMode, annotationTarget, annotationNote, setAnnotationNote, isListening, toggleVoice, addAnnotation, captureFrame, capturedFrame, annotationShape, setAnnotationShape }} /></div>}
      </div>
      <Section title="What you asked to change" description="Your latest marks, and what Socra read from each." action={marks.length > 0 ? <Button type="button" size="sm" onClick={() => changeView('brief')} className="gap-1.5">Build the next version <ArrowRight className="size-4" /></Button> : undefined}>
        {marks.length === 0 && <Empty>No marks yet. Press Mark it up and point at anything that should change.</Empty>}
        {marks.map((f) => (
          <article key={f.id} className="grid min-w-0 grid-cols-1 gap-3 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="grid min-w-0 gap-3">
              <div className="flex flex-wrap items-start gap-2"><h3 className="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">“{f.interpretation?.observation || f.comment}”</h3><span className="shrink-0"><StatusBadge tone={MARK_TONE[f.status] ?? 'off'}>{MARK_LABEL[f.status] ?? f.status}</StatusBadge></span></div>
              <span className="text-xs text-muted-foreground">{ago(f.createdAt)}</span>
              <MarkDetails mark={f} />
            </div>
            {f.imageUrl && <MarkImage src={f.imageUrl} alt={`The picture for: ${f.comment}`} />}
          </article>
        ))}
      </Section>
    </div>
  )
}
