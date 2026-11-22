'use client'
// Edit in place: any text a person owns on a screen (PRFAQ, headline, evidence, a decision, a spec section)
// shows a visible Edit button. Saving writes the real record through its API, which logs who changed what
// and hands the change to Socra. Ctrl/Cmd+Enter saves, Escape cancels.
import { useEffect, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { SaveButton, clockTime, useSaveState } from './savestate'

export function EditButton({ onClick, label = 'Edit', title }: { onClick: () => void; label?: string; title?: string }) {
  return <button className="button button-quiet button-small studio-edit-button" type="button" onClick={onClick} title={title ?? label}><Pencil size={13} /> {label}</button>
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
  const { state, run } = useSaveState()
  const saving = state.phase === 'saving'
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  const save = async () => {
    if (draft.trim() === value.trim()) { setEditing(false); return }
    // A failed save keeps the editor open with the error beside the button, so nothing typed is lost.
    if (await run(async () => { await onSave(draft.trim()) })) setEditing(false)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !multiline)) { e.preventDefault(); void save() }
  }
  if (!editing) return <div className={`studio-editable${inline ? ' is-inline' : ''} ${className}`}>{children}<EditButton label={label} onClick={() => { setDraft(value); setEditing(true) }} />{state.phase === 'saved' && state.at && <span className="studio-saved-chip" role="status"><Check size={12} /> Saved · {clockTime(state.at)}</span>}</div>
  return <div className={`studio-editable is-editing ${className}`}>
    {multiline
      ? <textarea className="spec-editor studio-edit-field" value={draft} rows={rows} placeholder={placeholder} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} />
      : <input className="studio-input studio-edit-field" value={draft} placeholder={placeholder} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} />}
    <div className="studio-edit-actions">
      <SaveButton state={state} label="Save" onClick={() => void save()} />
      <button className="button button-quiet button-small" type="button" onClick={() => setEditing(false)} disabled={saving}><X size={13} /> Cancel</button>
      <small className="studio-muted">{multiline ? 'Ctrl or ⌘ + Enter saves · Esc cancels' : 'Enter saves · Esc cancels'} · kept with your name, and Socra carries it through</small>
    </div>
  </div>
}
