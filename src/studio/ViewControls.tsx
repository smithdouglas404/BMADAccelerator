'use client'
// Reading comfort. Size follows the screen it is opened on (Auto) so any machine, laptop, big monitor or phone,
// gets comfortable text; A / A+ / A++ override it, and a light option. Remembered per browser.
// Applied to <html>: data-theme, and a zoom factor set here (Auto) or by data-size (manual).
import { useEffect, useState } from 'react'

const SIZES = [['auto', 'Auto', 'Fit this screen (default)'], ['normal', 'A', 'Original size'], ['large', 'A+', 'Larger'], ['xl', 'A++', 'Largest']] as const
const MANUAL: Record<string, number> = { normal: 1, large: 1.12, xl: 1.28 }

// Width of the window in CSS pixels -> zoom: phones and small laptops stay as designed, big monitors scale up.
export function autoZoom(width: number) {
  if (width <= 1280) return 1
  if (width >= 2560) return 1.4
  return Math.round((1 + ((width - 1280) / (2560 - 1280)) * 0.4) * 100) / 100
}

function read(key: string, fallback: string) {
  try { return window.localStorage.getItem(key) || fallback } catch { return fallback }
}

export function ViewControls() {
  const [size, setSize] = useState('auto')
  const [theme, setTheme] = useState('dark')
  useEffect(() => { setSize(read('studio-size', 'auto')); setTheme(read('studio-theme', 'dark')) }, [])
  useEffect(() => {
    const root = document.documentElement
    const apply = () => { root.style.zoom = String(size === 'auto' ? autoZoom(window.innerWidth) : MANUAL[size] ?? 1) }
    apply()
    root.dataset.size = size
    root.dataset.theme = theme
    try { window.localStorage.setItem('studio-size', size); window.localStorage.setItem('studio-theme', theme) } catch { /* no storage: still works for this visit */ }
    if (size !== 'auto') return
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
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
