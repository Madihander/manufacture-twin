import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CarIcon, MousePointerClickIcon, TriangleAlertIcon } from 'lucide-react'
import type { Group } from 'three'
import { Vector3 } from 'three'
import { focusObject } from '@/components/twin/focus'
import { STATUS_CLASS, STATUS_TEXT } from '@/components/twin/primitives'
import { SECTION_BY_ID, type SectionId } from '@/data/plant'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Status } from '@/sim/metrics'
import { SHIFT_START_SEC } from '@/sim/model'
import { isDown } from '@/sim/telemetry'
import { useTwin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import { carWorldPosition } from './Cars'
import { BLOCK_D, blockX, EQUIPMENT_POS, SECTION_ORDER, WALL_H } from './layout'

/** Подписи участков в стиле макета: плашка, ножка, точка привязки. */
export function Labels() {
  const twin = useTwin()
  const layers = useSim((s) => s.layers)
  const hover = useSim((s) => s.hoverSection)
  const setHover = useSim((s) => s.setHoverSection)
  const selection = useSim((s) => s.selection)

  return (
    <>
      {SECTION_ORDER.map((id, i) => {
          const k = twin.sectionById[id]
          const s = SECTION_BY_ID[id]
          const active = hover === id || (selection?.kind === 'section' && selection.id === id)
          return (
            <Html key={id} position={[blockX(i), WALL_H + 0.1, -BLOCK_D / 2 + 0.4]} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
              {/* Html не размонтируем при выключении слоя — только скрываем (см. SelectionLabel). */}
              <div
                hidden={!layers.labels}
                className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center"
                onPointerEnter={() => setHover(id)}
                onPointerLeave={() => setHover(null)}
                onClick={() => focusObject({ section: id })}
              >
                {hover === id && <HoverCard id={id} />}
                <LabelPill code={s.code} text={s.short} status={k.status} active={active} />
                <div className={cn('h-14 w-px', k.status === 'alarm' ? 'bg-alarm' : active ? 'bg-brand' : 'bg-chart-plan')} />
                <div className={cn('-mb-[3px] size-[7px] rounded-full border-[1.5px] bg-card', k.status === 'alarm' ? 'border-alarm' : active ? 'border-brand' : 'border-chart-plan')} />
              </div>
            </Html>
          )
        })}
      <SelectionLabel />
    </>
  )
}

function LabelPill({ code, text, status, active }: { code: string; text: string; status: Status; active: boolean }) {
  const c = STATUS_CLASS[status]
  const alarm = status === 'alarm'
  return (
    <div
      className={cn(
        'flex h-[30px] items-center gap-2 rounded-sm border bg-card px-2.5 font-mono text-xs whitespace-nowrap shadow-[0_1px_2px_rgba(15,27,42,0.06)]',
        active ? 'border-brand shadow-[0_0_0_4px_var(--brand-soft)]' : alarm ? 'border-alarm' : 'border-border',
      )}
    >
      {alarm ? <TriangleAlertIcon className="size-3.5 text-alarm" strokeWidth={2.25} /> : <span className={cn('size-[7px] rounded-full', c.dot)} />}
      <span>{code}</span>
      <span className="text-chart-plan">·</span>
      <span className="font-sans text-[13px]">{text}</span>
      <span className="h-3.5 w-px bg-border" />
      <span className={cn('font-sans text-xs font-medium', c.fg)}>{STATUS_TEXT[status]}</span>
    </div>
  )
}

function HoverCard({ id }: { id: SectionId }) {
  const { sectionById } = useTwin()
  const k = sectionById[id]
  const s = SECTION_BY_ID[id]
  const c = STATUS_CLASS[k.status]
  return (
    <div className="absolute bottom-[71px] left-[calc(100%+12px)] flex w-[264px] cursor-default flex-col gap-3 rounded-lg border bg-card px-4 py-3.5 shadow-toast">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-medium">{s.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
        </div>
        <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', c.soft, c.fg)}>
          <span className={cn('size-1.5 rounded-full', c.dot)} />
          {STATUS_TEXT[k.status]}
        </span>
      </div>
      <div className="flex flex-col gap-2 text-[13px]">
        {!Number.isNaN(k.oee) && (
          <Row label="OEE" value={`${formatNumber(k.oee * 100, 1)} %`} />
        )}
        {!Number.isNaN(k.oee) && <Row label="План / факт смены" value={`${Math.round(k.planToNow)} / ${k.fact}`} />}
        {id === 'wh-in' && <Row label="Запас комплектов" value={`${k.kits} · ${formatNumber(k.supplyHours ?? 0, 1)} ч`} />}
        {id === 'wh-out' && <Row label="Готово за смену" value={String(k.ready)} />}
        <Row label="Активные инциденты" value={String(k.incidents.length)} />
      </div>
      <div className="flex items-center gap-1.5 border-t pt-2.5 text-xs text-muted-foreground">
        <MousePointerClickIcon className="size-3.5" />
        Клик — подробности
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

/**
 * Подпись выбранного оборудования или кузова. Html смонтирован постоянно и только меняет содержимое:
 * монтирование/размонтирование отдельного React-корня drei Html во время рендера даёт гонку в React 19.
 */
function SelectionLabel() {
  const group = useRef<Group>(null)
  const selection = useSim((s) => s.selection)
  const v = useRef(new Vector3())
  useFrame(() => {
    const g = group.current
    if (!g) return
    const sel = useSim.getState().selection
    if (sel?.kind === 'equipment' && EQUIPMENT_POS[sel.id]) {
      const p = EQUIPMENT_POS[sel.id]
      g.position.set(p[0], 1.25, p[2])
    } else if (sel?.kind === 'car' && carWorldPosition(sel.id, useSim.getState().t, v.current)) {
      g.position.set(v.current.x, v.current.y + 0.9, v.current.z)
    }
  })
  return (
    <group ref={group}>
      <Html zIndexRange={[30, 25]} style={{ pointerEvents: 'none' }}>
        {selection?.kind === 'equipment' && EQUIPMENT_POS[selection.id] ? (
          <EquipmentPill id={selection.id} />
        ) : selection?.kind === 'car' ? (
          <CarPill id={selection.id} />
        ) : null}
      </Html>
    </group>
  )
}

function EquipmentPill({ id }: { id: string }) {
  const t = useSim((s) => Math.floor(s.t / 10) * 10)
  const { predictions } = useTwin()
  const down = isDown(id, SHIFT_START_SEC + t)
  const pred = predictions.find((p) => p.equipmentId === id)
  const status: Status = down ? 'alarm' : pred?.level === 'crit' ? 'warn' : 'ok'
  const c = STATUS_CLASS[status]
  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center">
      <div className="flex h-[30px] items-center gap-2 rounded-sm border-[1.5px] border-brand bg-card px-2.5 font-mono text-xs whitespace-nowrap shadow-[0_0_0_4px_var(--brand-soft)]">
        <span className={cn('size-[7px] rounded-full', c.dot)} />
        {id}
        <span className="h-3.5 w-px bg-border" />
        <span className={cn('font-sans text-xs font-medium', c.fg)}>{down ? 'Стоит' : STATUS_TEXT[status]}</span>
      </div>
      <div className="h-11 w-px bg-brand" />
      <div className="-mb-[3px] size-[7px] rounded-full bg-brand" />
    </div>
  )
}

function CarPill({ id }: { id: number }) {
  const run = useSim((s) => s.run)
  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center">
      <div className="flex h-[30px] items-center gap-2 rounded-sm border-[1.5px] border-brand bg-card px-2.5 font-mono text-xs whitespace-nowrap shadow-[0_0_0_4px_var(--brand-soft)]">
        <CarIcon className="size-3.5 text-brand" />
        {run.cars.get(id)?.code}
      </div>
      <div className="h-11 w-px bg-brand" />
      <div className="-mb-[3px] size-[7px] rounded-full bg-brand" />
    </div>
  )
}
