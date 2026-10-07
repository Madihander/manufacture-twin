import { InfoIcon } from 'lucide-react'
import { formatNumber, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { useTwin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import { useUi } from '@/store/ui'
import { focusIncidentObject, focusObject } from '../focus'
import { BigNumber, Divider, KpiTile, LimitBar, Overline, PanelSection, ProgressLine, StatusBadge, StatusInline } from '../primitives'

export function OverviewPanel() {
  const { plant, downtime, incidents, predictions, thresholds } = useTwin()
  const setTab = useSim((s) => s.setTab)
  const dismissed = useUi((s) => s.dismissedPredictions)
  const top = predictions.find((p) => !dismissed.has(p.id) && p.kind === 'failure') ?? predictions.find((p) => !dismissed.has(p.id))

  const monthShare = plant.monthOutput / plant.monthPlan
  const forecastGap = plant.forecast - plant.monthPlan
  const oeeOk = plant.oee * 100 >= thresholds.oeeMin
  const defectOk = plant.defectRate * 100 <= thresholds.defectMax
  const events = downtime.reduce((a, d) => a + d.events, 0)
  const maxDowntime = Math.max(thresholds.downtimeMax * 1.25, ...downtime.map((d) => d.minutes))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto px-5 pt-[18px]">
      <div className="flex flex-col gap-1">
        <Overline>Центр управления</Overline>
        <span className="text-[26px] tracking-[-0.01em]">Обзор завода</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiTile label="Выпуск за месяц">
          <BigNumber value={formatNumber(plant.monthOutput)} unit={`/ ${formatNumber(plant.monthPlan)}`} />
          <div className="flex items-center gap-2">
            <ProgressLine value={monthShare} className="flex-1" />
            <span className="font-mono text-[11px] text-muted-foreground">{Math.round(monthShare * 100)} %</span>
          </div>
          <span className={cn('text-xs leading-snug', forecastGap < 0 ? 'text-alarm-fg' : 'text-ok-fg')}>
            Прогноз на 31.10:{' '}
            <span className="font-mono">
              {formatNumber(plant.forecast)} ({forecastGap < 0 ? '−' : '+'}
              {formatNumber(Math.abs(forecastGap))})
            </span>
          </span>
        </KpiTile>
        <KpiTile label="Выпуск в час">
          <BigNumber value={formatNumber(plant.perHour, 1)} />
          <span className="mt-auto text-xs text-muted-foreground">
            план <span className="font-mono">{formatNumber(plant.perHourPlan, 1)}</span> · смена{' '}
            <span className="font-mono text-foreground">
              {plant.shiftOutput} / {Math.round(plant.planToNow)}
            </span>
          </span>
        </KpiTile>
        <KpiTile label="OEE линии">
          <BigNumber value={formatNumber(plant.oee * 100, 1)} unit="%" />
          <StatusInline status={oeeOk ? 'ok' : 'warn'}>цель ≥ {thresholds.oeeMin} %</StatusInline>
        </KpiTile>
        <KpiTile label="Брак">
          <BigNumber value={formatNumber(plant.defectRate * 100, 1)} unit="%" />
          <StatusInline status={defectOk ? 'ok' : 'alarm'}>порог ≤ {formatNumber(thresholds.defectMax, 0)} %</StatusInline>
        </KpiTile>
      </div>

      <Divider />

      <PanelSection
        title="Простои за сутки"
        aside={<span className="flex h-[22px] items-center rounded-sm border px-2 text-xs text-muted-foreground">{events} {plural(events, ['событие', 'события', 'событий'])}</span>}
      >
        <div className="flex flex-col">
          <div className="grid h-4 grid-cols-[96px_minmax(0,1fr)_52px] gap-2.5">
            <span />
            <div className="relative">
              <span className="absolute -translate-x-1/2 font-mono text-[11px] whitespace-nowrap text-muted-foreground" style={{ left: `${(thresholds.downtimeMax / maxDowntime) * 100}%` }}>
                Лимит {thresholds.downtimeMax}
              </span>
            </div>
            <span />
          </div>
          {downtime.map((d) => (
            <button
              key={d.equipmentId}
              type="button"
              onClick={() => focusObject({ equipmentId: d.equipmentId })}
              className="-mx-2 grid h-7 grid-cols-[96px_minmax(0,1fr)_52px] items-center gap-2.5 rounded-sm px-2 text-left hover:bg-muted"
            >
              <span className="font-mono text-xs">{d.equipmentId}</span>
              <LimitBar value={d.minutes} max={maxDowntime} limit={thresholds.downtimeMax} />
              <span className="text-right font-mono text-xs">{d.minutes} мин</span>
            </button>
          ))}
        </div>
      </PanelSection>

      <Divider />

      <div className="flex flex-col gap-1.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-medium">
            Активные инциденты
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[11px] text-white">{incidents.length}</span>
          </span>
        </div>
        {incidents.length === 0 && <span className="py-2 text-[13px] text-muted-foreground">Открытых инцидентов нет</span>}
        {incidents.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => focusIncidentObject(i.objectId, i.section)}
            className="-mx-2 grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md p-2 text-left hover:bg-muted"
          >
            <span className="font-mono text-xs">{clockText(i.start, false)}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium">{i.title}</span>
              <span className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{i.objectId}</span>·<span className="font-mono">{i.downtime ? `${Math.round(i.downtime / 60)} мин` : '—'}</span>
                {i.ongoing && <span className="text-alarm-fg">· идёт</span>}
              </span>
            </span>
            <StatusBadge status={i.level} className="h-[22px]" />
          </button>
        ))}
      </div>

      <Divider />

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium">Прогноз ИИ</span>
          <button type="button" onClick={() => setTab('ai')} className="text-[13px] font-medium text-brand-strong hover:underline">
            Все прогнозы →
          </button>
        </div>
        {top ? (
          <button
            type="button"
            onClick={() => (top.equipmentId || top.section ? focusObject({ equipmentId: top.equipmentId, section: top.section }) : setTab('ai'))}
            className="flex overflow-hidden rounded-lg border text-left hover:border-switch-off"
          >
            <div className={cn('w-1 flex-none', top.level === 'crit' ? 'bg-alarm' : 'bg-warn')} />
            <div className="flex flex-1 items-center gap-3.5 px-3.5 py-3">
              <BigNumber value={top.big} unit={top.unit === '%' ? '%' : undefined} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[13px] leading-snug">
                  {top.title} {top.unit === '%' ? top.bigLabel : ''}
                </span>
                <StatusBadge status={top.level === 'crit' ? 'alarm' : 'warn'} className="h-[22px] self-start">
                  {top.level === 'crit' ? 'Критично' : 'Внимание'}
                </StatusBadge>
              </div>
            </div>
          </button>
        ) : (
          <span className="text-[13px] text-muted-foreground">Рисков не обнаружено</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t py-3.5 pb-4 text-xs text-muted-foreground">
        <InfoIcon className="size-3.5" />
        Демо-модель на тестовых данных кейса
      </div>
    </div>
  )
}
