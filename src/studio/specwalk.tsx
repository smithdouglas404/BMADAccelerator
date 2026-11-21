'use client'

// The PRD and TRD screens' guide (Doug, Nov 21): what the document is and how you'll work on it, two ways in
// ("Walk me through it" or just read and review the sections), documents for the whole document or one
// section, and the walkthrough: first any documents that could help, then each question of the skill, asked by
// the specialist the skill names. Every answer is checked against its bar, thin answers get one follow-up (at
// most two), and finished questions are written into their section and the sections they inform. All wording of
// the explainer, questions and bars comes from the studio-prd / studio-trd skills through
// /api/use-cases/[id]/spec-walk/[tab]; nothing here is fixed content.

import { Rich } from './rich'
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, CircleAlert, Loader2, Mic, MicOff, Minus, Send, Sparkles, Upload, X } from 'lucide-react'
import { api, type Live } from './live'
import { useVoice } from './vibe'
import { StudioMarkdown } from './extras'
import type { Me } from './flow'

type Tab = 'prd' | 'trd'
type Step = { key: string; title: string; kicker: string; asker: string; askerName: string; ask: string; bar: string; informs: string[] }
type WalkStatus = 'ready' | 'needs work' | 'skipped'
export type SpecWalkInfo = {
  explainer: string
  walkIntro: string
  walk: { on: boolean; step: string; status: Record<string, WalkStatus>; rounds: Record<string, number> }
  steps: Step[]
  exchange: Record<string, { id: string; who: string; mine: boolean; text: string }[]>
  writing: boolean
}

const byOf = (me: Me) => me.name || me.role

function useSpecWalk(live: Live, tab: Tab) {
  const [info, setInfo] = useState<SpecWalkInfo | null>(null)
  const load = useCallback(async () => { try { setInfo(await api<SpecWalkInfo>(`/api/use-cases/${live.id}/spec-walk/${tab}`, { cache: 'no-store' })) } catch { /* shown as not loaded */ } }, [live.id, tab])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!info?.writing) return
    const t = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(t)
  }, [info?.writing, load])
  return { info, reload: load }
}

/** Upload documents for one section (its key) or for the whole PRD / TRD ("prd" | "trd"). */
export function SpecDocUpload({ live, section, label, setToast, small = true }: { live: Live; section: string; label: string; setToast: (v: string) => void; small?: boolean }) {
  const [adding, setAdding] = useState(false)
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setAdding(true)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      form.append('section', section)
      const res = await fetch(`/api/use-cases/${live.id}/documents`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('The upload did not go through')
      setToast(`${files.length === 1 ? files[0].name : `${files.length} documents`} added. The team reads ${files.length === 1 ? 'it' : 'them'} and updates this ${section === 'prd' || section === 'trd' ? section.toUpperCase() : 'section'}.`)
    } catch (err) { setToast(err instanceof Error ? err.message : String(err)) }
    finally { setAdding(false) }
  }
  return <label className={`button button-quiet ${small ? 'button-small ' : ''}file-button`}><Upload size={13} /> {adding ? 'Adding…' : label}<input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.json,.yaml,.yml,.html" onChange={upload} disabled={adding} /></label>
}

