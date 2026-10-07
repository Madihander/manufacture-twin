import { useMemo, useState } from 'react'
import { ru } from 'react-day-picker/locale'
import { ArrowDownIcon, ArrowUpIcon, CalendarCheckIcon, CalendarIcon, ChevronDownIcon, DownloadIcon, FileSpreadsheetIcon, FileTextIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react'
import { EmptyState } from '@/components/service/States'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { workdaysOfMonth } from '@/data/history'
import { CAR_MODELS, type ModelFilter } from '@/data/plant'
import { formatDate, formatNumber, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SHIFT_LEN, TAKT } from '@/sim/model'
import {
  allRows,
  downtimeRecords,
  type Filters,
  filterRows,
  forecastSeries,
  groups,
  inPeriod,
  LINE_SECTIONS,
  MODEL_LIST,
  modelShare,
  oeeOf,
  type Row,
} from '@/sim/summary'
import { useTwin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import { ChartCard, DefectChart, ForecastChart, LegendItem, MiniSpark, OeeChart, ParetoChart, PlanFactChart, SECTION_NAME, SERIES } from './charts'

const MONTH_START = new Date(2026, 9, 1)
const TODAY = new Date(2026, 9, 15)

const PRESETS: { label: string; from: Date; to: Date }[] = [
  { label: 'Сегодня', from: TODAY, to: TODAY },
  { label: 'Вчера', from: new Date(2026, 9, 14), to: new Date(2026, 9, 14) },
  { label: '7 дней', from: new Date(2026, 9, 9), to: TODAY },
  { label: 'Текущий месяц', from: MONTH_START, to: TODAY },
]

const DEFAULT_FILTERS: Filters = { from: MONTH_START, to: TODAY, sections: LINE_SECTIONS, shift: 'all', detail: 'day', model: 'all' }

export function SummaryScreen() {
  const twin = useTwin()
  const headerModel = useSim((s) => s.modelFilter)
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, model: headerModel })
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const th = twin.thresholds

  const rows = useMemo(() => allRows(twin.run, twin.snap), [twin.run, twin.snap])
  const view = useMemo(() => filterRows(rows, filters), [rows, filters])
  const share = modelShare(filters.model)
  const scale = (v: number) => Math.round(v * share)

  // KPI: выполнение месячного плана — всегда с начала месяца (по выходу сборки).
  const monthRows = rows.filter((r) => r.section === 'assembly')
  const monthOutput = scale(monthRows.reduce((a, r) => a + r.fact, 0))
  const monthPlan = filters.model === 'all' ? 5500 : CAR_MODELS[filters.model].monthPlan
  const liveRemaining = ((SHIFT_LEN - twin.snap.t) / 3600) * Math.min(twin.plant.perHour || 15, 15)
  const fc = forecastSeries(rows, liveRemaining)
  // Тот же прогноз, что на «Топологии» и в карточке ИИ — одно число на всех экранах.
  const forecast = scale(twin.plant.forecast)

  const oee = oeeOf(view)
  const lastWeek = oeeOf(view.filter((r) => r.date >= '2026-10-09'))
  const prevWeek = oeeOf(rows.filter((r) => r.date >= '2026-10-02' && r.date < '2026-10-09' && filters.sections.includes(r.section)))
  const oeeDelta = (lastWeek.oee - prevWeek.oee) * 100
  const produced = view.reduce((a, r) => a + r.fact, 0)
  const defects = view.reduce((a, r) => a + r.defects, 0)
  const defectRate = produced ? (defects / produced) * 100 : 0
  const prevDefects = rows.filter((r) => r.date >= '2026-10-02' && r.date < '2026-10-09')
  const prevDefectRate = (prevDefects.reduce((a, r) => a + r.defects, 0) / Math.max(1, prevDefects.reduce((a, r) => a + r.fact, 0))) * 100
  const loadAvg = view.length ? view.reduce((a, r) => a + r.load, 0) / view.length : 0
  const today = twin.downtime
  const todayMinutes = today.reduce((a, d) => a + d.minutes, 0)
  const todayEvents = today.reduce((a, d) => a + d.events, 0)

  const allDowntimes = useMemo(() => downtimeRecords(twin.run, twin.snap), [twin.run, twin.snap])
  const downtimes = allDowntimes.filter((d) => inPeriod(d.date, filters) && filters.sections.includes(d.section) && (filters.shift === 'all' || d.shift === filters.shift))

  const grouped = groups(view, filters.detail)
  const planFact = grouped.map((g) => {
    const point: Record<string, number | string> = { label: g.label }
    for (const s of filters.sections) {
      const rs = g.rows.filter((r) => r.section === s)
      if (rs.length) point[s] = Math.round((rs.reduce((a, r) => a + r.fact, 0) / rs.length) * share)
    }
    return point
  })
  const oeeData = grouped.map((g) => {
    const point: Record<string, number | string> = { label: g.label }
    for (const s of filters.sections) {
      const rs = g.rows.filter((r) => r.section === s)
      if (rs.length) point[s] = Math.round(oeeOf(rs).oee * 1000) / 10
    }
    return point
  })
  const defectData = filters.sections.map((s) => {
    const rs = view.filter((r) => r.section === s)
    const p = rs.reduce((a, r) => a + r.fact, 0)
    const d = rs.reduce((a, r) => a + r.defects, 0)
    return { name: SECTION_NAME[s], rate: p ? (d / p) * 100 : 0, defects: d, produced: p }
  })
  const pareto = (() => {
    const byReason = new Map<string, number>()
    for (const d of downtimes) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + d.minutes)
    const sorted = [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const total = sorted.reduce((a, [, m]) => a + m, 0)
    let cum = 0
    return sorted.map(([reason, minutes]) => {
      cum += minutes
      return { reason, minutes, cum: total ? (cum / total) * 100 : 0 }
    })
  })()

  const dailySpark = (() => {
    const byDate = new Map<string, Row[]>()
    for (const r of rows) {
      if (!byDate.has(r.date)) byDate.set(r.date, [])
      byDate.get(r.date)!.push(r)
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
  })()

  const isDefault = JSON.stringify({ ...filters, model: 'all' }) === JSON.stringify({ ...DEFAULT_FILTERS, model: 'all' }) && filters.model === headerModel

  return (
    <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
      <FilterBar filters={filters} set={set} reset={() => setFilters({ ...DEFAULT_FILTERS, model: headerModel })} isDefault={isDefault} rows={view} downtimes={downtimes} />

      <main className="flex flex-col gap-4 px-7 pt-5 pb-7">
        <div className="grid grid-cols-5 gap-3">
          <Kpi label="Выполнение плана месяца" value={formatNumber(monthOutput)} unit={`/ ${formatNumber(monthPlan)}`}>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (monthOutput / monthPlan) * 100)}%` }} />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{Math.round((monthOutput / monthPlan) * 100)} %</span>
            </div>
            <KpiFoot
              note={<Dot ok={forecast >= monthPlan}>прогноз <span className="font-mono">{formatNumber(forecast)}</span></Dot>}
              spark={<MiniSpark values={fc.points.filter((p) => p.actual !== undefined).map((p) => p.actual!)} />}
            />
          </Kpi>
          <Kpi label="OEE (выбранные участки)" value={formatNumber(oee.oee * 100, 1)} unit="%">
            <Delta value={oeeDelta} goodWhenUp />
            <KpiFoot
              note={<Dot ok={oee.oee * 100 >= th.oeeMin}>цель ≥ {th.oeeMin} %</Dot>}
              spark={<MiniSpark values={dailySpark.map(([, rs]) => oeeOf(rs.filter((r) => filters.sections.includes(r.section))).oee * 100)} reference={th.oeeMin} />}
            />
          </Kpi>
          <Kpi label="Уровень брака" value={formatNumber(defectRate, 1)} unit="%">
            <Delta value={defectRate - prevDefectRate} goodWhenUp={false} />
            <KpiFoot
              note={<Dot ok={defectRate <= th.defectMax}>порог ≤ {formatNumber(th.defectMax, 0)} %</Dot>}
              spark={
                <MiniSpark
                  color={defectRate > th.defectMax ? '#c8453b' : '#0088cc'}
                  reference={th.defectMax}
                  values={dailySpark.map(([, rs]) => {
                    const p = rs.reduce((a, r) => a + r.fact, 0)
                    return p ? (rs.reduce((a, r) => a + r.defects, 0) / p) * 100 : 0
                  })}
                />
              }
            />
          </Kpi>
          <Kpi label="Простои за сутки" value={String(todayMinutes)} unit="мин">
            <span className="text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{todayEvents}</span> {plural(todayEvents, ['событие', 'события', 'событий'])}
            </span>
            <KpiFoot
              note={<Dot ok={today.every((d) => d.minutes <= th.downtimeMax)}>лимит {th.downtimeMax} мин на единицу</Dot>}
              spark={<DowntimeBars records={allDowntimes} />}
            />
          </Kpi>
          <Kpi label="Средняя загрузка линий" value={formatNumber(loadAvg, 0)} unit="%">
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-brand" style={{ width: `${loadAvg}%` }} />
            </div>
            <KpiFoot note={<span className="text-xs text-muted-foreground">{filters.sections.map((s) => SECTION_NAME[s]).join(', ')}</span>} />
          </Kpi>
        </div>

        {view.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState icon={CalendarCheckIcon} text="За выбранный период и фильтры данных нет" actionLabel="Сбросить фильтры" onAction={() => setFilters(DEFAULT_FILTERS)} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <ChartCard
              title="План / факт по линиям"
              subtitle={`Авто за смену, среднее по ${filters.detail === 'day' ? 'рабочему дню' : 'смене'} · план ${Math.round(120 * share)}`}
              legend={
                <>
                  {filters.sections.map((s) => (
                    <LegendItem key={s} color={SERIES[s]} label={SECTION_NAME[s]} />
                  ))}
                  <LegendItem color="#94a3b8" label="План" dashed />
                </>
              }
            >
              <PlanFactChart data={planFact} sections={filters.sections} plan={Math.round(120 * share)} />
            </ChartCard>
            <ChartCard
              title="OEE по участкам"
              subtitle="%, по рабочим дням · точки ниже цели — красные"
              legend={filters.sections.map((s) => (
                <LegendItem key={s} color={SERIES[s]} label={SECTION_NAME[s]} line />
              ))}
            >
              <OeeChart data={oeeData} sections={filters.sections} target={th.oeeMin} />
            </ChartCard>
            <ChartCard
              title="Брак по участкам, %"
              subtitle="За период · выше порога — красным"
              legend={
                <>
                  <LegendItem color="#0088cc" label="в норме" />
                  <LegendItem color="#c8453b" label="выше порога" />
                </>
              }
            >
              <DefectChart data={defectData} threshold={th.defectMax} />
            </ChartCard>
            <ChartCard
              title="Парето простоев"
              subtitle={pareto.length ? `Минуты по причинам и накопленная доля · ${pareto.length} ${plural(pareto.length, ['причина', 'причины', 'причин'])}` : 'Простоев за период нет'}
              legend={
                <>
                  <LegendItem color="#0088cc" label="минуты" />
                  <LegendItem color="#0b3b60" label="накопительно, %" line />
                </>
              }
            >
              <ParetoChart data={pareto} />
            </ChartCard>
            <ModelOutput monthOutputAll={monthRows.reduce((a, r) => a + r.fact, 0)} filter={filters.model} />
            <ChartCard
              title="Прогноз выпуска до конца месяца"
              subtitle="Накопительно по рабочим дням октября"
              legend={
                <>
                  <LegendItem color="#0b3b60" label="факт" line />
                  <LegendItem color="#0088cc" label="прогноз" dashed />
                  <LegendItem color="#cce7f5" label="коридор неопределённости" />
                </>
              }
            >
              <ForecastChart
                data={fc.points.map((p) => ({
                  ...p,
                  actual: p.actual !== undefined ? scale(p.actual) : undefined,
                  forecast: p.forecast !== undefined ? scale(p.forecast) : undefined,
                  band: p.band ? [scale(p.band[0]), scale(p.band[1])] : undefined,
                }))}
                target={monthPlan}
              />
              <span className={cn('text-[13px]', forecast < monthPlan ? 'text-alarm-fg' : 'text-ok-fg')}>
                Прогноз {formatNumber(forecast)} · {forecast < monthPlan ? `недобор ${formatNumber(monthPlan - forecast)}` : `перевыполнение ${formatNumber(forecast - monthPlan)}`}
              </span>
            </ChartCard>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4">
          <DowntimeJournal records={downtimes} from={filters.from} to={filters.to} />
          <BusinessEffect history={allDowntimes} />
        </div>
      </main>
    </div>
  )
}

function Kpi({ label, value, unit, children }: { label: string; value: string; unit: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card px-[18px] py-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[40px] leading-none font-light tracking-[-0.02em] text-primary">{value}</span>
        <span className="text-[15px] text-muted-foreground">{unit}</span>
      </span>
      {children}
    </div>
  )
}

function KpiFoot({ note, spark }: { note: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="mt-auto flex items-end justify-between gap-2">
      {note}
      {spark}
    </div>
  )
}

function Dot({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-xs leading-tight', ok ? 'text-ok-fg' : 'text-alarm-fg')}>
      <span className={cn('size-1.5 flex-none rounded-full', ok ? 'bg-ok' : 'bg-alarm')} />
      <span>{children}</span>
    </span>
  )
}

function Delta({ value, goodWhenUp }: { value: number; goodWhenUp: boolean }) {
  const good = goodWhenUp ? value >= 0 : value <= 0
  const Icon = value >= 0 ? ArrowUpIcon : ArrowDownIcon
  return (
    <span className={cn('flex items-center gap-1 text-xs', good ? 'text-ok-fg' : 'text-alarm-fg')}>
      <Icon className="size-3" />
      <span className="font-mono">{formatNumber(Math.abs(value), 1)} п.п.</span>
      <span className="text-muted-foreground">к прошлой неделе</span>
    </span>
  )
}

function DowntimeBars({ records }: { records: { date: string; minutes: number }[] }) {
  const days = workdaysOfMonth(2026, 9).filter((d) => d.getDate() <= 15).slice(-6)
  const vals = days.map((d) => {
    const iso = `2026-10-${String(d.getDate()).padStart(2, '0')}`
    return records.filter((r) => r.date === iso).reduce((a, r) => a + r.minutes, 0)
  })
  const max = Math.max(1, ...vals)
  return (
    <div className="flex h-7 flex-none items-end gap-[3px]">
      {vals.map((v, i) => (
        <span key={i} title={`${v} мин`} className={cn('w-2 rounded-t-[2px]', i === vals.length - 1 ? 'bg-brand' : 'bg-chart-3')} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function FilterBar({
  filters,
  set,
  reset,
  isDefault,
  rows,
  downtimes,
}: {
  filters: Filters
  set: (p: Partial<Filters>) => void
  reset: () => void
  isDefault: boolean
  rows: Row[]
  downtimes: ReturnType<typeof downtimeRecords>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ from?: Date; to?: Date }>({ from: filters.from, to: filters.to })
  const days = draft.from && draft.to ? Math.round((draft.to.getTime() - draft.from.getTime()) / 86400000) + 1 : 0
  const workdays = draft.from && draft.to ? workdaysOfMonth(2026, 9).filter((d) => d >= draft.from! && d <= draft.to!).length : 0
  const sectionsLabel = filters.sections.length === 3 ? 'Все участки' : filters.sections.map((s) => SECTION_NAME[s]).join(', ') || 'Нет участков'

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-2 border-b bg-card px-7 pt-3 pb-2.5 print:static">
      <div className="flex flex-wrap items-end gap-4">
        <Labeled label="Период">
          <Popover
            open={open}
            onOpenChange={(o) => {
              setOpen(o)
              if (o) setDraft({ from: filters.from, to: filters.to })
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="secondary" className="h-9 gap-2 px-3 text-[13px]">
                <CalendarIcon className="size-[15px] text-muted-foreground" />
                <span className="font-mono text-xs">
                  {formatDate(filters.from)} — {formatDate(filters.to)}
                </span>
                <ChevronDownIcon className="size-[15px] text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-auto flex-row gap-0 overflow-hidden rounded-lg p-0 shadow-popover">
              <div className="flex w-[168px] flex-col gap-0.5 border-r px-2 py-3">
                {PRESETS.map((p) => {
                  const on = draft.from?.getTime() === p.from.getTime() && draft.to?.getTime() === p.to.getTime()
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setDraft({ from: p.from, to: p.to })}
                      className={cn('flex h-[34px] items-center rounded-sm px-2.5 text-left text-[13px]', on ? 'bg-brand-soft font-medium text-primary' : 'hover:bg-muted')}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-col">
                <Calendar
                  mode="range"
                  locale={ru}
                  weekStartsOn={1}
                  defaultMonth={MONTH_START}
                  selected={{ from: draft.from, to: draft.to }}
                  onSelect={(r) => setDraft({ from: r?.from, to: r?.to })}
                  disabled={{ before: MONTH_START, after: TODAY }}
                  className="p-3 [--cell-size:34px] [&_.rdp-caption_label]:capitalize"
                />
                <div className="flex items-center justify-between gap-4 border-t px-[18px] py-2.5">
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    {days} {plural(days, ['день', 'дня', 'дней'])} · {workdays} {plural(workdays, ['рабочий', 'рабочих', 'рабочих'])}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                      Отмена
                    </Button>
                    <Button
                      size="sm"
                      disabled={!draft.from}
                      onClick={() => {
                        set({ from: draft.from!, to: draft.to ?? draft.from! })
                        setOpen(false)
                      }}
                    >
                      Применить
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </Labeled>

        <Labeled label="Участки">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="h-9 min-w-40 justify-between gap-2 px-3 text-[13px]">
                {sectionsLabel}
                <ChevronDownIcon className="size-[15px] text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[250px]">
              {LINE_SECTIONS.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={filters.sections.includes(s)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => set({ sections: on ? LINE_SECTIONS.filter((x) => x === s || filters.sections.includes(x)) : filters.sections.filter((x) => x !== s) })}
                  className="text-[13px]"
                >
                  <span className="flex-1">{SECTION_NAME[s]}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{s === 'welding' ? 'WLD-1' : s === 'painting' ? 'PNT-1' : 'ASM-1'}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Labeled>

        <Labeled label="Модель">
          <Select value={filters.model} onValueChange={(v) => set({ model: v as ModelFilter })}>
            <SelectTrigger className="h-9 min-w-[150px] text-[13px] font-medium data-[size=default]:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Все модели</SelectItem>
              {MODEL_LIST.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Labeled>

        <Labeled label="Смена">
          <Segmented value={filters.shift} options={[['all', 'Все'], [1, '1'], [2, '2']]} onChange={(v) => set({ shift: v })} />
        </Labeled>
        <Labeled label="Детализация">
          <Segmented value={filters.detail} options={[['day', 'День'], ['shift', 'Смена']]} onChange={(v) => set({ detail: v })} />
        </Labeled>

        <div className="ml-auto flex items-center gap-2 print:hidden">
          <Button variant="ghost" className="h-9 text-[13px]" onClick={reset} disabled={isDefault}>
            <RotateCcwIcon className="size-[15px]" />
            Сбросить
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="h-9 text-[13px]">
                <DownloadIcon className="size-[15px]" />
                Экспорт
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem onSelect={() => setTimeout(() => window.print(), 50)} className="text-[13px]">
                <FileTextIcon className="text-alarm" />
                PDF-отчёт
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportCsv(rows, downtimes)} className="text-[13px]">
                <FileSpreadsheetIcon className="text-ok" />
                Excel (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <span className="inline-flex h-[22px] items-center gap-2 self-start rounded-sm border bg-muted px-2 text-[11px] whitespace-nowrap text-muted-foreground">
        <span className="font-mono text-foreground">01–02.10</span> смена 1 — данные кейса <span className="text-[#b8c2cf]">·</span>
        <span className="font-mono text-foreground">03–15.10</span> — смоделированы <span className="text-[#b8c2cf]">·</span>
        <span className="font-mono text-foreground">15.10</span> смена 2 — живая симуляция
      </span>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={cn('h-[34px] min-w-12 border-r px-3 text-[13px] font-medium last:border-r-0', value === v ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function exportCsv(rows: Row[], downtimes: ReturnType<typeof downtimeRecords>) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    ['Дата', 'Смена', 'Участок', 'План', 'Факт', 'Время работы, ч', 'Загрузка, %', 'Брак, шт', 'Источник'].map(esc).join(';'),
    ...rows.map((r) =>
      [r.date, r.shift, SECTION_NAME[r.section], r.plan, r.fact, formatNumber(r.hours, 1), r.load, r.defects, r.real ? 'кейс' : r.live ? 'симуляция' : 'модель'].map(esc).join(';'),
    ),
    '',
    ['Дата', 'Смена', 'Участок', 'Оборудование', 'Причина', 'Длительность, мин', 'Статус'].map(esc).join(';'),
    ...downtimes.map((d) => [d.date, d.shift, SECTION_NAME[d.section], d.equipmentId, d.reason, d.minutes, d.status].map(esc).join(';')),
  ]
  // BOM — чтобы Excel открыл кириллицу правильно.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'svodka-saryarkaavtoprom.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

function ModelOutput({ monthOutputAll, filter }: { monthOutputAll: number; filter: ModelFilter }) {
  // История не хранит модели: раскладываем выпуск по миксу плана (Onix : Cobalt : J7 = 2 500 : 1 800 : 500).
  const totalPlan = MODEL_LIST.reduce((a, m) => a + m.monthPlan, 0)
  const data = MODEL_LIST.map((m) => ({ ...m, fact: Math.round((monthOutputAll * m.monthPlan) / totalPlan) }))
  const max = Math.max(...data.map((d) => d.monthPlan))
  return (
    <ChartCard
      title="Выпуск по моделям"
      subtitle="Факт с начала месяца против плана месяца"
      legend={
        <>
          <LegendItem color="#0088cc" label="факт" />
          <LegendItem color="#e3e8ef" label="план" />
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {data.map((d) => (
          <div key={d.id} className={cn('grid grid-cols-[130px_minmax(0,1fr)_120px] items-center gap-3', filter !== 'all' && filter !== d.id && 'opacity-40')}>
            <span className="text-[13px]">{d.name}</span>
            <div className="relative h-5 rounded-[3px] bg-border" style={{ width: `${(d.monthPlan / max) * 100}%` }}>
              <div className="h-full rounded-[3px] bg-brand" style={{ width: `${Math.min(100, (d.fact / d.monthPlan) * 100)}%` }} />
            </div>
            <span className="text-right font-mono text-xs">
              {formatNumber(d.fact)} / {formatNumber(d.monthPlan)}
            </span>
          </div>
        ))}
        <div className="flex gap-2.5 rounded-md bg-warn-soft px-3 py-2.5 text-[13px] text-warn-fg">
          <TriangleAlertIcon className="mt-0.5 size-4 flex-none" />
          <span>
            Сумма плана по моделям <span className="font-mono">{formatNumber(totalPlan)}</span> &lt; цели <span className="font-mono">5 500</span>:{' '}
            <span className="font-mono">{formatNumber(5500 - totalPlan)}</span> авто не распределены по моделям
          </span>
        </div>
      </div>
    </ChartCard>
  )
}

type SortKey = 'date' | 'section' | 'equipmentId' | 'reason' | 'minutes' | 'status'

function DowntimeJournal({ records, from, to }: { records: ReturnType<typeof downtimeRecords>; from: Date; to: Date }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [page, setPage] = useState(0)
  const PAGE = 8
  const sorted = [...records].sort((a, b) => {
    const va = a[sort.key]
    const vb = b[sort.key]
    const c = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
    return (c || a.shift - b.shift) * sort.dir
  })
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const shown = sorted.slice(cur * PAGE, cur * PAGE + PAGE)
  const head: [SortKey, string, string][] = [
    ['date', 'Дата', ''],
    ['section', 'Участок', ''],
    ['equipmentId', 'Оборудование', ''],
    ['reason', 'Причина', ''],
    ['minutes', 'Длительность', 'text-right'],
    ['status', 'Статус', 'text-right'],
  ]
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-base font-medium">Журнал простоев</span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatDate(from)} — {formatDate(to)}
        </span>
      </div>
      <div className="grid grid-cols-[110px_96px_120px_minmax(0,1fr)_110px_100px] gap-3 border-y bg-muted px-5 py-2.5 text-xs font-medium text-muted-foreground">
        {head.map(([key, label, cls]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'minutes' ? -1 : 1 }))}
            className={cn('flex items-center gap-1 hover:text-foreground', cls && 'justify-end')}
          >
            {label}
            {sort.key === key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={CalendarCheckIcon} text="За выбранный период простоев нет" />
      ) : (
        shown.map((d, i) => (
          <div key={`${d.date}-${d.equipmentId}-${d.reason}-${i}`} className="grid grid-cols-[110px_96px_120px_minmax(0,1fr)_110px_100px] items-center gap-3 border-b px-5 py-2.5 text-[13px] last:border-b-0">
            <span className="font-mono text-xs">
              {d.date.slice(8, 10)}.{d.date.slice(5, 7)}.2026 <span className="text-muted-foreground">· {d.shift}</span>
            </span>
            <span>{SECTION_NAME[d.section]}</span>
            <span className="font-mono text-xs">{d.equipmentId}</span>
            <span className="truncate">
              {d.reason}
              {d.real && <span className="ml-1.5 rounded-sm bg-brand-soft px-1.5 text-[10px] text-primary">кейс</span>}
              {d.planned && <span className="ml-1.5 rounded-sm bg-muted px-1.5 text-[10px] text-muted-foreground">план</span>}
            </span>
            <span className={cn('text-right font-mono text-xs', d.minutes > 45 && 'text-alarm-fg')}>{d.minutes} мин</span>
            <span className="flex justify-end">
              <span className={cn('flex h-[22px] items-center rounded-full px-2.5 text-xs font-medium', d.status === 'Открыт' ? 'bg-brand-soft text-primary' : 'border bg-muted text-muted-foreground')}>{d.status}</span>
            </span>
          </div>
        ))
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between border-t px-5 py-2.5 text-xs text-muted-foreground">
          <span>
            {cur * PAGE + 1}–{Math.min(sorted.length, cur * PAGE + PAGE)} из {sorted.length}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" onClick={() => setPage(i)} className={cn('size-7 rounded-sm font-mono', i === cur ? 'bg-primary text-white' : 'hover:bg-muted')}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BusinessEffect({ history }: { history: ReturnType<typeof downtimeRecords> }) {
  const [share, setShare] = useState(30)
  const [margin, setMargin] = useState('400000')
  // Незапланированные простои за полные рабочие дни месяца → в среднем за день → на 22 рабочих дня.
  const unplanned = history.filter((d) => !d.planned && !d.live)
  const days = new Set(history.filter((d) => !d.live).map((d) => d.date)).size || 1
  const perDay = unplanned.reduce((a, d) => a + d.minutes, 0) / days
  const monthMinutes = perDay * 22
  const cars = Math.round((monthMinutes * (share / 100) * 60) / TAKT)
  const m = Number(margin.replace(/\s/g, '')) || 0
  const money = (cars * m) / 1e6
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card px-5 py-[18px]">
      <div className="flex flex-col gap-[3px]">
        <span className="text-base font-medium">Эффект для бизнеса</span>
        <span className="text-[13px] text-muted-foreground">Если двойник поможет предотвратить часть незапланированных простоев</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between text-[13px]">
          <span>Доля предотвращённых незапланированных простоев</span>
          <span className="font-mono">{share} %</span>
        </div>
        <Slider value={[share]} min={0} max={60} step={5} onValueChange={(v) => setShare(v[0])} />
        <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>0 %</span>
          <span>60 %</span>
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px]">Условная маржа на автомобиль, ₸</span>
        <span className="flex h-[38px] items-center overflow-hidden rounded-md border focus-within:border-ring">
          <input
            inputMode="numeric"
            value={formatNumber(m)}
            onChange={(e) => setMargin(e.target.value.replace(/\D/g, ''))}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-right font-mono text-sm outline-none"
          />
          <span className="flex h-full items-center border-l bg-muted px-3 text-xs text-muted-foreground">₸</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1 rounded-[10px] bg-brand-soft px-3.5 py-3">
          <span className="text-xs text-primary">Дополнительный выпуск</span>
          <span className="text-[32px] leading-none font-light text-primary">+{cars}</span>
          <span className="text-xs text-muted-foreground">авто в месяц</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[10px] bg-brand-soft px-3.5 py-3">
          <span className="text-xs text-primary">Дополнительная маржа</span>
          <span className="text-[32px] leading-none font-light text-primary">≈ {formatNumber(money, money < 10 ? 1 : 0)}</span>
          <span className="text-xs text-muted-foreground">млн ₸ в месяц</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        расчёт: незапланированные простои ≈ {formatNumber(perDay, 0)} мин/день × 22 рабочих дня, такт 4 мин; маржа — допущение
      </span>
    </div>
  )
}

