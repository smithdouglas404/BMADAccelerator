'use client'
// Edit in place: any text a person owns on a screen (PRFAQ, headline, evidence, a decision, a spec section)
// shows a visible Edit button. Saving writes the real record through its API, which logs who changed what
// and hands the change to Socra. Ctrl/Cmd+Enter saves, Escape cancels. On shadcn/ui.
import { useEffect, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function EditButton({ onClick, label = 'Edit', title }: { onClick: () => void; label?: string; title?: string }) {
  return <Button type="button" size="sm" variant="outline" onClick={onClick} title={title ?? label} className="shrink-0"><Pencil className="size-4" /> {label}</Button>
}

export function EditableText({ value, onSave, children, multiline = false, rows = 4, label = 'Edit', placeholder = '', className = '', inline = false }: {
  value: string
  onSave: (next: string) => Promise<unknown> | void
  children: React.ReactNode
  multiline?: boolean
  rows?: number
  label?: string
  placeholder?: string
  className?: string
  /** Put the Edit button beside the text instead of under it (headlines, short lines). */
  inline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  const save = async () => {
    if (draft.trim() === value.trim()) { setEditing(false); return }
    setSaving(true)
    try { await onSave(draft.trim()); setEditing(false) } finally { setSaving(false) }
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !multiline)) { e.preventDefault(); void save() }
  }
  if (!editing) {
    return (
      <div className={cn('group/edit min-w-0', inline ? 'flex flex-wrap items-start gap-x-3 gap-y-2' : 'grid gap-2', className)}>
        <div className={cn('min-w-0', inline && 'flex-1 basis-48')}>{children}</div>
        <div><EditButton label={label} onClick={() => { setDraft(value); setEditing(true) }} /></div>
      </div>
    )
  }
  return (
    <div className={cn('grid gap-2 rounded-md border border-primary/40 bg-accent/30 p-3 animate-in fade-in duration-150', className)}>
      {multiline
        ? <Textarea value={draft} rows={rows} placeholder={placeholder} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} />
        : <Input value={draft} placeholder={placeholder} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}><Check className="size-4" /> {saving ? 'Saving…' : 'Save'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}><X className="size-4" /> Cancel</Button>
        <span className="text-xs text-muted-foreground">{multiline ? 'Ctrl or ⌘ + Enter saves · Esc cancels' : 'Enter saves · Esc cancels'} · kept with your name, and Socra carries it through</span>
      </div>
    </div>
  )
}