/** The guide at the top of the PRD or TRD screen. */
export function SpecGuide({ live, me, tab, setToast, onFocus }: { live: Live; me: Me; tab: Tab; setToast: (v: string) => void; onFocus: (key: string) => void }) {
  const { info, reload } = useSpecWalk(live, tab)
  const [open, setOpen] = useState(false)
  if (!info) return null
  const doc = tab.toUpperCase()
  const move = async (action: 'start' | 'stop') => {
    try { await api(`/api/use-cases/${live.id}/spec-walk/${tab}`, { json: { action, by: byOf(me) } }); await reload() } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }
  if (info.walk.on) return <SpecWalk live={live} me={me} tab={tab} info={info} reload={reload} setToast={setToast} onFocus={onFocus} leave={() => void move('stop')} />
  const questions = info.steps.filter((s) => s.title)
  const ready = questions.filter((s) => info.walk.status[s.key] === 'ready').length
  const started = Object.keys(info.walk.status).length > 0
  return <section className="studio-prfaq-start studio-spec-guide" aria-label={`What a ${doc} is`}>
    <div className="studio-prfaq-walk-head">
      <div><span className="eyebrow">What a {doc} is</span>{started && <small>{ready} of {questions.length} questions answered</small>}</div>
      <button type="button" className="text-button" onClick={() => setOpen(!open)}>{open ? <>Hide <ChevronUp size={13} /></> : <>Read more <ChevronDown size={13} /></>}</button>
    </div>
    <StudioMarkdown text={open ? info.explainer : info.explainer.split('\n\n')[0]} />
    <div className="studio-prfaq-doors">
      <button type="button" className="studio-prfaq-option is-suggested" onClick={() => void move('start')}><Sparkles size={15} /><span><strong>{started ? 'Continue the walkthrough' : 'Walk me through it'}<em>suggested</em></strong><small>{questions.length} questions, one at a time{questions.length ? `, asked by the ${[...new Set(questions.map((q) => q.askerName.toLowerCase()).filter(Boolean))].join(', ')}` : ''}. Each answer is checked; thin ones get a follow-up.</small></span></button>
      <div className="studio-prfaq-option studio-spec-guide-docs"><Upload size={15} /><span><strong>Add documents for the {doc}</strong><small>Anything that could help: the team reads it and updates the sections. You can also add one to any single section below.</small><SpecDocUpload live={live} section={tab} label="Add documents" setToast={setToast} /></span></div>
    </div>
  </section>
}

const statusIcon = (s?: string) => (s === 'ready' ? <Check size={12} /> : s === 'needs work' ? <CircleAlert size={12} /> : s === 'skipped' ? <Minus size={12} /> : null)

