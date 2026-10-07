import { useState } from 'react'
import { SparklesIcon, WrenchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HISTORY, type LineSection } from '@/data/history'
import { EQUIPMENT, SECTION_BY_ID, type SectionId } from '@/data/plant'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { rand01 } from '@/sim/rng'
import { SHIFT_START_SEC, TAKT } from '@/sim/model'
import { isDown, METRICS, metricState, series } from '@/sim/telemetry'
import { useTwin } from '@/sim/useTwin'
import { useMaintenance } from '@/store/maintenance'
import { useSim } from '@/store/sim'
import { useAiChat } from '../ai/chat'
import { focusObject } from '../focus'
import { BigNumber, Divider, PanelSection, ProgressLine, Sparkline, StatusBadge, StatusInline } from '../primitives'
import { MetricCard, PanelBody, PanelFooter, PanelHeader } from './common'

type Period = 'shift' | 'day' | 'week'

/** Ключевые датчики участка для блока «Телеметрия». */
const SECTION_METRICS: Partial<Record<SectionId, string[]>> = {
  welding: ['ABB-01:vib', 'ABB-02:vib', 'ABB-03:vib', 'ABB-04:vib'],
  painting: ['Камера-02:temp', 'Камера-02:hum', 'Камера-02:dp'],
  assembly: ['Конвейер-03:tension', 'Конвейер-03:speed', 'Конвейер-03:gear'],
  qc: ['СГ-01:geom', 'КЛ-01:thick'],
}

const DEFECT_REASONS: Partial<Record<SectionId, string[]>> = {
  welding: ['Непровар точки', 'Смещение точки', 'Прожог'],
  painting: ['Подтёки', 'Включения', 'Разнотон'],
  assembly: ['Зазоры', 'Момент затяжки', 'Царапины'],
  qc: ['Геометрия', 'ЛКП', 'Электрика'],
}

