'use client'
// The shared way every screen shows text the team or an agent wrote: paragraphs with spacing, real bullet and numbered
// lists, headings, key/value rows, JSON as rows or a code block, and a "Show more" that clamps by whole lines instead of
// cutting a word. Styles: .rich-* in readability.css. No content of its own.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { parseRich } from '@/lib/studio/richText'

export function Rich({ text, lines = 0, className = '' }: { text: string | null | undefined; lines?: number; className?: string }) {
  const blocks = parseRich(text)
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !lines || open) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text, lines, open])
  if (!blocks.length) return null
  const body: ReactNode[] = blocks.map((b, i) => {
    if (b.kind === 'heading') return <h4 key={i} className="rich-heading">{b.text}</h4>
    if (b.kind === 'paragraph') return <p key={i}>{b.text}</p>
    if (b.kind === 'code') return <pre key={i} className="rich-code">{b.text}</pre>
    if (b.kind === 'pairs') return <dl key={i} className="rich-pairs">{b.rows.map((r, j) => <div key={j}><dt>{r.key}</dt><dd>{r.value}</dd></div>)}</dl>
    const List = b.ordered ? 'ol' : 'ul'
    return <List key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</List>
  })
  const clamped = lines > 0 && !open
  return <div className={`rich ${className}`}>
    <div ref={ref} className={clamped ? 'rich-clamp' : undefined} style={clamped ? { ['--rich-lines' as string]: lines } : undefined}>{body}</div>
    {lines > 0 && (overflows || open) && <button type="button" className="text-button rich-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show more'}</button>}
  </div>
}