function SpecWalk({ live, me, tab, info, reload, setToast, onFocus, leave }: { live: Live; me: Me; tab: Tab; info: SpecWalkInfo; reload: () => Promise<void>; setToast: (v: string) => void; onFocus: (key: string) => void; leave: () => void }) {
  const [text, setText] = useState('')
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const { walk, steps } = info
  const at = Math.max(0, steps.findIndex((s) => s.key === walk.step))
  const step = steps[at]
  const questions = steps.filter((s) => s.title)
  const ready = questions.filter((s) => walk.status[s.key] === 'ready').length
  const voice = useVoice(live.connections.voice, (said, spoken) => { setText((t) => `${t}${t.trim() ? ' ' : ''}${said}`); setRaw((r) => `${r}${r ? ' ' : ''}${spoken ?? said}`) }, setToast, { clean: true })
  useEffect(() => { if (step?.title) onFocus(step.key) }, [step?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const post = async (json: Record<string, unknown>) => {
    setBusy(true)
    try { const r = await api<{ status?: string }>(`/api/use-cases/${live.id}/spec-walk/${tab}`, { json: { by: byOf(me), ...json } }); await reload(); return r }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); return null }
    finally { setBusy(false) }
  }
  const send = async () => {
    if (!text.trim() || voice.listening) return
    const r = await post({ action: 'answer', step: step.key, text, raw })
    if (r) { setText(''); setRaw('') }
  }
  const go = (key: string) => void post({ action: 'go', step: key })
  if (!step) return null
  const exchange = info.exchange[step.key] ?? []
  const status = walk.status[step.key]
  const nextTitle = steps[at + 1]?.title
  const informs = step.informs.length
  return <section className="studio-prfaq-walk" aria-label={`${tab.toUpperCase()} walkthrough`}>
    <div className="studio-prfaq-walk-head">
      <div><strong>{tab.toUpperCase()} walkthrough</strong><small>{ready} of {questions.length} questions ready{info.writing ? ` · writing answers into the ${tab.toUpperCase()}…` : ''}</small></div>
      <button type="button" className="text-button" onClick={leave}><X size={13} /> Leave the walkthrough</button>
    </div>
    <ol className="studio-prfaq-steps">
      {steps.map((s, i) => <li key={s.key}><button type="button" className={`studio-prfaq-step${i === at ? ' is-current' : ''}${walk.status[s.key] ? ` is-${walk.status[s.key]!.replace(' ', '-')}` : ''}`} onClick={() => go(s.key)} disabled={busy}>{statusIcon(walk.status[s.key])}{s.title || 'Your documents'}</button></li>)}
    </ol>
    {step.key === 'materials' ? <div className="studio-prfaq-walk-step">
      <StudioMarkdown text={info.walkIntro} />
      <div className="studio-prfaq-talk-actions">
        <SpecDocUpload live={live} section={tab} label="Add documents" setToast={setToast} small={false} />
        <button type="button" className="button button-primary" disabled={busy} onClick={() => go(steps[1]?.key ?? 'materials')}>Next: {steps[1]?.title} <ArrowRight size={14} /></button>
      </div>
    </div> : <div className="studio-prfaq-walk-step">
      <span className="eyebrow">{step.title} · asked by the {step.askerName.toLowerCase() || 'team'}</span>
      <h3 className="studio-prfaq-ask">{step.ask}</h3>
      <p className="studio-prfaq-bar"><b>Good enough when:</b> {step.bar}</p>
      {exchange.length > 0 && <div className="studio-prfaq-exchange">{exchange.map((m) => <div key={m.id} className={`studio-prfaq-turn${m.mine ? ' is-mine' : ''}`}><small>{m.who}</small><Rich text={m.text} lines={m.mine ? 0 : 8} /></div>)}</div>}
      {busy && <p className="studio-item-working"><Loader2 size={13} className="studio-spin" /> The {step.askerName.toLowerCase() || 'team'} is checking your answer…</p>}
      {status && <p className={`studio-prfaq-verdict is-${status.replace(' ', '-')}`}>{statusIcon(status)} {status === 'ready' ? `Ready. It goes into “${step.title}” now${informs ? `, and ${informs} related ${informs === 1 ? 'section is' : 'sections are'} inferred from it` : ''}.` : status === 'needs work' ? 'Kept as needs work. It goes in as it is; you can come back to it.' : 'Skipped for now.'}</p>}
      <div className="studio-prfaq-answer">
        <textarea className="spec-editor" rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }} placeholder={exchange.length ? 'Answer the follow-up, or add more…' : 'Say it or type it in your own words…'} aria-label="Your answer" />
        <div className="studio-prfaq-talk-actions">
          <button type="button" className={`button button-small ${voice.listening ? 'button-primary' : 'button-quiet'}`} onClick={voice.toggle} disabled={voice.working || busy}>{voice.listening ? <><MicOff size={14} /> Stop</> : <><Mic size={14} /> Talk</>}</button>
          <button type="button" className="button button-primary button-small" disabled={busy || !text.trim() || voice.listening} onClick={() => void send()}><Send size={13} /> Send</button>
          <SpecDocUpload live={live} section={step.key} label="Add a document" setToast={setToast} />
          <span className="studio-spacer" />
          {nextTitle && <button type="button" className={`button button-small ${status ? 'button-primary' : 'button-quiet'}`} disabled={busy} onClick={() => (status ? go(steps[at + 1].key) : void post({ action: 'skip' }))}>{status ? `Next: ${nextTitle}` : 'Skip for now'} <ArrowRight size={13} /></button>}
          {!nextTitle && status && <button type="button" className="button button-primary button-small" onClick={leave}>Finish the walkthrough <Check size={13} /></button>}
        </div>
      </div>
    </div>}
  </section>
}