export function SectionPanel({ id }: { id: SectionId }) {
  const twin = useTwin()
  const k = twin.sectionById[id]
  const section = SECTION_BY_ID[id]
  const [period, setPeriod] = useState<Period>('shift')
  const openDraft = useMaintenance((s) => s.openDraft)
  const ask = useAiChat((s) => s.ask)
  const setTab = useSim((s) => s.setTab)
  const tAbs = SHIFT_START_SEC + twin.snap.t
  const isLine = id === 'welding' || id === 'painting' || id === 'assembly'
  const equipment = EQUIPMENT.filter((e) => e.section === id)
  const mainEquipment = equipment.find((e) => twin.predictions.some((p) => p.equipmentId === e.id)) ?? equipment[0]
  const prediction = twin.predictions.find((p) => p.section === id && p.kind !== 'plan')

  const agg: Agg | null = !isLine
    ? null
    : period === 'shift'
      ? {
          plan: Math.round(k.planToNow),
          fact: k.fact,
          defects: k.defects,
          defectRate: k.defectRate,
          availability: k.availability,
          performance: k.performance,
          quality: k.quality,
          oee: k.oee,
          load: k.load,
        }
      : aggregate(id as LineSection, period, k.fact, k.defects, twin.snap.t)

  return (
    <>
      <PanelBody>
        <PanelHeader
          overline={
            <>
              Участок · <span className="font-mono tracking-[0.06em]">{section.code}</span>
            </>
          }
          title={section.name}
          badge={<StatusBadge status={k.status} />}
        />
        {k.reasons.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {k.reasons.map((r) => (
              <span key={r} className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {r}
              </span>
            ))}
          </div>
        )}

        {isLine && (
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-full text-[13px] font-medium">
              <span className="font-normal text-muted-foreground">Период</span>
              <span className="flex-1 text-left">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="shift">Текущая смена</SelectItem>
              <SelectItem value="day">Сутки 15.10</SelectItem>
              <SelectItem value="week">7 дней</SelectItem>
            </SelectContent>
          </Select>
        )}

        {isLine && agg && (
          <div className="grid grid-cols-2 gap-2.5">
            <MetricCard label={period === 'shift' ? 'План к моменту / факт' : 'План / факт'}>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-lg font-light text-muted-foreground">{formatNumber(agg.plan)} /</span>
                <BigNumber value={formatNumber(agg.fact)} />
              </span>
              <ProgressLine value={agg.fact / Math.max(1, agg.plan)} />
              <span className="mt-auto text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{formatNumber((agg.fact / Math.max(1, agg.plan)) * 100, 1)} %</span> плана
                {period === 'shift' && <> · смена {k.plan}</>}
              </span>
            </MetricCard>
            <MetricCard label="OEE">
              <BigNumber value={formatNumber(agg.oee * 100, 1)} unit="%" />
              <div className="flex flex-col gap-[5px]">
                {(
                  [
                    ['Доступность', agg.availability],
                    ['Производительность', agg.performance],
                    ['Качество', agg.quality],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{label}</span>
                      <span className="font-mono text-foreground">{formatNumber(v * 100, 1)} %</span>
                    </div>
                    <ProgressLine value={v} height={3} />
                  </div>
                ))}
              </div>
              <StatusInline status={agg.oee * 100 >= twin.thresholds.oeeMin ? 'ok' : 'warn'}>цель ≥ {twin.thresholds.oeeMin} %</StatusInline>
            </MetricCard>
            <MetricCard label="Брак">
              <BigNumber value={formatNumber(agg.defectRate * 100, 1)} unit="%" />
              <StatusInline
                status={agg.defectRate * 100 > twin.thresholds.defectMax * 2 ? 'alarm' : agg.defectRate * 100 > twin.thresholds.defectMax ? 'warn' : 'ok'}
                className="mt-auto"
              >
                {agg.defects} из {agg.fact} · порог {formatNumber(twin.thresholds.defectMax, 0)} %
              </StatusInline>
            </MetricCard>
            <MetricCard label="Загрузка">
              <BigNumber value={formatNumber(agg.load * 100, 0)} unit="%" />
              <ProgressLine value={agg.load} />
              <StatusInline status={agg.load >= 0.9 ? 'ok' : 'warn'} className="mt-auto">
                цель ≥ 90 %
              </StatusInline>
            </MetricCard>
          </div>
        )}

        {!isLine && <SideKpis id={id} />}

        {SECTION_METRICS[id] && (
          <>
            <Divider />
            <PanelSection title="Телеметрия" aside={<span className="font-mono text-[11px] text-muted-foreground">60 мин</span>}>
              <div className="flex flex-col gap-3.5">
                {SECTION_METRICS[id]!.map((mid) => {
                  const m = METRICS.find((x) => x.id === mid)!
                  const { value: v, level, note } = metricState(m, tAbs)
                  const pts = series(m, tAbs, 3600, 30).map((p) => p.v)
                  const multi = id === 'welding' || id === 'qc'
                  return (
                    <button key={mid} type="button" onClick={() => focusObject({ equipmentId: m.equipmentId })} className="flex flex-col gap-1.5 text-left">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13px]">
                          {multi ? <span className="font-mono">{m.equipmentId}</span> : null}
                          {multi ? ' · ' : ''}
                          {m.label}
                        </span>
                        <span className="font-mono text-[15px]">
                          {formatNumber(v, m.digits)} {m.unit}
                        </span>
                      </div>
                      <Sparkline values={pts} lo={m.lo} hi={m.hi} />
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          норма <span className="font-mono">{m.norm}</span>
                        </span>
                        <StatusInline status={level}>
                          {level === 'ok' ? 'Норма' : `${level === 'alarm' ? 'Авария' : 'Внимание'}${note ? `: ${note}` : ''}`}
                        </StatusInline>
                      </div>
                    </button>
                  )
                })}
              </div>
            </PanelSection>
          </>
        )}

        {equipment.length > 0 && (
          <>
            <Divider />
            <PanelSection title="Оборудование">
              <div className="overflow-hidden rounded-[10px] border text-xs">
                <div className="grid grid-cols-[76px_minmax(0,1fr)_80px_56px_56px] items-end gap-1.5 border-b bg-muted px-2.5 py-2 text-[11px] leading-tight text-muted-foreground">
                  <span>Код</span>
                  <span>Название</span>
                  <span>Статус</span>
                  <span className="text-right">Наработка</span>
                  <span className="text-right">Простой за сутки</span>
                </div>
                {equipment.map((e) => {
                  const down = isDown(e.id, tAbs)
                  const pred = twin.predictions.find((p) => p.equipmentId === e.id)
                  const metricsWarn = METRICS.filter((m) => m.equipmentId === e.id).some((m) => metricState(m, tAbs).level !== 'ok')
                  const st = down ? 'alarm' : pred?.level === 'crit' || metricsWarn ? 'warn' : 'ok'
                  const downMin = twin.downtime.find((d) => d.equipmentId === e.id)?.minutes ?? 0
                  const ownDownSec = twin.run.params.downtimes
                    .filter((d) => d.equipmentId === e.id && d.start <= twin.snap.t)
                    .reduce((a, d) => a + Math.min(d.duration, twin.snap.t - d.start), 0)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => focusObject({ equipmentId: e.id })}
                      className="grid w-full grid-cols-[76px_minmax(0,1fr)_80px_56px_56px] items-center gap-1.5 border-b p-2.5 text-left last:border-b-0 hover:bg-muted"
                    >
                      <span className="font-mono">{e.id}</span>
                      <span className="leading-tight">{e.name}</span>
                      <StatusInline status={st}>{down ? 'Стоит' : undefined}</StatusInline>
                      <span className="text-right font-mono">{formatNumber((twin.snap.t - ownDownSec) / 3600, 1)} ч</span>
                      <span className="text-right font-mono">{downMin} мин</span>
                    </button>
                  )
                })}
              </div>
            </PanelSection>
          </>
        )}

        {isLine && k.defects > 0 && (
          <>
            <Divider />
            <DefectReasons id={id} total={k.defects} />
          </>
        )}

        <Divider />
        <SectionJournal id={id} />

        {prediction && (
          <button
            type="button"
            onClick={() => setTab('ai')}
            className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-left hover:border-switch-off', prediction.level === 'crit' ? 'bg-alarm-soft/40' : 'bg-warn-soft/40')}
          >
            <SparklesIcon className="mt-0.5 size-4 flex-none text-brand" />
            <span className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">{prediction.title}</span>
              <span className="text-xs text-muted-foreground">{prediction.recommendation}</span>
            </span>
          </button>
        )}
      </PanelBody>
      <PanelFooter>
        <Button
          variant="secondary"
          className="text-[13px]"
          disabled={!mainEquipment}
          onClick={() =>
            mainEquipment &&
            openDraft({
              equipmentId: mainEquipment.id,
              aiComment: twin.predictions.find((p) => p.equipmentId === mainEquipment.id || p.section === id)?.recommendation,
            })
          }
        >
          <WrenchIcon className="size-[15px]" />
          Создать заявку ТО
        </Button>
        <Button
          className="text-[13px]"
          onClick={() => {
            setTab('ai')
            ask(`Что происходит на участке «${section.name}»?`)
          }}
        >
          <SparklesIcon className="size-[15px]" />
          Спросить ИИ об участке
        </Button>
      </PanelFooter>
    </>
  )
}

