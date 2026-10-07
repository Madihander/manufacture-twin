import { Fragment } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { SECTIONS, type SectionId } from '@/data/plant'
import { cn } from '@/lib/utils'
import { flowCounts } from '@/sim/metrics'
import { useTwin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import { focusObject } from './focus'
import { SECTION_ICON, STATUS_CLASS, STATUS_TEXT } from './primitives'

/** Полоса потока под сценой: сколько единиц на каждом участке. */
export function FlowStrip() {
  const { snap, sectionById } = useTwin()
  const hover = useSim((s) => s.hoverSection)
  const setHover = useSim((s) => s.setHoverSection)
  const selection = useSim((s) => s.selection)
  const counts = flowCounts(snap)
  const inFlow = counts.welding + counts.painting + counts.assembly + counts.qc

  const caption = (id: SectionId): string => {
    const k = sectionById[id]
    switch (id) {
      case 'wh-in':
        return `комплектов, запас ${(k.supplyHours ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`
      case 'wh-out':
        return 'готово за смену'
      case 'qc':
        return 'на проверке'
      default:
        return k.queue > 0 ? `кузовов, очередь ${k.queue}` : id === 'assembly' ? 'автомобилей на линии' : 'кузовов в работе'
    }
  }

  return (
    <div className="flex flex-none flex-col gap-1.5 px-4 pb-4">
      <div className="flex justify-end text-xs text-muted-foreground">
        <span>
          <span className="font-mono text-foreground">{inFlow}</span> единиц в потоке
        </span>
      </div>
      <div className="flex items-stretch rounded-lg border bg-card p-1.5">
        {SECTIONS.map((s, i) => {
          const k = sectionById[s.id]
          const c = STATUS_CLASS[k.status]
          const Icon = SECTION_ICON[s.id]
          const active = (selection?.kind === 'section' && selection.id === s.id) || hover === s.id
          return (
            <Fragment key={s.id}>
              <button
                type="button"
                onClick={() => focusObject({ section: s.id })}
                onPointerEnter={() => setHover(s.id)}
                onPointerLeave={() => setHover(null)}
                className={cn('flex min-w-0 flex-1 flex-col gap-1.5 rounded-md px-3 py-2.5 text-left transition-colors', active && 'bg-muted')}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-[15px] flex-none text-brand" />
                  <span className="truncate text-xs font-medium">{s.id === 'qc' ? 'ОТК' : s.id === 'wh-out' ? 'Склад ГП' : s.id === 'wh-in' ? 'Склад комплектующих' : s.short}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[30px] leading-none font-light tracking-[-0.02em] text-primary">{counts[s.id]}</span>
                  <span className={cn('inline-flex items-center gap-[5px] text-[11px] font-medium whitespace-nowrap', c.fg)}>
                    <span className={cn('size-1.5 rounded-full', c.dot)} />
                    {STATUS_TEXT[k.status]}
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">{caption(s.id)}</span>
              </button>
              {i < SECTIONS.length - 1 && (
                <div className="flex w-4 flex-none items-center justify-center text-[#b8c2cf]">
                  <ChevronRightIcon className="size-4" />
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
