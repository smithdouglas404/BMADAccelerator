'use client'
// One look for every Save button: it says Saving…, then Saved with the time, and if the server refuses it says so
// in red right beside the button and stays put so nothing is lost. A toast alone can vanish or sit behind a panel.
import { useCallback, useState, type ReactNode } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'

export type SaveState = { phase: 'idle' | 'saving' | 'saved' | 'error'; at?: Date; message?: string }

export const clockTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** run(fn) resolves true when fn worked. It throws nothing: a failure is kept in `state` for the button to show. */
export function useSaveState() {
  const [state, setState] = useState<SaveState>({ phase: 'idle' })
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setState({ phase: 'saving' })
    try { await fn(); setState({ phase: 'saved', at: new Date() }); return true }
    catch (e) { setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) }); return false }
  }, [])
  const reset = useCallback(() => setState({ phase: 'idle' }), [])
  return { state, run, reset }
}

export function SaveButton({ state, onClick, disabled = false, label = 'Save changes', savedLabel = 'Saved', className = 'button button-primary button-small', children }: {
  state: SaveState
  onClick: () => void
  /** True when there is nothing new to save (or the form is not ready). A saved button stays showing Saved until the next edit. */
  disabled?: boolean
  label?: string
  savedLabel?: string
  className?: string
  children?: ReactNode
}) {
  const saving = state.phase === 'saving'
  // Saved shows only while nothing new has been typed; as soon as there is something to save it goes back to the label.
  const saved = state.phase === 'saved' && disabled
  const text = saving ? 'Saving…' : saved ? `${savedLabel}${state.at ? ` · ${clockTime(state.at)}` : ''}` : state.phase === 'error' ? 'Try again' : label
  return <>
    <button className={`${className}${saved ? ' is-saved' : ''}`} type="button" disabled={disabled || saving} aria-live="polite" onClick={onClick}>
      {saving ? <Loader2 size={13} className="studio-spin" /> : <Check size={13} />} {text}
    </button>
    {children}
    {state.phase === 'error' && <span className="studio-save-error" role="alert"><AlertCircle size={13} /> Not saved: {state.message || 'something went wrong'}. Your edits are still here.</span>}
  </>
}
