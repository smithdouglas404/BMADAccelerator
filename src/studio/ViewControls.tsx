'use client'
// Theme choice: Clean (shadcn Modern Minimal: white with a blue accent, the default), Paper (warm cream) or Dark
// (Modern Minimal's own dark). Remembered in this browser, applied to <html> as data-theme. Sizes are fixed
// standard sizes (no resizing). Where a page has the side menu, the switch docks at its foot ([data-theme-dock]),
// so it never covers anything; elsewhere it floats bottom-left.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

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
    const find = () => setHost(document.querySelector<HTMLElement>('[data-theme-dock]'))
    find()
    const watch = new MutationObserver(find)
    watch.observe(document.body, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  const control = (
    <div data-ui role="group" aria-label="Colour theme"
      className={cn('inline-flex gap-0.5 rounded-md border border-border bg-background p-0.5', !host && 'fixed bottom-3 left-3 z-50 shadow-md')}>
      {THEMES.map(([id, label]) => (
        <button key={id} type="button" title={`${label} colours`} aria-pressed={theme === id} onClick={() => setTheme(id)}
          className={cn('h-9 min-h-9 rounded-[5px] px-3 text-xs font-medium transition-colors', theme === id ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>{label}</button>
      ))}
    </div>
  )
  return host ? createPortal(control, host) : control
}
