// Журнал заявок ТО: история службы механика + заявки, созданные из двойника (карточка оборудования, ИИ).
import { useMemo, useState } from 'react'
import { CheckIcon, ClipboardListIcon, FileSpreadsheetIcon, LoaderCircleIcon, MapPinIcon, PlayIcon, SearchIcon, SparklesIcon, Trash2Icon, XIcon } from 'lucide-react'
import { notify } from '@/components/notify'
import { focusObject } from '@/components/twin/focus'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EQUIPMENT_BY_ID, type MaintenancePriority, SECTION_BY_ID } from '@/data/plant'
import { formatDate, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { isOpen, type MaintenanceTicket, type TicketStatus, ticketSource, ticketWindow, useMaintenance } from '@/store/maintenance'
import { useUi } from '@/store/ui'
import { EmptyState } from './States'
import { useJournal } from './useJournal'

const STATUS_STYLE: Record<TicketStatus, string> = {
  Новая: 'bg-brand-soft text-primary',
  'В работе': 'bg-warn-soft text-warn-fg',
  Выполнена: 'bg-ok-soft text-ok-fg',
  Отменена: 'bg-muted text-muted-foreground',
}
const STATUS_DOT: Record<TicketStatus, string> = { Новая: 'bg-brand', 'В работе': 'bg-warn', Выполнена: 'bg-ok', Отменена: 'bg-chart-plan' }
const PRIORITY_DOT: Record<MaintenancePriority, string> = { Низкий: 'bg-chart-plan', Средний: 'bg-warn', Высокий: 'bg-alarm' }

type Filter = 'open' | 'all' | 'done'

export function MaintenanceLog() {
  const open = useUi((s) => s.maintenanceLogOpen)
  const setOpen = useUi((s) => s.setMaintenanceLogOpen)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 p-0 data-[side=right]:w-[600px] data-[side=right]:sm:max-w-[600px]">
        {open && <Journal onClose={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  )
}

function Journal({ onClose }: { onClose: () => void }) {
  const tickets = useJournal()
  const created = useMaintenance((s) => s.tickets)
  const clearCreated = useMaintenance((s) => s.clearCreated)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [exporting, setExporting] = useState(false)

  const counts = {
    open: tickets.filter(isOpen).length,
    all: tickets.length,
    done: tickets.filter((t) => t.status === 'Выполнена').length,
  }
  const q = query.trim().toLowerCase()
  const shown = tickets.filter((t) => {
    if (filter === 'open' && !isOpen(t)) return false
    if (filter === 'done' && t.status !== 'Выполнена') return false
    if (!q) return true
    const eq = EQUIPMENT_BY_ID[t.equipmentId]
    return [t.id, t.equipmentId, eq?.name, t.comment, t.crew, t.workType].some((s) => s?.toLowerCase().includes(q))
  })
  // Группы по дате работ — от новых к старым.
  const groups = useMemo(() => {
    const map = new Map<string, MaintenanceTicket[]>()
    for (const t of shown) {
      const key = formatDate(t.date)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return [...map.entries()]
  }, [shown])

  const exportXlsx = async () => {
    setExporting(true)
    try {
      await (await import('./maintenanceExcel')).exportMaintenance(shown)
    } catch (e) {
      console.error(e)
      notify({ tone: 'alarm', title: 'Не удалось выгрузить журнал', description: String(e instanceof Error ? e.message : e) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="flex items-start justify-between border-b px-6 pt-5 pb-4">
        <div className="flex flex-col gap-1">
          <SheetTitle className="text-xl font-medium">Журнал заявок ТО</SheetTitle>
          <SheetDescription className="text-[13px]">
            Служба главного механика · <span className="font-mono text-foreground">{counts.open}</span> {plural(counts.open, ['открытая', 'открытые', 'открытых'])} из{' '}
            <span className="font-mono text-foreground">{counts.all}</span>
          </SheetDescription>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" title="Закрыть" className="text-muted-foreground">
            <XIcon />
          </Button>
        </SheetClose>
      </div>

      <div className="flex items-center gap-2.5 border-b px-6 py-3">
        <div className="flex flex-none overflow-hidden rounded-md border">
          {(
            [
              ['all', 'Все'],
              ['open', 'Открытые'],
              ['done', 'Выполнены'],
            ] as [Filter, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={cn('flex h-[34px] items-center gap-1.5 border-r px-3 text-[13px] font-medium last:border-r-0', filter === v ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted')}
            >
              {label}
              <span className="font-mono text-[11px] opacity-70">{counts[v]}</span>
            </button>
          ))}
        </div>
        <label className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 focus-within:border-ring">
          <SearchIcon className="size-[15px] flex-none text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: номер, оборудование" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
        </label>
        <Button variant="secondary" size="sm" className="h-[34px] text-[13px]" onClick={exportXlsx} disabled={exporting || shown.length === 0} title="Выгрузить показанные заявки в Excel">
          {exporting ? <LoaderCircleIcon className="animate-spin" /> : <FileSpreadsheetIcon className="text-ok" />}
          Excel
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
        {groups.length === 0 ? (
          <EmptyState icon={ClipboardListIcon} text={q ? 'Ничего не найдено' : filter === 'open' ? 'Открытых заявок нет' : 'Заявок нет'} />
        ) : (
          groups.map(([date, list]) => (
            <section key={date} className="flex flex-col gap-2 px-6 pt-4 last:pb-5">
              <span className="overline flex items-center gap-2">
                <span className="font-mono">{date}</span>
                {date === '15.10.2026' && <span className="normal-case">· сегодня</span>}
              </span>
              {list.map((t) => (
                <TicketCard key={t.id} ticket={t} onShow={onClose} />
              ))}
            </section>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
        <span className="text-xs text-muted-foreground">Новая заявка — из карточки оборудования или рекомендации ИИ</span>
        {created.length > 0 &&
          (confirmClear ? (
            <span className="flex items-center gap-2">
              <span className="text-xs">Удалить {created.length} {plural(created.length, ['созданную', 'созданные', 'созданных'])}?</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                Нет
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-alarm-fg"
                onClick={() => {
                  clearCreated()
                  setConfirmClear(false)
                }}
              >
                Удалить
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmClear(true)} title="Журнал вернётся к истории завода">
              <Trash2Icon />
              Очистить созданные
            </Button>
          ))}
      </div>
    </>
  )
}

function TicketCard({ ticket: t, onShow }: { ticket: MaintenanceTicket; onShow: () => void }) {
  const setStatus = useMaintenance((s) => s.setStatus)
  const eq = EQUIPMENT_BY_ID[t.equipmentId]
  const section = eq ? SECTION_BY_ID[eq.section] : null
  const editable = !t.history && isOpen(t)
  const change = (status: TicketStatus) => {
    setStatus(t.id, status)
    notify({ tone: status === 'Выполнена' ? 'ok' : 'info', title: <><span className="font-mono">{t.id}</span> · {status.toLowerCase()}</>, duration: 3000 })
  }
  return (
    <article className={cn('flex flex-col gap-2 rounded-lg border bg-card px-4 py-3', !isOpen(t) && 'bg-card/70')}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-medium">{t.id}</span>
        <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', STATUS_STYLE[t.status])}>
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[t.status])} />
          {t.status}
        </span>
        {t.fromAi && (
          <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-brand-soft px-1.5 text-[11px] font-medium text-primary">
            <SparklesIcon className="size-[11px] text-brand" strokeWidth={2.25} />
            по рекомендации ИИ
          </span>
        )}
        {t.history && <span className={cn('rounded-sm px-1.5 text-[11px]', t.real ? 'bg-brand-soft text-primary' : 'bg-muted text-muted-foreground')}>{ticketSource(t)}</span>}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {ticketWindow(t)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">
          <button type="button" className="font-mono text-[13px] text-brand-strong hover:underline" title="Показать на карте" onClick={() => {
              focusObject({ equipmentId: t.equipmentId })
              onShow()
            }}
          >
            {t.equipmentId}
          </button>{' '}
          · {eq?.name ?? 'Оборудование'}
          {section && <span className="text-muted-foreground"> · {section.name}</span>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="text-foreground">{t.workType}</span>
        <span>{t.crew}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[t.priority])} />
          {t.priority} приоритет
        </span>
        {t.minutes !== undefined && <span>простой <span className="font-mono">{t.minutes} мин</span></span>}
        {t.createdT !== undefined && <span className="font-mono">создана в {clockText(t.createdT, false)}</span>}
      </div>
      {t.comment && <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{t.comment}</p>}
      {(editable || !t.history) && (
        <div className="flex items-center gap-2 pt-0.5">
          {t.status === 'Новая' && (
            <Button size="sm" className="h-8 text-[13px]" onClick={() => change('В работе')}>
              <PlayIcon />
              Взять в работу
            </Button>
          )}
          {editable && (
            <Button variant="secondary" size="sm" className="h-8 text-[13px]" onClick={() => change('Выполнена')}>
              <CheckIcon className="text-ok" />
              Выполнена
            </Button>
          )}
          {editable && (
            <Button variant="ghost" size="sm" className="h-8 text-[13px] text-muted-foreground" onClick={() => change('Отменена')}>
              Отменить
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 text-[13px] text-muted-foreground"
            onClick={() => {
              focusObject({ equipmentId: t.equipmentId })
              onShow()
            }}
          >
            <MapPinIcon />
            На карте
          </Button>
        </div>
      )}
    </article>
  )
}