function SideKpis({ id }: { id: SectionId }) {
  const { sectionById, snap, plant } = useTwin()
  const k = sectionById[id]
  if (id === 'wh-in') {
    const nextDelivery = Math.ceil((snap.t + 1) / 7200) * 7200
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard label="Комплектов на складе">
          <BigNumber value={k.kits ?? 0} />
        </MetricCard>
        <MetricCard label="Запас">
          <BigNumber value={formatNumber(k.supplyHours ?? 0, 1)} unit="ч" />
          <StatusInline status={k.status}>минимум 2 ч</StatusInline>
        </MetricCard>
        <MetricCard label="Следующий подвоз">
          <BigNumber value={clockText(nextDelivery, false)} />
          <span className="text-xs text-muted-foreground">+60 комплектов</span>
        </MetricCard>
        <MetricCard label="Запущено за смену">
          <BigNumber value={snap.stations[0].produced + snap.stations[0].wip + snap.stations[0].queue} />
        </MetricCard>
      </div>
    )
  }
  if (id === 'wh-out') {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard label="Готово за смену">
          <BigNumber value={snap.whOut} unit={`/ ${Math.round(plant.planToNow)}`} />
          <ProgressLine value={snap.whOut / Math.max(1, plant.planToNow)} />
        </MetricCard>
        <MetricCard label="Выпуск в час">
          <BigNumber value={formatNumber(plant.perHour, 1)} />
          <span className="text-xs text-muted-foreground">план {formatNumber(3600 / TAKT, 1)}</span>
        </MetricCard>
      </div>
    )
  }
  // ОТК
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <MetricCard label="Проверено за смену">
        <BigNumber value={k.fact} />
      </MetricCard>
      <MetricCard label="FPY">
        <BigNumber value={formatNumber((k.fpy ?? 1) * 100, 1)} unit="%" />
        <StatusInline status={(k.fpy ?? 1) >= 0.95 ? 'ok' : 'warn'}>цель ≥ 95 %</StatusInline>
      </MetricCard>
      <MetricCard label="На проверке">
        <BigNumber value={k.wip} />
      </MetricCard>
      <MetricCard label="Замечаний">
        <BigNumber value={k.defects} />
      </MetricCard>
    </div>
  )
}

