'use client'
// Settings > Update (laptop only). Talks to the small updater running on this laptop (127.0.0.1:3099), which pulls
// the newest Studio from GitHub (branch mac-studio, the version the Mac Studio runs), rebuilds and restarts it.
// Use cases, documents, memory, keys and the Claude sign-in stay as they are.
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type S = { state: 'idle' | 'running' | 'done' | 'failed'; installed: string; latest: string; scriptInstalled: string; scriptLatest: string; step: string; log: string }
const U = 'http://localhost:3099'

export function UpdatePanel() {
  const [s, setS] = useState<S | null>(null)
  const [fails, setFails] = useState(0)
  const down = fails >= 5
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  const read = useCallback(async () => {
    try {
      const r = await fetch(`${U}/status`, { cache: 'no-store' })
      setS((await r.json()) as S); setFails(0)
    } catch { setFails((n) => n + 1) }
  }, [])
  useEffect(() => {
    void read()
    timer.current = window.setInterval(() => { void read() }, 3000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [read])

  const start = async () => {
    setBusy(true)
    try { await fetch(`${U}/update`, { method: 'POST', headers: { 'X-Socra': '1' } }); await read() } catch { setFails((n) => n + 1) }
    setBusy(false)
  }

  const short = (x: string) => (x ? x.slice(0, 7) : 'not recorded')
  const studioCurrent = Boolean(s && s.installed && s.latest && s.installed === s.latest)
  const setupCurrent = Boolean(s && s.scriptInstalled && s.scriptLatest && s.scriptInstalled === s.scriptLatest)
  const current = studioCurrent && setupCurrent
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Update</p><h3>Stay on the <em>same version</em> as the Mac Studio</h3></div><RefreshCw size={16} /></div>
        <p className="studio-muted">Nothing here updates by itself. When a line below says an update is available, press Update now.</p>
        {down && <p className="studio-muted">The updater on this laptop is not answering. If you just restarted the laptop, wait a minute. Otherwise run the setup line in Terminal once more.</p>}
        {!down && !s && <p className="studio-muted">Checking for a new version…</p>}
        {s && <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>Studio (what the Mac Studio runs)</strong><small>This laptop: {short(s.installed)}. Newest: {short(s.latest)}.</small></div><span className={studioCurrent ? 'studio-ok' : 'studio-warn'}>{studioCurrent ? 'up to date' : 'update available'}</span></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Laptop fixes (setup, certificates, apps)</strong><small>This laptop: {s.scriptInstalled ? `release ${s.scriptInstalled}` : 'older release'}. Newest: {s.scriptLatest ? `release ${s.scriptLatest}` : 'not known'}.</small></div><span className={setupCurrent ? 'studio-ok' : 'studio-warn'}>{setupCurrent ? 'up to date' : 'update available'}</span></div>
          {s.state === 'running' && <div className="studio-list-row"><div className="studio-row-main"><strong>Updating…</strong><small>{s.step || 'Starting'}. The Studio goes offline for a few minutes while it restarts; this page keeps checking.</small></div></div>}
          {s.state === 'done' && <div className="studio-list-row"><div className="studio-row-main"><strong>Updated</strong><small>Reload the page to use the new version. Your use cases, memory and keys are unchanged. Each product&apos;s app needs a few minutes the first time you open it here (it downloads its packages).</small></div><span className="studio-ok">done</span></div>}
          {s.state === 'failed' && <div className="studio-list-row"><div className="studio-row-main"><strong>The update stopped</strong><small>Nothing was lost: your data and keys are untouched, and the previous version is kept. Send this to Claude: {s.step}</small><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{s.log}</pre></div><span className="studio-warn">failed</span></div>}
        </div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" className="button" disabled={busy || down || !s || s.state === 'running'} onClick={() => { void start() }}>
            {s?.state === 'running' ? 'Updating…' : current ? 'Update anyway' : 'Update now'}
          </button>
          {s?.state === 'done' && <button type="button" className="button button-quiet" onClick={() => window.location.reload()}>Reload</button>}
        </div>
      </section>
    </div>
  )
}
