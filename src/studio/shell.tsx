'use client'
// One app shell for every Studio screen (Doug, Nov 16: option B, shadcn/ui + Animate UI).
// Inside a use case the menu shows its four groups; on Home, New, Capture and Settings it shows the
// Studio-wide places. Same sidebar, same brand, same way back everywhere.
import { useEffect, useState, type ReactNode } from 'react'
import {
  Bot, Check, ChevronsUpDown, CircleHelp, Database, FileText, FolderGit2, Home, Layers3, Lightbulb, Mic, MousePointer2,
  Network, PackageOpen, Pencil, Plus, Settings2, Target, Waves, Workflow, Zap, GitBranch,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ASSISTANT_NAME } from '@/lib/brand'
import { api } from './live'
import { NAV_GROUPS, type StudioView } from './flow'

const ICONS: Record<string, typeof Waves> = {
  overview: Layers3, conversation: Waves, product: FileText, spec: FileText, validation: CircleHelp, evidence: Database,
  truth: Network, storymap: Workflow, readiness: Target, review: MousePointer2, pilot: Zap, brief: PackageOpen,
  agents: Bot, connections: FolderGit2,
}

export type ShellPlace = 'home' | 'new' | 'capture' | 'settings'

type ProductRow = { id: string; name: string; stageLabel: string; readiness: number }

export type ShellUseCase = {
  id: string
  name: string
  stageLabel: string
  active: StudioView
  onNavigate: (view: StudioView) => void
  /** Small counts shown beside menu items, e.g. waiting decisions on Socra. */
  badges?: Partial<Record<StudioView, number>>
  thoughts?: number
  buildMoves?: number
  onCapture?: () => void
}

function Brand() {
  return (
    <a href="/" className="flex items-center gap-3 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" title="All use cases">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-lg font-bold text-primary-foreground">{ASSISTANT_NAME.slice(0, 1)}</span>
      <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <span className="text-lg font-semibold">{ASSISTANT_NAME}</span>
        <span className="truncate text-xs text-muted-foreground">Working Backwards Studio</span>
      </span>
    </a>
  )
}

