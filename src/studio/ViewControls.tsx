'use client'
// Light / dark option, remembered in this browser. Applied to <html> as data-theme. Text and button sizes are fixed
// standard sizes in the stylesheets (no automatic resizing).
// Where a page has the side menu, the button sits at the foot of the menu so it never covers a menu item;
// elsewhere it floats bottom-left.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function ViewControls() {
  const [theme, setTheme] = useState('dark')
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { try { setTheme(window.localStorage.getItem('studio-theme') || 'dark') } catch { /* keep dark */ } }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { window.localStorage.setItem('studio-theme', theme) } catch { /* no storage: still works for this visit */ }
  }, [theme])
  useEffect(() => {
    const find = () => setHost(document.querySelector<HTMLElement>('.app-shell > .sidebar'))
    find()
    const watch = new MutationObserver(find)
    watch.observe(document.body, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  const control = (
    <div className={host ? 'view-controls is-docked' : 'view-controls'}>
      <button type="button" title={theme === 'light' ? 'Dark screens' : 'Light screens'} aria-label="Switch between light and dark" aria-pressed={theme === 'light'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Dark screens' : 'Light screens'}</button>
    </div>
  )
  return host ? createPortal(control, host) : control
}
