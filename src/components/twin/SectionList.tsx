import { useMemo, useState } from 'react'
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SearchIcon } from 'lucide-react'
import { Command as CommandPrimitive } from 'cmdk'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { EQUIPMENT, SECTIONS, SECTION_BY_ID } from '@/data/plant'
import { cn } from '@/lib/utils'
import { useTwin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import { focusObject } from './focus'
import { SECTION_ICON, STATUS_CLASS, STATUS_TEXT } from './primitives'

export function SectionList() {
  const [collapsed, setCollapsed] = useState(false)
  const { sectionById } = useTwin()
  const selection = useSim((s) => s.selection)
  const hover = useSim((s) => s.hoverSection)
  const setHover = useSim((s) => s.setHoverSection)
  const selectedSection =
    selection?.kind === 'section' ? selection.id : selection?.kind === 'equipment' ? EQUIPMENT.find((e) => e.id === selection.id)?.section : null

  if (collapsed) {
    return (
      <aside className="flex w-14 flex-none flex-col items-center gap-1 border-r bg-card py-3">
        <button type="button" title="Развернуть панель" onClick={() => setCollapsed(false)} className="mb-2 flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <PanelLeftOpenIcon className="size-4" />
        </button>
        {SECTIONS.map((s) => {
          const k = sectionById[s.id]
          const Icon = SECTION_ICON[s.id]
          return (
            <button
              key={s.id}
              type="button"
              title={s.name}
              onClick={() => focusObject({ section: s.id })}
              className={cn('relative flex size-9 items-center justify-center rounded-md border text-brand hover:bg-muted', selectedSection === s.id && 'border-brand bg-brand-soft')}
            >
              <Icon className="size-[15px]" />
              <span className={cn('absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-card', STATUS_CLASS[k.status].dot)} />
            </button>
          )
        })}
      </aside>
    )
  }

  return (
    <aside className="flex w-60 flex-none flex-col border-r bg-card">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <span className="overline">Участки</span>
          <button type="button" title="Свернуть панель" onClick={() => setCollapsed(true)} className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <PanelLeftCloseIcon className="size-4" />
          </button>
        </div>
        <ObjectSearch />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto border-t">
        {SECTIONS.map((s) => {
          const k = sectionById[s.id]
          const c = STATUS_CLASS[k.status]
          const Icon = SECTION_ICON[s.id]
          const active = selectedSection === s.id
          const inc = k.incidents.length
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => focusObject({ section: s.id })}
              onPointerEnter={() => setHover(s.id)}
              onPointerLeave={() => setHover(null)}
              className={cn(
                'grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 border-b px-4 py-3 text-left transition-colors',
                active ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]' : hover === s.id ? 'bg-muted' : '',
              )}
            >
              <span className="flex size-7 items-center justify-center rounded-[7px] border bg-card text-brand">
                <Icon className="size-[15px]" />
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[13px] font-medium">{s.name}</span>
                <span className={cn('flex items-center gap-1.5 text-xs', c.fg)}>
                  <span className={cn('size-1.5 flex-none rounded-full', c.dot)} />
                  {STATUS_TEXT[k.status]}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span
                  className={cn(
                    'flex h-[18px] min-w-5 items-center justify-center rounded-full border px-1.5 font-mono text-[11px]',
                    inc > 0 ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {inc}
                </span>
                <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{k.metric}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-2 border-t px-4 py-3.5">
        <span className="overline text-[11px]">Статусы</span>
        <div className="flex flex-wrap gap-3.5 text-xs">
          {(['ok', 'warn', 'alarm'] as const).map((st) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className={cn('size-[7px] rounded-full', STATUS_CLASS[st].dot)} />
              {STATUS_TEXT[st]}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-white">2</span>
          активные инциденты
        </span>
      </div>
    </aside>
  )
}

/** Поиск по участкам и оборудованию: «ABB-01», «окраска». */
function ObjectSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const groups = useMemo(
    () => [
      { heading: 'Участки', items: SECTIONS.map((s) => ({ value: `${s.name} ${s.code}`, label: s.name, hint: s.code, go: () => focusObject({ section: s.id }) })) },
      {
        heading: 'Оборудование',
        items: EQUIPMENT.map((e) => ({ value: `${e.id} ${e.name}`, label: e.id, hint: SECTION_BY_ID[e.section].short, go: () => focusObject({ equipmentId: e.id }) })),
      },
    ],
    [],
  )
  return (
    <Command className="h-auto overflow-visible rounded-none bg-transparent p-0">
      <Popover open={open && query.length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="flex h-9 items-center gap-2 rounded-md border bg-card px-2.5 focus-within:border-ring hover:border-switch-off">
            <SearchIcon className="size-[15px] flex-none text-muted-foreground" />
            <CommandPrimitive.Input
              value={query}
              onValueChange={(v) => {
                setQuery(v)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="Участок или оборудование, напр. ABB-01"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()} className="w-[260px] p-1 shadow-popover">
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">Ничего не найдено</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.items.map((it) => (
                  <CommandItem
                    key={it.value}
                    value={it.value}
                    onSelect={() => {
                      it.go()
                      setQuery('')
                      setOpen(false)
                    }}
                    className="justify-between text-[13px]"
                  >
                    <span className={g.heading === 'Оборудование' ? 'font-mono' : ''}>{it.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{it.hint}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
}