function UseCaseSwitcher({ uc }: { uc: ShellUseCase }) {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(uc.name)
  useEffect(() => setName(uc.name), [uc.name])
  const load = (open: boolean) => { if (open) void api<ProductRow[]>('/api/use-cases', { cache: 'no-store' }).then(setRows).catch(() => setRows([])) }
  const rename = () => {
    const n = name.trim()
    if (n && n !== uc.name) void api(`/api/use-cases/${uc.id}`, { method: 'PATCH', json: { name: n } }).catch(() => undefined)
    setRenaming(false)
  }
  return (
    <>
      <DropdownMenu onOpenChange={load}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg" className="border border-sidebar-border bg-card data-[state=open]:bg-sidebar-accent" tooltip={uc.name}>
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-sm font-bold text-primary">{uc.name.slice(0, 1).toUpperCase()}</span>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{uc.name}</span>
              <span className="truncate text-xs text-muted-foreground">{uc.stageLabel}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start" side="bottom">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Use cases</DropdownMenuLabel>
          {rows.map((r) => (
            <DropdownMenuItem key={r.id} asChild className="gap-3 py-2">
              <a href={`/use-cases/${r.id}`}>
                <span className="grid size-7 place-items-center rounded-md bg-muted text-sm font-semibold">{r.name.slice(0, 1).toUpperCase()}</span>
                <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-sm">{r.name}</span><span className="truncate text-xs text-muted-foreground">{r.stageLabel} · {r.readiness}%</span></span>
                {r.id === uc.id && <Check className="size-4 text-primary" />}
              </a>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setRenaming(true)} className="gap-3 py-2"><Pencil className="size-4" /> Rename this use case</DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-3 py-2"><a href="/new"><Plus className="size-4" /> New use case</a></DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-3 py-2"><a href="/"><Home className="size-4" /> All use cases</a></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent data-ui className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-xl font-semibold">Rename this use case</DialogTitle><DialogDescription>Everyone working on it sees the new name.</DialogDescription></DialogHeader>
          <Input id="rename-use-case" aria-label="Use case name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename() }} className="h-10 text-base" />
          <DialogFooter><Button variant="outline" onClick={() => setRenaming(false)}>Cancel</Button><Button onClick={rename}>Save name</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function UseCaseNav({ uc }: { uc: ShellUseCase }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.title} className="py-1">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">{group.title}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => {
              const Icon = ICONS[item.id] ?? FileText
              const n = uc.badges?.[item.id] ?? 0
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={uc.active === item.id}
                    onClick={() => uc.onNavigate(item.id)}
                    tooltip={`${item.label}: ${item.hint}`}
                    title={item.hint}
                    className="h-9 text-sm data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--primary)]"
                  >
                    <Icon className="size-[18px]" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {n > 0 && <SidebarMenuBadge className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-[active=true]/menu-button:text-primary-foreground">{n}</SidebarMenuBadge>}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
      {(uc.thoughts !== undefined || uc.buildMoves !== undefined) && (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">Held in the background</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton className="h-9 text-sm" tooltip="Thoughts waiting for a home" onClick={() => uc.onNavigate('product')}><Lightbulb className="size-[18px] text-warning" /><span>{uc.thoughts ?? 0} thoughts waiting</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton className="h-9 text-sm" tooltip="Build moves on the board" onClick={() => uc.onNavigate('pilot')}><GitBranch className="size-[18px] text-suggest" /><span>{uc.buildMoves ?? 0} build moves</span></SidebarMenuButton></SidebarMenuItem>
            {uc.onCapture && <SidebarMenuItem><SidebarMenuButton className="h-9 text-sm" tooltip="Capture a thought" onClick={uc.onCapture}><Mic className="size-[18px]" /><span>Capture a thought</span></SidebarMenuButton></SidebarMenuItem>}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  )
}

function PlacesNav({ place }: { place?: ShellPlace }) {
  const items: { id: ShellPlace; href: string; label: string; icon: typeof Home }[] = [
    { id: 'home', href: '/', label: 'All use cases', icon: Home },
    { id: 'new', href: '/new', label: 'New use case', icon: Plus },
    { id: 'capture', href: '/capture', label: 'Capture a thought', icon: Mic },
  ]
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((it) => (
          <SidebarMenuItem key={it.id}>
            <SidebarMenuButton asChild isActive={place === it.id} tooltip={it.label} className="h-9 text-sm data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--primary)]">
              <a href={it.href}><it.icon className="size-[18px]" /><span>{it.label}</span></a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export function StudioSidebar({ useCase, place, footer }: { useCase?: ShellUseCase; place?: ShellPlace; footer?: ReactNode }) {
  return (
    <Sidebar collapsible="icon" data-ui className="border-sidebar-border">
      <SidebarHeader className="gap-3 p-3">
        <Brand />
        {useCase && <SidebarMenu><SidebarMenuItem><UseCaseSwitcher uc={useCase} /></SidebarMenuItem></SidebarMenu>}
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {useCase ? <UseCaseNav uc={useCase} /> : <PlacesNav place={place} />}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          {useCase && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="All use cases" className="h-9 text-sm"><a href="/"><Home className="size-[18px]" /><span>All use cases</span></a></SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={place === 'settings'} tooltip="Settings" className="h-9 text-sm data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--primary)]"><a href="/settings"><Settings2 className="size-[18px]" /><span>Settings</span></a></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {footer}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** Top bar inside the inset: collapse button, where you are, and actions on the right. */
export function StudioTopBar({ crumbs, actions }: { crumbs: ReactNode; actions?: ReactNode }) {
  return (
    <header data-ui className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1 size-8" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">{crumbs}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

/** The whole frame: sidebar on the left, the screen on the right. */
export function StudioFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <SidebarProvider className="studio-frame min-h-svh bg-background text-foreground">
      {sidebar}
      <SidebarInset className="min-w-0 bg-background">{children}</SidebarInset>
    </SidebarProvider>
  )
}
