'use client'
// Small building blocks every moved screen shares, so pages read the same way: a page header, sections
// stacked top to bottom, labelled fields, list rows, status badges and a copy line. Built on shadcn/ui.
import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-3xl gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-base text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** One titled block of a page. Sections stack top to bottom; each says what it is for in one line. */
export function Section({ title, description, action, children, className, id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>
      {children !== undefined && <div className="grid">{children}</div>}
    </section>
  )
}

export function SectionBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 px-5 py-4', className)}>{children}</div>
}

/** A row in a section's list: title and detail on the left, controls on the right. */
export function Row({ title, detail, badge, children, className }: { title: ReactNode; detail?: ReactNode; badge?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3.5 last:border-b-0', className)}>
      <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{title}{badge}</div>
        {detail && <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{detail}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Field({ id, label, hint, children, className }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

type Tone = 'ok' | 'warn' | 'off' | 'info' | 'suggest'
const TONES: Record<Tone, string> = {
  ok: 'border-primary/40 text-primary',
  warn: 'border-warning/40 text-warning',
  off: 'border-border text-muted-foreground',
  info: 'border-info/40 text-info',
  suggest: 'border-dashed border-suggest/50 text-suggest',
}
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge variant="outline" className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone])}>{children}</Badge>
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500) }).catch(() => undefined)
  }
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-input bg-background py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-sm" title={value}>{value}</code>
      <Button type="button" size="sm" variant="ghost" aria-label={`Copy ${label}`} onClick={copy} className="shrink-0 gap-1.5">
        {done ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}{done ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-4 text-sm text-muted-foreground">{children}</p>
}

/** A numbered step for set-up flows. */
export function Step({ n, title, done, children }: { n: number; title: ReactNode; done?: boolean; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-4 border-b border-border px-5 py-4 last:border-b-0">
      <span className={cn('grid size-8 place-items-center rounded-full text-sm font-semibold', done ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>{done ? <Check className="size-4" /> : n}</span>
      <div className="grid min-w-0 gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never')
