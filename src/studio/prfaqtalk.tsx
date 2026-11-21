'use client'

// Generate PRFAQ from what you said (Doug, Nov 21). On the Product story page: talk (or type) for as long as you
// like, add Word, PowerPoint or other documents, press Generate PRFAQ. A later press asks first: Reformat what's
// there (same content, put back in the format) or Generate a new one (from everything said and the documents);
// the version before is always kept and can be brought back. Every line links to the words it came from; every
// gap shows as Missing with Ask Socra; Socra's questions and the PRFAQ's Traceability sit under it. Everything
// shown comes from the record (/api/use-cases/[id]/prfaq and the PRFAQ's trace).

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowRight, CircleHelp, FileText, Loader2, Mic, MicOff, RotateCcw, Sparkles, Upload, Wand2, X } from 'lucide-react'
import { ASSISTANT_NAME } from '@/lib/brand'
import { prfaqMarkers } from '@/lib/studio/prfaqDraft'
import { api, ago, type Live } from './live'
import { useVoice } from './vibe'
import { StudioMarkdown } from './extras'
import { ItemQuestions, ItemTraceability, useItemTrace } from './itemtrace'
import type { Me } from './flow'

type Source = { quote: string; from: string; name: string }
export type PrfaqInfo = {
  draft: { transcript: string; raw: string; updatedAt: string }
  talks: number
  fresh: { talks: number; docs: { id: string; name: string }[]; said: number }
  docs: string[]
  sources: Record<string, Source>
  last: { at: string; how: string; kept: number; dropped: number; missing: number; from: string[] } | null
  versions: { at: string; how: string; by: string }[]
  answers: Record<string, { text: string; who: string; at: string }>
  explainer: string
  walkIntro: string
  walk: { on: boolean; step: string; status: Record<string, 'ready' | 'needs work' | 'skipped'>; rounds: Record<string, number> }
  steps: { key: string; title: string; holds: string; ask: string; bar: string }[]
  exchange: Record<string, { id: string; who: string; mine: boolean; text: string; at: string }[]>
  writing: boolean
}

const NODE = 'prfaq'

/** Where each PRFAQ line came from, the talk being recorded and earlier versions; refreshed when the PRFAQ changes. */
export function usePrfaqInfo(live: Live) {
  const [info, setInfo] = useState<PrfaqInfo | null>(null)
  const load = useCallback(async () => { try { setInfo(await api<PrfaqInfo>(`/api/use-cases/${live.id}/prfaq`, { cache: 'no-store' })) } catch { /* shown as not loaded */ } }, [live.id])
  useEffect(() => { void load() }, [load, live.prfaqUpdatedAt, live.documents.length])
  // While finished walkthrough sections are being written into the PRFAQ, look again every few seconds.
  useEffect(() => {
    if (!info?.writing) return
    const t = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(t)
  }, [info?.writing, load])
  return { info, reload: load }
}

export const byOf = (me: Me) => (me.name ? `${me.name} (${me.role})` : me.role)