function DefectReasons({ id, total }: { id: SectionId; total: number }) {
  const reasons = DEFECT_REASONS[id] ?? []
  // Раскладка дефектов по причинам детерминирована: каждый дефект «принадлежит» одной причине.
  const counts = reasons.map(() => 0)
  for (let i = 0; i < total; i++) {
    const r = rand01('reason', id, i)
    counts[r < 0.5 ? 0 : r < 0.83 ? 1 : 2]++
  }
  const max = Math.max(1, ...counts)
  return (
    <PanelSection
      title="Причины брака за смену"
      aside={
        <span className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{total}</span> шт
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {reasons.map((r, i) => (
          <div key={r} className="grid grid-cols-[110px_minmax(0,1fr)_20px] items-center gap-2.5 text-[13px]">
            <span>{r}</span>
            <div className="h-2.5 rounded-r-[3px] bg-brand" style={{ width: `${(counts[i] / max) * 100}%`, minWidth: counts[i] ? 4 : 0 }} />
            <span className="text-right font-mono">{counts[i]}</span>
          </div>
        ))}
      </div>
    </PanelSection>
  )
}

function SectionJournal({ id }: { id: SectionId }) {
  const { run, snap } = useTwin()
  const items = run.incidents.filter((i) => i.section === id && i.start <= snap.t).sort((a, b) => b.start - a.start)
  return (
    <PanelSection title="Журнал инцидентов">
      {items.length === 0 ? (
        <span className="text-[13px] text-muted-foreground">За смену инцидентов не было</span>
      ) : (
        <div className="flex flex-col">
          {items.map((i, idx) => {
            const open = i.closedAt === null || i.closedAt > snap.t
            const last = idx === items.length - 1
            return (
              <div key={i.id} className="grid grid-cols-[14px_minmax(0,1fr)_auto] gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'mt-1 size-2.5 flex-none rounded-full',
                      open ? (i.severity === 'alarm' ? 'bg-alarm shadow-[0_0_0_3px_var(--alarm-soft)]' : 'bg-warn shadow-[0_0_0_3px_var(--warn-soft)]') : 'border-2 border-[#b8c2cf] bg-card',
                    )}
                  />
                  {!last && <span className="mt-1.5 w-px flex-1 bg-border" />}
                </div>
                <div className={cn('flex flex-col gap-[3px]', !last && 'pb-4')}>
                  <span className="font-mono text-xs text-muted-foreground">{clockText(i.start, false)}</span>
                  <span className="text-[13px] font-medium">
                    {i.objectId !== SECTION_BY_ID[id].name && <span className="font-mono font-normal">{i.objectId} · </span>}
                    {i.title}
                  </span>
                  {i.downtime !== null && <span className="font-mono text-xs text-muted-foreground">{Math.round(i.downtime / 60)} мин</span>}
                </div>
                <span
                  className={cn(
                    'flex h-[22px] items-center self-start rounded-full px-2.5 text-xs font-medium',
                    open ? 'bg-brand-soft text-primary' : 'border bg-muted text-muted-foreground',
                  )}
                >
                  {open ? 'Открыт' : 'Закрыт'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PanelSection>
  )
}

interface Agg {
  plan: number
  fact: number
  defects: number
  defectRate: number
  availability: number
  performance: number
  quality: number
  oee: number
  load: number
}

/** KPI участка за период: смена — из симуляции, сутки и неделя — история + текущая смена. */
function aggregate(id: LineSection, period: Period, shiftFact: number, shiftDefects: number, t: number): Agg {
  const twinShift = { plan: t / TAKT, fact: shiftFact, defects: shiftDefects, hours: t / 3600 }
  const dates =
    period === 'shift'
      ? []
      : period === 'day'
        ? ['2026-10-15']
        : [...new Set(HISTORY.shifts.map((s) => s.date))].slice(-7)
  const rows = HISTORY.shifts.filter((s) => s.section === id && dates.includes(s.date))
  const plan = rows.reduce((a, r) => a + r.plan, 0) + twinShift.plan
  const fact = rows.reduce((a, r) => a + r.fact, 0) + twinShift.fact
  const defects = rows.reduce((a, r) => a + r.defects, 0) + twinShift.defects
  const hours = rows.reduce((a, r) => a + r.hours, 0) + twinShift.hours
  const plannedHours = rows.length * 8 + twinShift.hours
  const availability = Math.min(1, hours / Math.max(0.01, plannedHours))
  const performance = Math.min(1, (fact * TAKT) / 3600 / Math.max(0.01, hours))
  const quality = fact ? (fact - defects) / fact : 1
  const load = Math.min(1, rows.reduce((a, r) => a + r.load, 0) / 100 / Math.max(1, rows.length) || availability * performance)
  return {
    plan: Math.round(plan),
    fact,
    defects,
    defectRate: fact ? defects / fact : 0,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    load: period === 'shift' ? availability * performance : load,
  }
}
