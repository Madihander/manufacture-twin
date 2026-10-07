import { cloneElement, type ReactElement, type ReactNode } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

// Общий стиль графиков из дизайн-системы: подписи — JetBrains Mono 11, сетка только горизонтальная.
const AXIS = { fontSize: 11, fontFamily: 'JetBrains Mono Variable, monospace', fill: '#5b6b7f' }
/** В печатном отчёте подписи мельче, чтобы даты не слипались. */
const AXIS_PRINT = { ...AXIS, fontSize: 9 }
const GRID = { stroke: '#e3e8ef', vertical: false }
/**
 * Адаптивный график на экране; в печатном отчёте — фиксированного размера
 * (ResponsiveContainer в скрытом блоке получает нулевую ширину, и график пропадает).
 */
function ChartBox({ size, height, children }: { size?: ChartSize; height: number; children: ReactElement<{ width?: number; height?: number }> }) {
  if (size) return cloneElement(children, { width: size.width, height: size.height })
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  )
}

export interface ChartSize {
  width: number
  height: number
}

export const SERIES = { welding: '#0b3b60', painting: '#0088cc', assembly: '#7cc4e8' } as const
export const SECTION_NAME = { welding: 'Сварка', painting: 'Окраска', assembly: 'Сборка' } as const

export function ChartCard({ title, subtitle, legend, children, className }: { title: string; subtitle: string; legend?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-lg border bg-card px-5 py-[18px]', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[3px]">
          <span className="text-base font-medium">{title}</span>
          <span className="text-[13px] text-muted-foreground">{subtitle}</span>
        </div>
        {legend && <div className="flex flex-wrap justify-end gap-3.5 text-xs text-muted-foreground">{legend}</div>}
      </div>
      {children}
    </div>
  )
}

export function LegendItem({ color, label, line, dashed }: { color: string; label: string; line?: boolean; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {line || dashed ? (
        <span className="w-3.5" style={{ borderTop: `${dashed ? '1.5px dashed' : '2px solid'} ${color}` }} />
      ) : (
        <span className="size-2 rounded-[2px]" style={{ background: color }} />
      )}
      {label}
    </span>
  )
}

interface TipRow {
  name: string
  value: string
  color: string
  fg?: string
}

function TipBox({ title, rows, footer }: { title: string; rows: TipRow[]; footer?: ReactNode }) {
  return (
    <div className="flex w-[190px] flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5 shadow-[0_4px_12px_rgba(15,27,42,0.08)]">
      <span className="font-mono text-[11px] text-muted-foreground">{title}</span>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-xs">
          <span className="size-2 rounded-[2px]" style={{ background: r.color }} />
          <span className="flex-1">{r.name}</span>
          <span className="font-mono" style={{ color: r.fg }}>
            {r.value}
          </span>
        </div>
      ))}
      {footer && <div className="flex justify-between border-t pt-1.5 text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
}

type Sec = keyof typeof SERIES

