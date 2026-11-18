'use client'
// Text size (A / A+ / A++) and a light option, remembered in this browser. Applied to <html> as data-size / data-theme.
import { useEffect, useState } from 'react'

const SIZES = [['normal', 'A', 'Normal text'], ['large', 'A+', 'Larger text'], ['xl', 'A++', 'Largest text']] as const

function read(key: string, fallback: string) {
  try { return window.localStorage.getItem(key) || fallback } catch { return fallback }
}

export function ViewControls() {
  const [size, setSize] = useState('normal')
  const [theme, setTheme] = useState('dark')
  useEffect(() => { setSize(read('studio-size', 'normal')); setTheme(read('studio-theme', 'dark')) }, [])
  useEffect(() => {
    document.documentElement.dataset.size = size
    document.documentElement.dataset.theme = theme
    try { window.localStorage.setItem('studio-size', size); window.localStorage.setItem('studio-theme', theme) } catch { /* no storage: still works for this visit */ }
  }, [size, theme])
  return (
    <div className="view-controls" role="group" aria-label="Reading comfort">
      {SIZES.map(([id, label, title]) => (
        <button key={id} type="button" title={title} aria-label={title} aria-pressed={size === id} onClick={() => setSize(id)}>{label}</button>
      ))}
      <button type="button" title={theme === 'light' ? 'Dark screens' : 'Light screens'} aria-label="Switch between light and dark" aria-pressed={theme === 'light'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Dark' : 'Light'}</button>
    </div>
  )
}
