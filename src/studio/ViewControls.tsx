'use client'
// Theme choice: Clean (white with an orange accent, the default), Paper (warm cream) or Dark. Remembered in this
// browser, applied to <html> as data-theme. Sizes are fixed standard sizes in the stylesheets (no resizing).
// Where a page has the side menu (or the top bar on Home and Settings), the switch sits inside it so it never covers anything;
// elsewhere it floats bottom-left.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const THEMES = [['clean', 'Clean'], ['paper', 'Paper'], ['dark', 'Dark']] as const
const isTheme = (t: string | null): t is (typeof THEMES)[number][0] => THEMES.some(([id]) => id === t)

export function ViewControls() {
  const [theme, setTheme] = useState('clean')
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { try { const t = window.localStorage.getItem('studio-theme'); if (isTheme(t)) setTheme(t) } catch { /* keep clean */ } }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { window.localStorage.setItem('studio-theme', theme) } catch { /* no storage: still works for this visit */ }
  }, [theme])
  useEffect(() => {
    const find = () => setHost(document.querySelector<HTMLElement>('.app-shell > .sidebar, .studio-page-top'))
    find()
    const watch = new MutationObserver(find)
    watch.observe(document.body, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  const control = (
    <div className={host ? 'view-controls is-docked' : 'view-controls'} role="group" aria-label="Colour theme">
      {THEMES.map(([id, label]) => (
        <button key={id} type="button" title={`${label} colours`} aria-pressed={theme === id} onClick={() => setTheme(id)}>{label}</button>
      ))}
    </div>
  )
  return host ? createPortal(control, host) : control
}