/** План/факт по линиям: сгруппированные столбцы + пунктир плана. */
export function PlanFactChart({ data, sections, plan, size }: { data: Record<string, number | string>[]; sections: Sec[]; plan: number; size?: ChartSize }) {
  // Верхнюю границу считаем сами: функция в domain в Recharts 3 получает другие аргументы.
  const maxFact = Math.max(0, ...data.flatMap((d) => sections.map((s) => Number(d[s]) || 0)))
  const top = Math.max(10, Math.ceil(Math.max(plan * 1.15, maxFact * 1.05) / 10) * 10)
  return (
    <ChartBox size={size} height={240}>
      <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 56, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={size ? 'preserveStartEnd' : 0} minTickGap={4} />
        <YAxis tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={false} domain={[0, top]} allowDataOverflow />
        <Tooltip
          cursor={{ fill: '#f5f7fa' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                title={`${label}.2026`}
                rows={payload.map((p) => ({ name: SECTION_NAME[p.dataKey as Sec], value: String(p.value), color: SERIES[p.dataKey as Sec], fg: Number(p.value) < plan ? '#a3352c' : undefined }))}
                footer={
                  <>
                    <span>План</span>
                    <span className="font-mono">{plan}</span>
                  </>
                }
              />
            ) : null
          }
        />
        <ReferenceLine y={plan} stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `План ${plan}`, position: 'right', ...AXIS }} />
        {sections.map((s) => (
          <Bar key={s} dataKey={s} fill={SERIES[s]} radius={[2, 2, 0, 0]} maxBarSize={12} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartBox>
  )
}

/** OEE по участкам: линии + цель; точки ниже цели — красные. */
export function OeeChart({ data, sections, target, size }: { data: Record<string, number | string>[]; sections: Sec[]; target: number; size?: ChartSize }) {
  return (
    <ChartBox size={size} height={240}>
      <LineChart data={data} margin={{ top: 8, right: 64, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={size ? 'preserveStartEnd' : 0} minTickGap={4} />
        <YAxis tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={false} domain={[60, 100]} ticks={[60, 70, 80, 90, 100]} />
        <Tooltip
          cursor={{ stroke: '#cbd5e1' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                title={`${label}.2026`}
                rows={payload.map((p) => ({
                  name: SECTION_NAME[p.dataKey as Sec],
                  value: `${formatNumber(Number(p.value), 1)} %`,
                  color: SERIES[p.dataKey as Sec],
                  fg: Number(p.value) < target ? '#a3352c' : undefined,
                }))}
              />
            ) : null
          }
        />
        <ReferenceLine y={target} stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Цель ${target} %`, position: 'right', ...AXIS }} />
        {sections.map((s) => (
          <Line
            key={s}
            dataKey={s}
            stroke={SERIES[s]}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; value?: number; index?: number }) => {
              const low = (props.value ?? 100) < target
              return <circle key={`${s}-${props.index}`} cx={props.cx} cy={props.cy} r={low ? 3.5 : 2.5} fill={low ? '#fbeae8' : '#fff'} stroke={low ? '#c8453b' : SERIES[s]} strokeWidth={1.5} />
            }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartBox>
  )
}

/** Брак по участкам за период: столбцы + порог. */
export function DefectChart({ data, threshold, size }: { data: { name: string; rate: number; defects: number; produced: number }[]; threshold: number; size?: ChartSize }) {
  const max = Math.max(threshold * 2, ...data.map((d) => d.rate)) * 1.2
  return (
    <ChartBox size={size} height={240}>
      <BarChart data={data} margin={{ top: 22, right: 64, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="name" tick={{ ...AXIS, fontFamily: 'Inter Variable, sans-serif', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
        <YAxis tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={false} domain={[0, Math.ceil(max)]} tickFormatter={(v) => `${v}`} />
        <Tooltip
          cursor={{ fill: '#f5f7fa' }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as (typeof data)[number] | undefined
            return active && d ? (
              <TipBox
                title={d.name}
                rows={[
                  { name: 'Брак', value: `${formatNumber(d.rate, 1)} %`, color: d.rate > threshold ? '#c8453b' : '#0088cc' },
                  { name: 'Дефектов', value: `${d.defects} из ${d.produced}`, color: 'transparent' },
                ]}
              />
            ) : null
          }}
        />
        <ReferenceLine y={threshold} stroke="#c8453b" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Порог ${formatNumber(threshold, 0)} %`, position: 'right', ...AXIS }} />
        <Bar dataKey="rate" radius={[3, 3, 0, 0]} maxBarSize={64} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.rate > threshold ? '#c8453b' : '#0088cc'} />
          ))}
          <LabelList dataKey="rate" position="top" formatter={(v) => formatNumber(Number(v), 1)} style={{ ...AXIS, fontSize: 12, fill: '#0f1b2a' }} />
        </Bar>
      </BarChart>
    </ChartBox>
  )
}

