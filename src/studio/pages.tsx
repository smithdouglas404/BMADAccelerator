'use client'
// The pages around the Studio: every product, a new product in a few lines (spoken or typed, plus any
// documents), and the phone capture page. Same system as the team's screens: their classes and tokens.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Mic, Plus, Settings2, Upload } from 'lucide-react'
import { api, ago } from './live'
import { useVoice } from './vibe'
import { useMe } from './flow'

type ProductRow = { id: string; name: string; statement: string; category: string; stageLabel: string; readiness: number; versions: number; thoughts: number; decisions: number; busy: boolean; updatedAt: string }

export function StudioTop({ active }: { active?: 'home' | 'new' | 'settings' | 'capture' }) {
  return (
    <header className="studio-page-top">
      <a href="/" className="brand-lockup" style={{ padding: 0, textDecoration: 'none' }}>
        <div className="brand-mark"><span /><span /><span /></div>
        <div><p className="eyebrow">agentic studio</p><p className="brand-name">backward<span>.</span></p></div>
      </a>
      <nav>
        <a href="/" className={active === 'home' ? 'is-active' : ''}>Products</a>
        <a href="/new" className={active === 'new' ? 'is-active' : ''}>New product</a>
        <a href="/capture" className={active === 'capture' ? 'is-active' : ''}>Capture</a>
        <a href="/settings" className={active === 'settings' ? 'is-active' : ''}><Settings2 size={12} /> Settings</a>
      </nav>
    </header>
  )
}

function Shell({ active, children }: { active: 'home' | 'new' | 'settings' | 'capture'; children: ReactNode }) {
  return <div className="studio-page"><StudioTop active={active} />{children}</div>
}

export function HomePage() {
  const [rows, setRows] = useState<ProductRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then(setRows).catch((e: Error) => setError(e.message))
  }, [])
  return (
    <Shell active="home">
      <div className="page-wrap">
        <div className="page-intro">
          <div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />Every product you are shaping</p><h1>Make the product <em>legible</em><br />before you make it real.</h1><p>Say what you want in a few lines. The Muse finds what kind of product it is, lays down everything the leading products of that kind have, and asks only what it can’t know.</p></div>
          <div className="intro-actions"><a className="button button-primary" href="/new" style={{ textDecoration: 'none' }}><Plus size={15} /> New product</a><span>{rows ? `${rows.length} products` : ''}</span></div>
        </div>
        {error && <p className="studio-muted">{error}</p>}
        <div className="studio-products">
          {rows?.length === 0 && <div className="empty-column">No products yet. Start one in a few lines.</div>}
          {rows?.map((r) => (
            <a key={r.id} className="studio-product" href={`/use-cases/${r.id}`}>
              <span className="eyebrow">{r.category || r.stageLabel}</span>
              <h3>{r.name}</h3>
              <p>{r.statement}</p>
              <div className="ceiling-track"><span style={{ width: `${r.readiness}%`, background: 'var(--acid)' }} /></div>
              <div className="studio-product-meta"><span>{r.readiness}% ready</span><span>{r.versions} versions</span><span>{r.thoughts} thoughts</span><span>{r.busy ? 'working…' : `updated ${ago(r.updatedAt)}`}</span></div>
            </a>
          ))}
        </div>
      </div>
    </Shell>
  )
}

