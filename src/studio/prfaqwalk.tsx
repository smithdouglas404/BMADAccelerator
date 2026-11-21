'use client'

// The PRFAQ's way in (Doug, Nov 21): an empty PRFAQ explains what a PRFAQ is and offers two ways in, "Walk me
// through it" (first-timers start here) or "Just talk, then generate". The walkthrough goes one section at a
// time: first any documents that could help, then each section's question; every answer is checked against the
// section's bar by a specialist, who says what is thin and asks one follow-up (at most two), and finished
// sections are written into the PRFAQ. All wording of the explainer, questions and bars comes from the
// studio-prfaq skill through /api/use-cases/[id]/prfaq; nothing here is fixed content.

import { useState } from 'react'
import { ArrowRight, Check, CircleAlert, Loader2, Mic, MicOff, Minus, Send, Sparkles, X } from 'lucide-react'
import { api, type Live } from './live'
import { useVoice } from './vibe'
import { StudioMarkdown } from './extras'
import { PrfaqDocs, PrfaqTalk, byOf, type PrfaqInfo } from './prfaqtalk'
import type { Me } from './flow'

const FIRST_TIMER = 'First-time creator'

/** Which way in to show: the walkthrough, the explainer with two doors (empty PRFAQ), or the talk panel. */
export function PrfaqPanel({ live, me, info, reload, setToast }: { live: Live; me: Me; info: PrfaqInfo | null; reload: () => Promise<void>; setToast: (v: string) => void }) {
  const [talk, setTalk] = useState(false)
  if (!info) return null
  const move = async (action: 'walk-start' | 'walk-stop') => {
    try { await api(`/api/use-cases/${live.id}/prfaq`, { json: { action, by: byOf(me) } }); await reload() } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  if (info.walk.on) return <PrfaqWalk live={live} me={me} info={info} reload={reload} setToast={setToast} leave={() => void move('walk-stop')} />
  if (!live.prfaq.trim() && !talk) {
    const first = me.role === FIRST_TIMER
    return <section className="studio-prfaq-start" aria-label="What a PRFAQ is">
      <span className="eyebrow">What a PRFAQ is</span>
      <StudioMarkdown text={info.explainer} />
      <div className="studio-prfaq-doors">
        <button type="button" className={`studio-prfaq-option${first ? ' is-suggested' : ''}`} onClick={() => void move('walk-start')}><Sparkles size={15} /><span><strong>Walk me through it{first && <em>suggested</em>}</strong><small>One section at a time. The team checks each answer and asks follow-ups until it is clear.</small></span></button>
        <button type="button" className={`studio-prfaq-option${first ? '' : ' is-suggested'}`} onClick={() => setTalk(true)}><Mic size={15} /><span><strong>Just talk, then generate{!first && <em>suggested</em>}</strong><small>Say it all in your own words, add documents, and get a first draft with every gap marked.</small></span></button>
      </div>
    </section>
  }
  return <PrfaqTalk live={live} me={me} info={info} reload={reload} setToast={setToast} onWalk={() => void move('walk-start')} />
}

const statusIcon = (s?: string) => (s === 'ready' ? <Check size={12} /> : s === 'needs work' ? <CircleAlert size={12} /> : s === 'skipped' ? <Minus size={12} /> : null)

/** One section at a time; each answer checked, with follow-ups; finished sections written into the PRFAQ. */
export function PrfaqWalk({ live, me, info, reload, setToast, leave }: { live: Live; me: Me; info: PrfaqInfo; reload: () => Promise<void>; setToast: (v: string) => void; leave: () => void }) {
  const [text, setText] = useState('')
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const { walk, steps } = info
  const at = Math.max(0, steps.findIndex((s) => s.key === walk.step))
  const step = steps[at]
  const sections = steps.filter((s) => s.title)
  const ready = sections.filter((s) => walk.status[s.key] === 'ready').length
  const voice = useVoice(live.connections.voice, (said, spoken) => { setText((t) => `${t}${t.trim() ? ' ' : ''}${said}`); setRaw((r) => `${r}${r ? ' ' : ''}${spoken ?? said}`) }, setToast, { clean: true })
  const post = async (json: Record<string, unknown>) => {
    setBusy(true)
    try { const r = await api<{ status?: string; specialist?: string }>(`/api/use-cases/${live.id}/prfaq`, { json: { by: byOf(me), ...json } }); await reload(); return r }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); return null }
    finally { setBusy(false) }
  }
  const send = async () => {
    if (!text.trim() || voice.listening) return
    const r = await post({ action: 'walk-answer', step: step.key, text, raw })
    if (r) { setText(''); setRaw('') }
  }
  const go = (key: string) => void post({ action: 'walk-go', step: key })
  const exchange = info.exchange[step.key] ?? []
  const status = walk.status[step.key]
  const nextTitle = steps[at + 1]?.title
  return <section className="studio-prfaq-walk" aria-label="PRFAQ walkthrough">
    <div className="studio-prfaq-walk-head">
      <div><strong>PRFAQ walkthrough</strong><small>{ready} of {sections.length} sections ready{info.writing ? ' · writing finished sections into the PRFAQ…' : ''}</small></div>
      <button type="button" className="text-button" onClick={leave}><X size={13} /> Leave the walkthrough</button>
    </div>
    <ol className="studio-prfaq-steps">
      {steps.map((s, i) => <li key={s.key}><button type="button" className={`studio-prfaq-step${i === at ? ' is-current' : ''}${walk.status[s.key] ? ` is-${walk.status[s.key]!.replace(' ', '-')}` : ''}`} onClick={() => go(s.key)} disabled={busy}>{statusIcon(walk.status[s.key])}{s.title || 'Your documents'}</button></li>)}
    </ol>
    {step.key === 'materials' ? <div className="studio-prfaq-walk-step">
      <StudioMarkdown text={info.walkIntro} />
      <PrfaqDocs live={live} info={info} reload={reload} setToast={setToast} />
      <div className="studio-prfaq-talk-actions"><button type="button" className="button button-primary" disabled={busy} onClick={() => go(steps[1].key)}>{info.docs.length ? 'Next' : 'Nothing to add for now, next'}: {steps[1]?.title} <ArrowRight size={14} /></button></div>
    </div> : <div className="studio-prfaq-walk-step">
      <span className="eyebrow">{step.title} · {step.holds}</span>
      <h3 className="studio-prfaq-ask">{step.ask}</h3>
      <p className="studio-prfaq-bar"><b>Good enough when:</b> {step.bar}</p>
      {exchange.length > 0 && <div className="studio-prfaq-exchange">{exchange.map((m) => <div key={m.id} className={`studio-prfaq-turn${m.mine ? ' is-mine' : ''}`}><small>{m.who}</small><p>{m.text}</p></div>)}</div>}
      {busy && <p className="studio-item-working"><Loader2 size={13} className="studio-spin" /> The team is checking your answer…</p>}
      {status && <p className={`studio-prfaq-verdict is-${status.replace(' ', '-')}`}>{statusIcon(status)} {status === 'ready' ? 'Ready. It goes into the PRFAQ now.' : status === 'needs work' ? 'Kept as needs work. It goes into the PRFAQ as it is; you can come back to it.' : 'Skipped for now.'}</p>}
      <div className="studio-prfaq-answer">
        <textarea className="spec-editor" rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }} placeholder={exchange.length ? 'Answer the follow-up, or add more…' : 'Say it or type it in your own words…'} aria-label="Your answer" />
        <div className="studio-prfaq-talk-actions">
          <button type="button" className={`button button-small ${voice.listening ? 'button-primary' : 'button-quiet'}`} onClick={voice.toggle} disabled={voice.working || busy}>{voice.listening ? <><MicOff size={14} /> Stop</> : <><Mic size={14} /> Talk</>}</button>
          <button type="button" className="button button-primary button-small" disabled={busy || !text.trim() || voice.listening} onClick={() => void send()}><Send size={13} /> Send</button>
          <span className="studio-spacer" />
          {nextTitle && <button type="button" className={`button button-small ${status ? 'button-primary' : 'button-quiet'}`} disabled={busy} onClick={() => (status ? go(steps[at + 1].key) : void post({ action: 'walk-skip' }))}>{status ? `Next: ${nextTitle}` : 'Skip for now'} <ArrowRight size={13} /></button>}
          {!nextTitle && status && <button type="button" className="button button-primary button-small" onClick={leave}>Finish the walkthrough <Check size={13} /></button>}
        </div>
      </div>
    </div>}
  </section>
}