/** Парето простоев: минуты по причинам + накопленная доля. */
export function ParetoChart({ data, size }: { data: { reason: string; minutes: number; cum: number }[]; size?: ChartSize }) {
  return (
    <ChartBox size={size} height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="reason" tick={{ ...AXIS, fontFamily: 'Inter Variable, sans-serif', fontSize: size ? 8.5 : 11 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} height={44} tickFormatter={(v: string) => { const max = size ? 13 : 16; return v.length > max ? `${v.slice(0, max - 1)}…` : v }} />
        <YAxis yAxisId="m" tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={false} />
        <YAxis yAxisId="c" orientation="right" tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v} %`} />
        <Tooltip
          cursor={{ fill: '#f5f7fa' }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as (typeof data)[number] | undefined
            return active && d ? (
              <TipBox
                title={d.reason}
                rows={[
                  { name: 'Простой', value: `${d.minutes} мин`, color: '#0088cc' },
                  { name: 'Накопительно', value: `${formatNumber(d.cum, 0)} %`, color: '#0b3b60' },
                ]}
              />
            ) : null
          }}
        />
        <Bar yAxisId="m" dataKey="minutes" fill="#0088cc" radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false} />
        <Line yAxisId="c" dataKey="cum" stroke="#0b3b60" strokeWidth={2} dot={{ r: 3, fill: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
      </ComposedChart>
    </ChartBox>
  )
}

/** Прогноз накопленного выпуска до конца месяца. */
export function ForecastChart({ data, target, size }: { data: { day: number; actual?: number; forecast?: number; band?: [number, number] }[]; target: number; size?: ChartSize }) {
  const peak = Math.max(target, ...data.map((d) => d.band?.[1] ?? d.forecast ?? d.actual ?? 0))
  const step = peak > 3000 ? 1500 : peak > 1200 ? 500 : 250
  const yTop = Math.ceil((peak * 1.05) / (step * 4)) * step * 4
  return (
    <ChartBox size={size} height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 70, left: -2, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="day" tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tickFormatter={(d) => `${String(d).padStart(2, '0')}.10`} interval={1} />
        <YAxis tick={size ? AXIS_PRINT : AXIS} tickLine={false} axisLine={false} domain={[0, yTop]} ticks={[0, 1, 2, 3, 4].map((k) => (yTop / 4) * k)} tickFormatter={(v) => formatNumber(v)} width={52} />
        <Tooltip
          cursor={{ stroke: '#cbd5e1' }}
          content={({ active, payload, label }) => {
            const d = payload?.[0]?.payload as (typeof data)[number] | undefined
            if (!active || !d) return null
            const rows: TipRow[] = []
            if (d.actual !== undefined) rows.push({ name: 'Факт', value: formatNumber(d.actual), color: '#0b3b60' })
            if (d.forecast !== undefined && d.actual === undefined) rows.push({ name: 'Прогноз', value: formatNumber(d.forecast), color: '#0088cc' })
            if (d.band) rows.push({ name: 'Коридор', value: `${formatNumber(d.band[0])}–${formatNumber(d.band[1])}`, color: '#e6f3fa' })
            return <TipBox title={`${String(label).padStart(2, '0')}.10.2026`} rows={rows} />
          }}
        />
        <Area dataKey="band" stroke="none" fill="#0088cc" fillOpacity={0.12} isAnimationActive={false} />
        <ReferenceLine y={target} stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Цель ${formatNumber(target)}`, position: 'right', ...AXIS }} />
        <Line dataKey="actual" stroke="#0b3b60" strokeWidth={2.25} dot={false} isAnimationActive={false} connectNulls />
        <Line dataKey="forecast" stroke="#0088cc" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ChartBox>
  )
}

/** Мини-спарклайн для карточек KPI. */
export function MiniSpark({ values, color = '#0088cc', reference }: { values: number[]; color?: string; reference?: number }) {
  if (values.length < 2) return <svg className="h-7 w-24" />
  const all = reference !== undefined ? [...values, reference] : values
  const min = Math.min(...all)
  const max = Math.max(...all)
  const y = (v: number) => 26 - ((v - min) / Math.max(1e-9, max - min)) * 24
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 96},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 96 28" preserveAspectRatio="none" className="block h-7 w-24 flex-none">
      {reference !== undefined && <line x1="0" x2="96" y1={y(reference)} y2={y(reference)} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} />
    </svg>
  )
}
