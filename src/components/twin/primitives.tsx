import type { ReactNode } from 'react'
import { CarIcon, FlameIcon, PackageIcon, PaintRollerIcon, ShieldCheckIcon, WrenchIcon } from 'lucide-react'
import type { SectionId } from '@/data/plant'
import { cn } from '@/lib/utils'
import type { Status } from '@/sim/metrics'

export const STATUS_TEXT: Record<Status, string> = { ok: 'Норма', warn: 'Внимание', alarm: 'Авария' }

export const STATUS_CLASS: Record<Status, { dot: string; soft: string; fg: string; border: string }> = {
  ok: { dot: 'bg-ok', soft: 'bg-ok-soft', fg: 'text-ok-fg', border: 'border-ok' },
  warn: { dot: 'bg-warn', soft: 'bg-warn-soft', fg: 'text-warn-fg', border: 'border-warn' },
  alarm: { dot: 'bg-alarm', soft: 'bg-alarm-soft', fg: 'text-alarm-fg', border: 'border-alarm' },
}

export const SECTION_ICON: Record<SectionId, typeof PackageIcon> = {
  'wh-in': PackageIcon,
  welding: FlameIcon,
  painting: PaintRollerIcon,
  assembly: WrenchIcon,
  qc: ShieldCheckIcon,
  'wh-out': CarIcon,
}

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn('size-1.5 flex-none rounded-full', STATUS_CLASS[status].dot, className)} />
}

/** Мягкий бейдж: точка + слово. */
export function StatusBadge({ status, children, className }: { status: Status; children?: ReactNode; className?: string }) {
  const c = STATUS_CLASS[status]
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', c.soft, c.fg, className)}>
      <span className={cn('size-1.5 rounded-full', c.dot)} />
      {children ?? STATUS_TEXT[status]}
    </span>
  )
}

/** Строчный статус для таблиц и подписей. */
export function StatusInline({ status, children, className }: { status: Status; children?: ReactNode; className?: string }) {
  const c = STATUS_CLASS[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', c.fg, className)}>
      <span className={cn('size-1.5 flex-none rounded-full', c.dot)} />
      {children ?? STATUS_TEXT[status]}
    </span>
  )
}

export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('overline', className)}>{children}</span>
}

/** Крупная цифра KPI в стиле макета: Inter Light, navy. */
export function BigNumber({ value, unit, size = 34, className }: { value: ReactNode; unit?: ReactNode; size?: number; className?: string }) {
  return (
    <span className={cn('flex items-baseline gap-1 whitespace-nowrap', className)}>
      <span className="leading-none font-light tracking-[-0.02em] text-primary" style={{ fontSize: size }}>
        {value}
      </span>
      {unit !== undefined && <span className="text-base text-muted-foreground">{unit}</span>}
    </span>
  )
}

export function KpiTile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border px-3.5 py-3', className)}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function ProgressLine({ value, className, barClass = 'bg-brand', height = 6 }: { value: number; className?: string; barClass?: string; height?: number }) {
  return (
    <div className={cn('overflow-hidden rounded-full bg-border', className)} style={{ height }}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', barClass)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

export function Divider() {
  return <div className="h-px flex-none bg-border" />
}

export function PanelSection({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

/** Спарклайн с коридором нормы и пунктиром порога. Координаты — в единицах значения. */
export function Sparkline({
  values,
  lo,
  hi,
  min,
  max,
  height = 36,
  className,
}: {
  values: number[]
  lo?: number
  hi?: number
  min?: number
  max?: number
  height?: number
  className?: string
}) {
  const vmin = min ?? Math.min(...values, lo ?? Infinity, hi ?? Infinity) * 0.98
  const vmax = max ?? Math.max(...values, hi ?? -Infinity, lo ?? -Infinity) * 1.02
  const y = (v: number) => 40 - ((v - vmin) / Math.max(1e-9, vmax - vmin)) * 40
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 300},${y(v).toFixed(2)}`).join(' ')
  const bandTop = hi !== undefined ? y(hi) : 0
  const bandBottom = lo !== undefined ? y(lo) : 40
  return (
    <svg viewBox="0 0 300 40" preserveAspectRatio="none" className={cn('block w-full', className)} style={{ height }}>
      <rect x="0" y={Math.max(0, bandTop)} width="300" height={Math.max(0, Math.min(40, bandBottom) - Math.max(0, bandTop))} fill="var(--skeleton)" />
      {hi !== undefined && bandTop > 0.5 && (
        <line x1="0" y1={bandTop} x2="300" y2={bandTop} stroke="var(--chart-plan)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeWidth={1} />
      )}
      <polyline points={pts} fill="none" stroke="var(--brand)" vectorEffect="non-scaling-stroke" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  )
}

/** Горизонтальный бар с пунктиром лимита (простои, причины брака). */
export function LimitBar({ value, max, limit, className }: { value: number; max: number; limit?: number; className?: string }) {
  return (
    <div className={cn('relative flex h-7 items-center', className)}>
      <div className={cn('h-2.5 rounded-r-[3px]', limit !== undefined && value > limit ? 'bg-alarm' : 'bg-brand')} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      {limit !== undefined && <div className="absolute inset-y-0 border-l-[1.5px] border-dashed border-chart-plan" style={{ left: `${(limit / max) * 100}%` }} />}
    </div>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono', className)}>{children}</span>
}