/** The talk-it-through panel: voice or typing, documents, and Generate PRFAQ (Reformat or Generate new). */
export function PrfaqTalk({ live, me, info, reload, setToast, onWalk }: { live: Live; me: Me; info: PrfaqInfo | null; reload: () => Promise<void>; setToast: (v: string) => void; onWalk?: () => void }) {
  const [text, setText] = useState('')
  const [raw, setRaw] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<'' | 'generate' | 'update' | 'reformat' | 'restore'>('')
  const [choosing, setChoosing] = useState(false)
  const [open, setOpen] = useState(!live.prfaq.trim())
  const save = useRef<number | null>(null)
  useEffect(() => {
    if (!info || loaded) return
    setText(info.draft.transcript); setRaw(info.draft.raw); setLoaded(true)
    if (info.draft.transcript.trim()) setOpen(true)
  }, [info, loaded])
  // The talk is kept as it grows, so nothing said is lost if the page closes before Generate.
  const keep = (t: string, r: string) => {
    if (save.current) window.clearTimeout(save.current)
    save.current = window.setTimeout(() => void api(`/api/use-cases/${live.id}/prfaq`, { method: 'PUT', json: { transcript: t, raw: r } }).catch(() => undefined), 700)
  }
  const voice = useVoice(live.connections.voice, (said, spoken) => {
    setText((t) => { const next = `${t}${t.trim() ? '\n\n' : ''}${said}`; setRaw((r) => { const nr = `${r}${r ? '\n\n' : ''}${spoken ?? said}`; keep(next, nr); return nr }); return next })
  }, setToast, { clean: true })
  const run = async (action: 'generate' | 'update' | 'reformat' | 'restore') => {
    if (voice.listening) { setToast('Stop the mic first, so everything you said is in.'); return }
    setBusy(action); setChoosing(false)
    try {
      const r = await api<{ kept?: number; missing?: number; dropped?: number }>(`/api/use-cases/${live.id}/prfaq`, { json: { action, by: byOf(me), ...(action === 'generate' || action === 'update' ? { transcript: text, raw, docs: picked } : {}) } })
      if (action === 'generate' || action === 'update') { setText(''); setRaw(''); setOpen(false) }
      setToast(action === 'restore' ? 'The earlier PRFAQ is back.' : action === 'update' ? `PRFAQ updated: everything already there is kept, new lines are linked to where they came from.${r.missing ? ` ${r.missing} ${r.missing === 1 ? 'part is' : 'parts are'} still missing.` : ''}` : action === 'reformat' ? `Reformatted: same content, in the PRFAQ format.${r.missing ? ` ${r.missing} ${r.missing === 1 ? 'part is' : 'parts are'} missing.` : ''}` : `PRFAQ drafted: ${r.kept} ${r.kept === 1 ? 'line' : 'lines'} from your words, ${r.missing} ${r.missing === 1 ? 'part' : 'parts'} missing.`)
      await reload()
    } catch (err) { setToast(err instanceof Error ? err.message : String(err)) }
    finally { setBusy('') }
  }
  const has = !!live.prfaq.trim()
  const picked = info?.docs ?? []
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  // What has come in since the PRFAQ was last written (this talk, new documents, new things said).
  const fresh = info?.fresh
  const freshDocs = (fresh?.docs ?? []).filter((d) => picked.includes(d.id))
  const freshParts = [words ? 'what you just said' : '', fresh?.talks ? `${fresh.talks} earlier ${fresh.talks === 1 ? 'talk' : 'talks'}` : '', freshDocs.length ? `${freshDocs.length} new ${freshDocs.length === 1 ? 'document' : 'documents'} (${freshDocs.map((d) => d.name).join(', ')})` : '', fresh?.said ? `${fresh.said} ${fresh.said === 1 ? 'thing' : 'things'} said in the conversation` : ''].filter(Boolean)
  const anything = words > 0 || picked.length > 0 || (info?.talks ?? 0) > 0 || live.messages.some((m) => m.role === 'user')
  return <section className={`studio-prfaq-talk${open ? ' is-open' : ''}`} aria-label="Talk it through">
    <div className="studio-prfaq-talk-head">
      <span className="capture-orb"><Mic size={15} /></span>
      <div><strong>Talk it through, then generate</strong><small>Say everything about the product for as long as you like, add documents, then press Generate PRFAQ. It only writes what you said; anything missing is marked.</small></div>
      {onWalk && <button type="button" className="text-button" onClick={onWalk}>Walk me through it instead <ArrowRight size={13} /></button>}
      {has && <button type="button" className="text-button" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Open'} <ArrowRight size={13} /></button>}
    </div>
    {has && !open && freshParts.length > 0 && <div className="studio-prfaq-fresh"><Sparkles size={14} /><span>New since the PRFAQ was written: {freshParts.join(', ')}.</span><button type="button" className="button button-primary button-small" disabled={!!busy} onClick={() => void run('update')}>{busy === 'update' ? 'Adding what’s new…' : 'Update the PRFAQ with it'}</button></div>}
    {open && <>
      <div className="studio-prfaq-talk-controls">
        <button type="button" className={`button button-small ${voice.listening ? 'button-primary studio-listening' : 'button-quiet'}`} onClick={voice.toggle} disabled={voice.working || !!busy}>{voice.listening ? <><MicOff size={14} /> Stop</> : <><Mic size={14} /> {words ? 'Keep talking' : 'Start talking'}</>}</button>
        <span className="studio-muted">{voice.working ? 'Turning what you said into clean text…' : voice.listening ? 'Listening. Press Stop when you are done.' : words ? `${words} words so far${info?.draft.updatedAt ? ` · kept ${ago(info.draft.updatedAt)}` : ''}` : 'Or type below.'}</span>
      </div>
      <textarea className="spec-editor studio-prfaq-talk-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); keep(e.target.value, raw) }} placeholder="Who is it for, what problem do they have today, what changes for them, why you, how they start…" aria-label="What you said" />
      <PrfaqDocs live={live} info={info} reload={reload} setToast={setToast} />
      {choosing ? <div className="studio-prfaq-choice" role="group" aria-label="Generate again">
        <p><strong>You already have a PRFAQ. What should Generate do?</strong></p>
        <button type="button" className="studio-prfaq-option is-suggested" disabled={!freshParts.length} onClick={() => void run('update')}><Sparkles size={15} /><span><strong>Update it with what&apos;s new <em>suggested</em></strong><small>{freshParts.length ? `Keeps everything in your PRFAQ and adds ${freshParts.join(', ')}, each new line linked to where it came from. Gaps the new material answers are filled.` : 'Nothing new since it was last written. Talk, type or add a document first.'}</small></span></button>
        <button type="button" className="studio-prfaq-option" onClick={() => void run('generate')}><Wand2 size={15} /><span><strong>Start a brand-new one</strong><small>Writes a fresh draft from everything you&apos;ve said{picked.length ? ` and ${picked.length} ${picked.length === 1 ? 'document' : 'documents'}` : ''}.</small></span></button>
        <div className="studio-prfaq-choice-foot"><small className="studio-muted">Either way the current version is kept and can be brought back.</small><button type="button" className="text-button" onClick={() => void run('reformat')}>Only tidy the format</button><button type="button" className="button button-quiet button-small" onClick={() => setChoosing(false)}><X size={13} /> Cancel</button></div>
      </div> : <div className="studio-prfaq-talk-actions">
        <button type="button" className="button button-primary" disabled={!!busy || voice.listening || voice.working || !anything} onClick={() => (has ? setChoosing(true) : void run('generate'))}>{busy === 'generate' || busy === 'update' || busy === 'reformat' ? <><Loader2 size={15} className="studio-spin" /> {busy === 'reformat' ? 'Tidying the format…' : busy === 'update' ? 'Adding what’s new…' : 'Writing it from your words…'}</> : <><Sparkles size={15} /> Generate PRFAQ</>}</button>
        {!anything && <small className="studio-muted">Say or type something first, or pick a document.</small>}
      </div>}
    </>}
    {(info?.versions.length ?? 0) > 0 && <div className="studio-prfaq-versions">
      <small className="studio-muted">{info!.last ? `${info!.last.how} ${ago(info!.last.at)}${info!.last.how === 'Generated new' ? `: ${info!.last.kept} lines from your words, ${info!.last.missing} missing${info!.last.dropped ? `, ${info!.last.dropped} left out (not in your words)` : ''}` : ''}. ` : ''}{info!.versions.length} earlier {info!.versions.length === 1 ? 'version' : 'versions'} kept.</small>
      <button type="button" className="text-button" disabled={!!busy} onClick={() => void run('restore')}><RotateCcw size={12} /> Bring back the version before</button>
    </div>}
  </section>
}

/** The PRFAQ with each line's source (click to see the words) and its Missing lines (Ask Socra on each). */
export function PrfaqDoc({ live, info, ask }: { live: Live; info: PrfaqInfo | null; ask: (gap?: string) => void }) {
  const order = useMemo(() => prfaqMarkers(live.prfaq), [live.prfaq])
  const [shown, setShown] = useState('')
  // The source opens beside its marker, kept inside the window (fixed, so the card never clips it).
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  useEffect(() => {
    if (!shown) return
    const close = () => setShown('')
    window.addEventListener('scroll', close, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', close, { capture: true })
  }, [shown])
  const cite = (key: string) => {
    const n = order.indexOf(key) + 1
    const s = key.startsWith('m:') ? null : info?.sources[key]
    const a = key.startsWith('m:') ? info?.answers[key.slice(2)] : null
    const label = s ? `From ${s.name}` : a ? `Answer from ${a.who}` : 'Source'
    return <span className="studio-cite-wrap">
      <button type="button" className={`studio-cite${shown === key ? ' is-open' : ''}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 376)), top: r.bottom + 6 }); setShown(shown === key ? '' : key) }} title={`${label}: where this line came from`} aria-label={`${label}, source ${n}`}>{n}</button>
      {shown === key && <span className="studio-cite-pop" role="dialog" style={{ left: at.left, top: at.top }}>
        <span className="eyebrow">{label}</span>
        <span className="studio-cite-quote">“{s ? s.quote : a ? a.text : 'This line’s source is no longer on record.'}”</span>
        {a && <small className="studio-muted">{ago(a.at)}</small>}
        {s?.from.startsWith('doc:') && <button type="button" className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('studio-open-doc', { detail: s.from.slice(4) }))}><FileText size={12} /> Open the document</button>}
        <button type="button" className="text-button" onClick={() => setShown('')}><X size={12} /> Close</button>
      </span>}
    </span>
  }
  const missing = (gap: string) => <div className="studio-prfaq-missing"><CircleHelp size={14} /><span><b>Missing:</b> {gap}</span><button type="button" className="button button-quiet button-small" onClick={() => ask(gap)}>Ask {ASSISTANT_NAME} <ArrowRight size={12} /></button></div>
  return <StudioMarkdown text={live.prfaq} cite={cite} missing={missing} />
}

/** Socra's questions about the PRFAQ (answer or pick right here) and its Traceability, from the record. */
export function PrfaqQuestions({ live, me, setToast }: { live: Live; me: Me; setToast: (v: string) => void }) {
  const { trace, error, reload } = useItemTrace(live, NODE)
  return <div className="studio-prfaq-questions">
    <ItemQuestions live={live} me={me} node={NODE} trace={trace} reload={reload} setToast={setToast} noun="this PRFAQ" />
    <details className="studio-prfaq-trace"><summary>Traceability: where this PRFAQ came from</summary><ItemTraceability trace={trace} error={error} /></details>
  </div>
}

/** Ask Socra about the PRFAQ, or about one Missing line. */
export function useAskPrfaq(live: Live, me: Me, setToast: (v: string) => void) {
  return useCallback(async (gap?: string) => {
    try {
      const r = await api<{ specialist: string }>(`/api/use-cases/${live.id}/prfaq`, { json: { action: 'ask', by: byOf(me), ...(gap ? { gap } : {}) } })
      setToast(`${ASSISTANT_NAME} asked the ${r.specialist.toLowerCase()} to look. The questions appear under the PRFAQ and in the conversation.`)
    } catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }, [live.id, me, setToast])
}

/** The documents that feed the PRFAQ: tick any the product already has, or add new ones (read as text). */
export function PrfaqDocs({ live, info, reload, setToast }: { live: Live; info: PrfaqInfo | null; reload: () => Promise<void>; setToast: (v: string) => void }) {
  const [adding, setAdding] = useState(false)
  const picked = info?.docs ?? []
  const docs = live.documents.filter((d) => d.status !== 'declined')
  const save = async (next: string[]) => { await api(`/api/use-cases/${live.id}/prfaq`, { method: 'PUT', json: { docs: next } }); await reload() }
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setAdding(true)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const res = await fetch(`/api/use-cases/${live.id}/documents`, { method: 'POST', body: form })
      const made = (await res.json().catch(() => [])) as { id: string }[]
      if (!res.ok) throw new Error('The upload failed')
      await save([...new Set([...picked, ...made.map((d) => d.id)])])
      setToast(`${files.length === 1 ? files[0].name : `${files.length} documents`} added. ${files.length === 1 ? 'It is' : 'They are'} read as text and used the next time the PRFAQ is written.`)
    } catch (err) { setToast(err instanceof Error ? err.message : String(err)) }
    finally { setAdding(false) }
  }
  return <div className="studio-prfaq-docs">
    <span className="eyebrow">Documents for the PRFAQ</span>
    {docs.length === 0 && <small className="studio-muted">None yet. Word, PowerPoint, PDF and others are read as text.</small>}
    {docs.map((d) => <label key={d.id} className="studio-prfaq-doc"><input type="checkbox" checked={picked.includes(d.id)} onChange={(e) => void save(e.target.checked ? [...new Set([...picked, d.id])] : picked.filter((x) => x !== d.id)).catch(() => undefined)} /><FileText size={13} /><span>{d.fileName}</span></label>)}
    <label className="button button-quiet button-small file-button"><Upload size={13} /> {adding ? 'Adding…' : 'Add a document'}<input type="file" multiple accept=".docx,.doc,.pptx,.ppt,.pdf,.txt,.md,.xlsx,.csv" onChange={upload} disabled={adding} /></label>
  </div>
}
