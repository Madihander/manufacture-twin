import { useRef, useState } from 'react'
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { SHIFT_LEN } from '@/sim/model'
import { SPEEDS, useSim } from '@/store/sim'
import { StatusBadge } from './primitives'
import { focusIncidentObject } from './focus'

/** Нижняя панель: пуск/пауза, время модели, таймлайн смены с событиями, скорость. */
export function SimBar() {
  const playing = useSim((s) => s.playing)
  const togglePlay = useSim((s) => s.togglePlay)
  const reset = useSim((s) => s.reset)
  const speed = useSim((s) => s.speed)
  const setSpeed = useSim((s) => s.setSpeed)

  return (
    <footer className="relative z-30 flex h-[72px] flex-none items-center gap-5 border-t bg-card px-6">
      <div className="flex gap-2">
        <Button onClick={togglePlay} className="w-28">
          {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
          {playing ? 'Пауза' : 'Пуск'}
        </Button>
        <Button variant="secondary" size="icon" title="Сброс к 21:42" onClick={reset}>
          <RotateCcwIcon className="size-[17px]" />
        </Button>
      </div>
      <div className="h-9 w-px bg-border" />
      <SimClock />
      <Timeline />
      <div className="flex flex-none items-center gap-2.5">
        <span className="text-xs text-muted-foreground">Скорость</span>
        <div className="flex overflow-hidden rounded-md border">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                'h-[34px] min-w-11 border-r px-2.5 font-mono text-xs font-medium last:border-r-0',
                speed === s ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-none items-center gap-2 text-xs text-muted-foreground">
        <kbd className="flex h-6 items-center rounded-[5px] border border-b-2 px-2 font-mono text-[11px] text-foreground">Space</kbd>
        пауза
      </div>
    </footer>
  )
}

function SimClock() {
  const t = useSim((s) => Math.floor(s.t))
  const speed = useSim((s) => s.speed)
  return (
    <div className="flex w-[196px] flex-none flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className="overline text-[11px]">Модель · смена 2</span>
        <span className="rounded-sm bg-brand-soft px-1.5 font-mono text-[10px] font-medium text-primary">{speed}×</span>
      </span>
      <span className="font-mono text-[15px] whitespace-nowrap">15.10.2026 · {clockText(t)}</span>
    </div>
  )
}

function Timeline() {
  const run = useSim((s) => s.run)
  const pos = useSim((s) => s.t / SHIFT_LEN)
  const setT = useSim((s) => s.setT)
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<string | null>(null)

  const seek = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    setT(((clientX - r.left) / r.width) * SHIFT_LEN)
  }

  return (
    <div
      ref={ref}
      className="relative h-12 min-w-0 flex-1 cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seek(e.clientX)
      }}
      onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
      role="slider"
      aria-label="Время смены"
      aria-valuemin={0}
      aria-valuemax={SHIFT_LEN}
      aria-valuenow={Math.round(pos * SHIFT_LEN)}
    >
      <div className="absolute inset-x-0 top-[22px] h-1.5 rounded-full bg-border" />
      <div className="absolute left-0 top-[22px] h-1.5 rounded-full bg-brand" style={{ width: `${pos * 100}%` }} />
      {run.incidents.map((inc) => {
        const left = (inc.start / SHIFT_LEN) * 100
        const status = inc.severity === 'alarm' ? 'alarm' : 'warn'
        return (
          <div
            key={inc.id}
            className="absolute top-0.5 z-[2] -ml-2 flex h-5 w-4 justify-center"
            style={{ left: `${left}%` }}
            onPointerEnter={() => setHover(inc.id)}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => {
              e.stopPropagation()
              setT(inc.start)
              focusIncidentObject(inc.objectId, inc.section)
            }}
          >
            <span className={cn('h-[13px] w-1 rounded-[2px]', status === 'alarm' ? 'bg-alarm' : 'bg-warn')} />
            {hover === inc.id && (
              <div className="absolute bottom-[calc(100%+8px)] left-1/2 flex w-[230px] -translate-x-1/2 cursor-default flex-col gap-1.5 rounded-[10px] border bg-card px-3 py-2.5 shadow-popover">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span>
                    {clockText(inc.start, false)} · {inc.objectId}
                  </span>
                  <span className="text-muted-foreground">{inc.downtime ? `${Math.round(inc.downtime / 60)} мин` : '—'}</span>
                </div>
                <span className="text-[13px] font-medium">{inc.title}</span>
                <StatusBadge status={status} className="h-[22px] self-start" />
              </div>
            )}
          </div>
        )
      })}
      <div className="absolute top-4 z-[3] -ml-[9px] size-[18px] rounded-full border-2 border-primary bg-card" style={{ left: `${pos * 100}%` }} />
      <div className="absolute inset-x-0 top-[34px] flex justify-between font-mono text-[11px] text-muted-foreground">
        {['16:00', '18:00', '20:00', '22:00', '00:00'].map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  )
}
