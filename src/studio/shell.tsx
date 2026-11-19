'use client'
// One app shell for every Studio screen (Doug, Nov 16: option B, shadcn/ui + Animate UI).
// Inside a use case the menu shows its four groups; on Home, New, Capture and Settings it shows the
// Studio-wide places. Same sidebar, same brand, same way back everywhere.
import { useEffect, useState, type ReactNode } from 'react'
import {
  Bot, Check, ChevronDown, ChevronsUpDown, CircleHelp, Code2, Database, FileText, FolderGit2, Home, Layers3, Lightbulb, Mic, MousePointer2,
  Network, Pencil, Play, Plus, Settings2, Target, Waves, Workflow, KanbanSquare, GitBranch,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
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
import { menuFor, PersonaSwitch, PERSONAS, type Me, type NavItem, type StudioView } from './flow'

const ICONS: Record<string, typeof Waves> = {
  overview: Layers3, conversation: Waves, product: FileText, spec: FileText, validation: CircleHelp, evidence: Database,
  truth: Network, storymap: Workflow, readiness: Target, review: MousePointer2, pilot: KanbanSquare, brief: Play, trd: Code2,
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
  /** Red counts beside menu items: what is waiting on a person, and where. */
  flags?: Partial<Record<StudioView, number>>
  /** Who is at this browser: the persona orders the menu. */
  me: Me
  onPersona: (p: (typeof PERSONAS)[number]) => void
  thoughts?: number
  buildMoves?: number
  onCapture?: () => void
}

function Brand() {
  return (
    <a href="/" className="flex items-center gap-3 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" title="All use cases">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-lg font-bold text-primary-foreground">{ASSISTANT_NAME.slice(0, 1)}</span>
      <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <span className="text-lg font-semibold">{ASSISTANT_NAME}<span className="text-primary">.</span></span>
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

function NavButton({ item, uc }: { item: NavItem; uc: ShellUseCase }) {
  const Icon = ICONS[item.id] ?? FileText
  const n = uc.flags?.[item.id] ?? 0
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={uc.active === item.id}
        onClick={() => uc.onNavigate(item.id)}
        tooltip={{ hidden: false, className: "max-w-72", children: <span className="grid max-w-64 gap-1"><strong>{item.label}</strong><span>{item.tip}</span></span> }}
        aria-label={`${item.label}: ${item.tip}`}
        className="h-auto min-h-9 py-1.5 text-sm data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--primary)]"
      >
        <Icon className="size-[18px]" />
        <span className="grid min-w-0 leading-tight"><span className="truncate">{item.label}</span><span className="truncate text-xs font-normal text-muted-foreground">{item.hint}</span></span>
      </SidebarMenuButton>
      {n > 0 && <SidebarMenuBadge title={`${n} ${n === 1 ? 'thing needs' : 'things need'} you here`} className="top-1/2 -translate-y-1/2 rounded-full bg-destructive px-1.5 text-xs font-semibold text-white peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white">{n}</SidebarMenuBadge>}
    </SidebarMenuItem>
  )
}

function UseCaseNav({ uc }: { uc: ShellUseCase }) {
  const menu = menuFor(uc.me.role)
  const [moreOpen, setMoreOpen] = useState(false)
  const showMore = moreOpen || menu.more.some((i) => i.id === uc.active)
  return (
    <>
      <div className="px-2 pt-1 pb-1"><PersonaSwitch me={uc.me} onPick={uc.onPersona} /></div>
      {menu.groups.map((group) => (
        <SidebarGroup key={group.title} className="py-1">
          <SidebarGroupLabel className="h-auto flex-col items-start gap-0 py-1 text-xs font-semibold text-muted-foreground"><span>{group.title}</span><span className="font-normal">{group.about}</span></SidebarGroupLabel>
          <SidebarMenu>{group.items.map((item) => <NavButton key={item.id} item={item} uc={uc} />)}</SidebarMenu>
        </SidebarGroup>
      ))}
      {menu.more.length > 0 && (
        <SidebarGroup className="py-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="h-9 text-sm text-muted-foreground" aria-expanded={showMore} onClick={() => setMoreOpen(!moreOpen)} tooltip={`More tools (${menu.more.length})`}>
                <ChevronDown className={cn('size-[18px] transition-transform duration-200', showMore && 'rotate-180')} />
                <span className="flex-1">More tools</span><span className="text-xs">{menu.more.length}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <AnimatePresence initial={false}>
            {showMore && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="overflow-hidden">
                <SidebarMenu>{menu.more.map((item) => <NavButton key={item.id} item={item} uc={uc} />)}</SidebarMenu>
              </motion.div>
            )}
          </AnimatePresence>
        </SidebarGroup>
      )}
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
        <div data-theme-dock className="pt-1 group-data-[collapsible=icon]:hidden" />
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
