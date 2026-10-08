import { useState } from 'react'
import { CalendarIcon, ChevronRightIcon, CrosshairIcon, MapPinIcon, SparklesIcon, WrenchIcon, XIcon } from 'lucide-react'
import { useJournal } from '@/components/service/useJournal'
import { Button } from '@/components/ui/button'
import { EQUIPMENT_BY_ID, SECTION_BY_ID } from '@/data/plant'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { downtimeLast7Days } from '@/sim/metrics'
import { SHIFT_START_SEC } from '@/sim/model'
import { isDown, METRICS_BY_EQUIPMENT, type MetricSpec, metricState, series } from '@/sim/telemetry'
import { useTwin } from '@/sim/useTwin'
import { isOpen, ticketWindow, useMaintenance } from '@/store/maintenance'
import { useSim } from '@/store/sim'
import { useUi } from '@/store/ui'
import { focusObject } from '../focus'
import { Divider, PanelSection, StatusBadge } from '../primitives'
import { PanelBody, PanelFooter } from './common'

const WINDOWS = [
  { label: '1 ч', sec: 3600 },
  { label: '8 ч', sec: 8 * 3600 },
  { label: '24 ч', sec: 24 * 3600 },
] as const

export function EquipmentPanel({ id }: { id: string }) {
  const twin = useTwin()
  const eq = EQUIPMENT_BY_ID[id]
  const section = SECTION_BY_ID[eq.section]
  const tAbs = SHIFT_START_SEC + twin.snap.t
  const metrics = METRICS_BY_EQUIPMENT[id] ?? []
  const prediction = twin.predictions.find((p) => p.equipmentId === id)
  const down = isDown(id, tAbs)
  const metricsWarn = metrics.some((m) => metricState(m, tAbs).level !== 'ok')
  const status = down ? 'alarm' : prediction?.level === 'crit' || metricsWarn ? 'warn' : 'ok'
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(WINDOWS[0])
  const openDraft = useMaintenance((s) => s.openDraft)
  const openTickets = useJournal().filter((t) => t.equipmentId === id && isOpen(t))
  const openLog = useUi((s) => s.setMaintenanceLogOpen)
  const select = useSim((s) => s.select)
  const cameraCmd = useSim((s) => s.cameraCmd)
  const history = downtimeLast7Days(twin.run, twin.snap.t, id)
  const maxHist = Math.max(30, ...history.map((h) => h.minutes))
  const today = history[history.length - 1]
  const todayReason = twin.run.params.downtimes.find((d) => d.equipmentId === id && d.start <= twin.snap.t)?.reason

  const [main, ...rest] = metrics
  const welding = eq.section === 'welding'

  return (
    <>
      <PanelBody>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[13px]">
              <button type="button" onClick={() => focusObject({ section: eq.section })} className="text-brand-strong hover:underline">
                {section.name}
              </button>
              <span className="text-chart-plan">/</span>
              <span className="font-mono text-xs">{id}</span>
            </div>
            <span className="text-[22px] leading-tight tracking-[-0.01em]">
              <span className="font-mono text-xl">{id}</span> · {eq.name}
            </span>
            <StatusBadge status={status} className="self-start">
              {down ? 'Остановлено' : undefined}
            </StatusBadge>
          </div>
          <div className="flex flex-none gap-0.5">
            <Button variant="ghost" size="icon-sm" title="Центрировать на карте" onClick={() => cameraCmd({ type: 'focus' })} className="text-muted-foreground">
              <CrosshairIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Закрыть" onClick={() => select(null)} className="text-muted-foreground">
              <XIcon />
            </Button>
          </div>
        </div>

        {prediction ? (
          <div className="flex overflow-hidden rounded-lg border">
            <div className={cn('w-1 flex-none', prediction.level === 'crit' ? 'bg-alarm' : 'bg-warn')} />
            <div className="flex flex-1 items-center gap-4 px-4 py-3.5">
              {prediction.probability !== undefined && <RiskRing value={prediction.probability} crit={prediction.level === 'crit'} />}
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="overline flex items-center gap-1.5 text-[11px]">
                  <SparklesIcon className="size-[13px] text-brand" />
                  Прогноз ИИ
                </span>
                <span className="text-[15px] leading-snug font-medium">
                  {/* Неразрывный пробел: «2 ч» не разрывается переносом. */}
                  Риск остановки {prediction.bigLabel.replace('в течение', 'в ближайшие').replace(/(\d) ч/, '$1 ч')}
                </span>
                <span className="text-xs text-muted-foreground">
                  Причина: <span className="text-alarm-fg">{prediction.signs[0]}</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border px-4 py-3 text-[13px] text-muted-foreground">
            <SparklesIcon className="size-4 text-brand" />
            ИИ: признаков скорой остановки нет
          </div>
        )}

        <Divider />

        <PanelSection
          title="Телеметрия"
          aside={
            <div className="flex overflow-hidden rounded-md border">
              {WINDOWS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setWin(w)}
                  className={cn('h-7 min-w-11 border-r px-2 font-mono text-xs font-medium last:border-r-0', win === w ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted')}
                >
                  {w.label}
                </button>
              ))}
            </div>
          }
        >
          {main && <MainChart m={main} tAbs={tAbs} windowSec={win.sec} />}
          <div className="flex flex-col border-t">
            {rest.map((m) => {
              const { value: v, level: lvl } = metricState(m, tAbs)
              return (
                <div key={m.id} className="flex flex-col gap-1.5 border-b py-2.5 last:border-b-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px]">{m.label}</span>
                    <span className={cn('font-mono text-sm', lvl === 'alarm' && 'text-alarm-fg', lvl === 'warn' && 'text-warn-fg')}>
                      {formatNumber(v, m.digits)} {m.unit}
                    </span>
                  </div>
                  {m.hi !== undefined && (
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-1 flex-1 rounded-full bg-border">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (v / (m.hi * 1.07)) * 100)}%` }} />
                        <div className="absolute -inset-y-[3px] border-l-[1.5px] border-dashed border-chart-plan" style={{ left: `${(1 / 1.07) * 100}%` }} />
                      </div>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        норма <span className="font-mono">{m.norm}</span>
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
            {welding && (
              <div className="flex items-baseline justify-between py-2.5">
                <span className="text-[13px]">Циклов сварки за смену</span>
                <span className="font-mono text-sm">{formatNumber(twin.snap.stations[0].produced * 48)}</span>
              </div>
            )}
          </div>
        </PanelSection>

        <Divider />

        <PanelSection title="История простоев, 7 дней">
          <div className="grid h-16 grid-cols-7 items-end gap-2 border-b border-switch-off">
            {history.map((h, i) => (
              <div
                key={i}
                title={`${h.minutes} мин`}
                className={cn('rounded-t-[3px]', h.minutes === 0 ? 'h-0.5 rounded-[2px] bg-switch-off' : i === history.length - 1 ? 'bg-brand' : 'bg-chart-3')}
                style={h.minutes ? { height: `${(h.minutes / maxHist) * 100}%` } : undefined}
              />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 text-center font-mono text-[11px] text-muted-foreground">
            {history.map((h, i) => (
              <span key={i} className={cn(i === history.length - 1 && 'font-medium text-foreground')}>
                {formatDate(h.date).slice(0, 5)}
              </span>
            ))}
          </div>
          <span className="text-[13px]">
            Сегодня: <span className="font-mono">{today.minutes} мин</span>
            {todayReason && <> · {todayReason}</>}
          </span>
        </PanelSection>

        <Divider />

        <PanelSection title="Обслуживание">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1 rounded-[10px] border px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Последнее ТО</span>
              <span className="font-mono text-sm">{formatDate(eq.lastService)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-[10px] border px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Следующее плановое</span>
              <span className="font-mono text-sm">{formatDate(eq.nextService)}</span>
            </div>
          </div>
          {openTickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openLog(true)}
              title="Открыть журнал заявок"
              className="flex items-center gap-2.5 rounded-[10px] border border-brand/30 bg-brand-soft px-3 py-2.5 text-left text-[13px] hover:border-brand"
            >
              <WrenchIcon className="size-4 flex-none text-brand" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>
                  Заявка <span className="font-mono">{t.id}</span> · <span className="font-medium">{t.status.toLowerCase()}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">
                    {formatDate(t.date).slice(0, 5)} {ticketWindow(t)}
                  </span>{' '}
                  · {t.workType} · {t.crew}
                </span>
              </span>
              <ChevronRightIcon className="size-4 flex-none text-muted-foreground" />
            </button>
          ))}
        </PanelSection>
      </PanelBody>
      <PanelFooter>
        <Button variant="secondary" className="text-[13px]" onClick={() => cameraCmd({ type: 'focus' })}>
          <MapPinIcon className="size-[15px]" />
          Показать на карте
        </Button>
        <Button className="text-[13px]" onClick={() => openDraft({ equipmentId: id, aiComment: prediction?.recommendation })}>
          <CalendarIcon className="size-[15px]" />
          Запланировать ТО
        </Button>
      </PanelFooter>
    </>
  )
}

function RiskRing({ value, crit }: { value: number; crit: boolean }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-[84px] flex-none">
      <svg width="84" height="84" viewBox="0 0 84 84" className="block -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
        <circle cx="42" cy="42" r={r} fill="none" stroke={crit ? 'var(--alarm)' : 'var(--warn)'} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[22px] font-light whitespace-nowrap text-primary">
        {Math.round(value * 100)}
        <span className="text-xs text-muted-foreground">&nbsp;%</span>
      </div>
    </div>
  )
}

/** Основной график датчика: оси, порог, линия тренда за последний час. */
function MainChart({ m, tAbs, windowSec }: { m: MetricSpec; tAbs: number; windowSec: number }) {
  const pts = series(m, tAbs, windowSec, 72)
  const values = pts.map((p) => p.v)
  const v = m.value(tAbs)
  const ref = m.hi ?? m.lo ?? Math.max(...values)
  const top = Math.max(ref * 1.1, ...values)
  const bottom = Math.min(...values.filter((x) => x > 0), ref * 0.5)
  const lo = Math.floor(bottom)
  const hi = Math.ceil(top)
  const y = (val: number) => Math.max(0, Math.min(100, 100 - ((val - lo) / Math.max(1e-6, hi - lo)) * 100))
  const poly = pts.map((p, i) => `${(i / (pts.length - 1)) * 300},${y(p.v).toFixed(2)}`).join(' ')
  // Линия тренда по последней трети окна.
  const tail = pts.slice(Math.floor(pts.length * 0.66))
  const n = tail.length
  const mx = (n - 1) / 2
  const my = tail.reduce((a, p) => a + p.v, 0) / n
  const slope = tail.reduce((a, p, i) => a + (i - mx) * (p.v - my), 0) / tail.reduce((a, _, i) => a + (i - mx) ** 2, 0)
  const x0 = (Math.floor(pts.length * 0.66) / (pts.length - 1)) * 300
  const yStart = my - slope * mx
  const yEnd = my + slope * (n - 1)
  const ticks = [hi, lo + (hi - lo) * (2 / 3), lo + (hi - lo) / 3, lo].map((t) => Math.round(t * 10) / 10)
  const labels = [0, 1 / 3, 2 / 3, 1].map((f) => {
    const sec = (tAbs - windowSec + windowSec * f) % 86400
    const h = Math.floor(((sec + 86400) % 86400) / 3600)
    const mm = Math.floor((((sec + 86400) % 86400) % 3600) / 60)
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px]">{m.label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">
            норма <span className="font-mono">{m.norm}</span>
          </span>
          <span className="font-mono text-[15px]">
            {formatNumber(v, m.digits)} {m.unit}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-[26px_minmax(0,1fr)_58px] gap-1.5">
        <div className="relative h-[110px] font-mono text-[11px] text-muted-foreground">
          {ticks.map((t, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 3) * 100}%` }}>
              {formatNumber(t, t % 1 ? 1 : 0)}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="relative h-[110px]">
            {[0, 1 / 3, 2 / 3].map((f) => (
              <div key={f} className="absolute inset-x-0 h-px bg-border" style={{ top: `${f * 100}%` }} />
            ))}
            <div className="absolute inset-x-0 bottom-0 h-px bg-switch-off" />
            {m.hi !== undefined && <div className="absolute inset-x-0 -right-[62px] border-t-[1.5px] border-dashed border-chart-plan" style={{ top: `${y(m.hi)}%` }} />}
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <line x1={x0} y1={y(yStart)} x2={300} y2={y(yEnd)} stroke="var(--chart-3)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" strokeWidth={1.5} />
              <polyline points={poly} fill="none" stroke="var(--brand)" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" />
            </svg>
            <span className="absolute left-full size-[9px] -translate-1/2 rounded-full bg-brand shadow-[0_0_0_3px_var(--brand-soft)]" style={{ top: `${y(v)}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
            {labels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>
        <div className="relative h-[110px]">
          {m.hi !== undefined && (
            <span className="absolute left-2 -translate-y-[130%] bg-card font-mono text-[11px] whitespace-nowrap text-muted-foreground" style={{ top: `${y(m.hi)}%` }}>
              Порог {formatNumber(m.hi, m.hi % 1 ? 1 : 0)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 bg-brand" />
          значение
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dashed border-chart-3" />
          тренд
        </span>
      </div>
    </div>
  )
}