export function NewProductPage() {
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [me] = useMe()
  const voice = useVoice(true, (t) => setDescription((d) => `${d}${d ? '\n' : ''}${t}`), setNote, { clean: true })
  const start = async () => {
    if (!description.trim() && !files.length) return setNote('Say or type a few lines about what you want to make, or add a document that describes it.')
    setBusy(true)
    try {
      const said = description.trim() || `Here is what I have so far: ${files.map((f) => f.name).join(', ')}.`
      const uc = await api<{ id: string }>('/api/use-cases', { json: { description: said, author: me } })
      if (files.length) {
        const form = new FormData()
        files.forEach((f) => form.append('files', f))
        form.append('kind', 'uploaded')
        form.append('opening', '1')
        await fetch(`/api/use-cases/${uc.id}/documents`, { method: 'POST', body: form })
      }
      await api('/api/use-cases', { method: 'PUT', json: { id: uc.id } })
      window.location.href = `/use-cases/${uc.id}?view=conversation`
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Shell active="new">
      <div className="page-wrap">
        <div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="status-dot" />A new product</p><h1>Say it the way<br />you’d <em>say it.</em></h1><p>A few lines is enough, and a business case or a deck helps if you have one. The Muse works out what kind of product it is, names it, lays out everything the leading products of that kind have, and asks you what only you can answer. Its specialists join in as the product takes shape.</p></div></div>
        <div className="studio-form">
          <label>What do you want to make?<textarea rows={7} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who it’s for, what it should let them do, anything you already know… or just the idea in one line." autoFocus /></label>
          <div className="studio-form-row">
            <button type="button" className={`voice-button ${voice.listening ? 'is-listening' : ''}`} onClick={voice.toggle} disabled={voice.working}><Mic size={14} /> {voice.listening ? 'Listening… press again to stop' : voice.working ? 'Writing it down…' : 'Say it instead'}</button>
            <label className="button button-quiet file-button" style={{ textTransform: 'none', letterSpacing: 0, font: 'inherit', display: 'inline-flex' }}><Upload size={14} /> Add documents<input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.json,.html" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} /></label>
            <small className="studio-muted">Decks, business cases, spreadsheets, PDFs, notes or screenshots: the Muse reads them all.</small>
          </div>
          {files.length > 0 && <div className="studio-files">{files.map((f, i) => <span key={`${f.name}-${i}`}>{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>)}</div>}
          {note && <p className="studio-muted">{note}</p>}
          <div className="studio-form-row"><button type="button" className="button button-primary" disabled={busy || voice.listening} onClick={() => void start()}>{busy ? 'Opening the room…' : 'Start with the Muse'} <ArrowRight size={15} /></button><small className="studio-muted">You can name it later; the Muse suggests a name.</small></div>
        </div>
      </div>
    </Shell>
  )
}

/** The phone page: pick a product, say or type a thought, and it lands in the ambient backlog. */
export function CapturePage() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [product, setProduct] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(0)
  const voice = useVoice(true, (t) => setText((d) => `${d}${d ? ' ' : ''}${t}`), setNote)
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('product') ?? ''
    void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then((r) => { setRows(r); setProduct(wanted && r.some((x) => x.id === wanted) ? wanted : r[0]?.id ?? '') }).catch(() => setRows([]))
  }, [])
  const send = async () => {
    const t = text.trim()
    if (!t || !product) return
    try {
      await api(`/api/use-cases/${product}/capture`, { json: { text: t, source: 'Phone / voice' } })
      setText('')
      setSaved((n) => n + 1)
      setNote('Held in the backlog, in your words. No need to make it a ticket.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Shell active="capture">
      <div className="page-wrap">
        <div className="page-intro"><div><p className="eyebrow eyebrow-with-dot"><span className="live-pulse" />Ambient capture</p><h1>Catch the thought<br /><em>before it’s a task.</em></h1><p>Phone, voice, or a half-sentence is enough. It waits in the backlog until the Muse finds its home.</p></div></div>
        <div className="studio-form">
          <label>Product<select value={product} onChange={(e) => setProduct(e.target.value)}>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>The thought<textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="I keep thinking about…" /></label>
          <div className="studio-form-row">
            <button type="button" className={`voice-button ${voice.listening ? 'is-listening' : ''}`} onClick={voice.toggle}><Mic size={14} /> {voice.listening ? 'Listening… press to stop' : 'Say it'}</button>
            <button type="button" className="button button-primary" onClick={() => void send()} disabled={!text.trim() || !product}><Plus size={14} /> Hold this thought</button>
          </div>
          {note && <p className="studio-muted">{saved > 0 && <Check size={12} className="studio-ok" />} {note}</p>}
        </div>
      </div>
    </Shell>
  )
}
