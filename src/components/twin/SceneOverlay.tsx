import { useState } from 'react'
import { CrosshairIcon, ExpandIcon, LayersIcon, MinusIcon, MouseIcon, PlusIcon, ScanIcon, XIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CAR_MODELS, SECTIONS } from '@/data/plant'
import { cn } from '@/lib/utils'
import { snapshotAt } from '@/sim/engine'
import { TAKT } from '@/sim/model'
import { useTwin } from '@/sim/useTwin'
import { type HeatMode, type Layers, useSim } from '@/store/sim'
import { focusObject } from './focus'
import { STATUS_CLASS } from './primitives'

const LAYER_LABELS: [keyof Layers, string][] = [
  ['flow', 'Потоки материалов'],
  ['labels', 'Подписи участков'],
  ['equipment', 'Оборудование'],
  ['cars', 'Кузова'],
]

const HEAT: [HeatMode, string][] = [
  ['off', 'Выкл'],
  ['oee', 'OEE'],
  ['defect', 'Брак'],
  ['risk', 'Риск'],
]

/** HTML-слой поверх 3D: заголовок, панель инструментов, слои, мини-карта, подсказка. */
export function SceneOverlay({ onFullscreen }: { onFullscreen: () => void }) {
  const modelFilter = useSim((s) => s.modelFilter)
  const model = modelFilter === 'all' ? 'Все модели' : CAR_MODELS[modelFilter].name
  return (
    <>
      <div className="pointer-events-none absolute top-[22px] left-6 z-10 flex flex-col gap-2">
        <div className="flex gap-2.5 font-mono text-xs tracking-[0.12em] text-muted-foreground">
          <span>ГЛАВНЫЙ КОРПУС</span>
          <span className="text-[#b8c2cf]">|</span>
          <span>ЛИНИЯ 1</span>
        </div>
        <div className="text-[34px] leading-tight tracking-[-0.02em]">Сборочное производство</div>
        <div className="text-sm text-muted-foreground">
          {model} · такт <span className="font-mono text-foreground">{Math.floor(TAKT / 60)}:{String(TAKT % 60).padStart(2, '0')}</span> мин
        </div>
      </div>
      <Toolbar onFullscreen={onFullscreen} />
      <MiniMap />
      <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-2 rounded-full border bg-white/85 px-3.5 text-xs whitespace-nowrap text-muted-foreground">
        <MouseIcon className="size-3.5" />
        Перетащите — вращение · Колесо — масштаб · Клик по участку — детали
      </div>
    </>
  )
}

function Toolbar({ onFullscreen }: { onFullscreen: () => void }) {
  const cameraCmd = useSim((s) => s.cameraCmd)
  const selection = useSim((s) => s.selection)
  const following = selection?.kind === 'car'

  const followCar = () => {
    const s = useSim.getState()
    if (following) {
      s.select(null)
      s.cameraCmd({ type: 'fit' })
      return
    }
    // Берём кузов, который сейчас в окраске (самый наглядный маршрут), иначе любой на линии.
    const snap = snapshotAt(s.run, s.t)
    let pick = -1
    for (let k = 0; k < snap.carIds.length; k++) if (snap.carLoc[k] === 3) pick = snap.carIds[k]
    if (pick < 0) for (let k = 0; k < snap.carIds.length; k++) if (snap.carLoc[k] % 2 === 1 && snap.carLoc[k] < 8) pick = snap.carIds[k]
    if (pick >= 0) s.select({ kind: 'car', id: pick })
  }

  return (
    <div className="absolute top-1/2 right-4 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-[10px] border bg-card p-1">
      <LayersPopover />
      <ToolButton name="Следить за кузовом" active={following} onClick={followCar}>
        <CrosshairIcon />
      </ToolButton>
      <ToolButton name="Показать всё" onClick={() => cameraCmd({ type: 'fit' })}>
        <ScanIcon />
      </ToolButton>
      <div className="mx-1.5 my-[3px] h-px bg-border" />
      <ToolButton name="Приблизить" onClick={() => cameraCmd({ type: 'zoom', factor: 1.35 })}>
        <PlusIcon />
      </ToolButton>
      <ToolButton name="Отдалить" onClick={() => cameraCmd({ type: 'zoom', factor: 1 / 1.35 })}>
        <MinusIcon />
      </ToolButton>
      <div className="mx-1.5 my-[3px] h-px bg-border" />
      <ToolButton name="Полный экран" onClick={onFullscreen}>
        <ExpandIcon />
      </ToolButton>
    </div>
  )
}

function ToolButton({ name, active, onClick, children }: { name: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={name}
          onClick={onClick}
          className={cn(
            'flex size-9 items-center justify-center rounded-[7px] [&_svg]:size-[18px]',
            active ? 'bg-brand-soft text-brand-strong' : 'text-foreground hover:bg-muted',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{name}</TooltipContent>
    </Tooltip>
  )
}

function LayersPopover() {
  const [open, setOpen] = useState(false)
  const layers = useSim((s) => s.layers)
  const setLayer = useSim((s) => s.setLayer)
  const heat = useSim((s) => s.heat)
  const setHeat = useSim((s) => s.setHeat)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Слои"
              className={cn('flex size-9 items-center justify-center rounded-[7px] [&_svg]:size-[18px]', open || heat !== 'off' ? 'bg-brand-soft text-brand-strong' : 'hover:bg-muted')}
            >
              <LayersIcon />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">Слои</TooltipContent>
      </Tooltip>
      <PopoverContent side="left" align="start" sideOffset={14} className="w-[268px] gap-3 rounded-lg p-3.5 shadow-toast">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Слои</span>
          <button type="button" onClick={() => setOpen(false)} className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted">
            <XIcon className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {LAYER_LABELS.map(([key, label]) => (
            <label key={key} className="flex h-[34px] cursor-pointer items-center gap-2.5 rounded-sm px-1.5 text-sm hover:bg-muted">
              <Checkbox checked={layers[key]} onCheckedChange={(v) => setLayer(key, v === true)} />
              {label}
            </label>
          ))}
        </div>
        <div className="h-px bg-border" />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-muted-foreground">Тепловая карта</span>
          <div className="grid grid-cols-4 overflow-hidden rounded-md border">
            {HEAT.map(([h, label]) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeat(h)}
                className={cn('h-8 border-r text-xs font-medium last:border-r-0', heat === h ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MiniMap() {
  const { sectionById } = useTwin()
  const selection = useSim((s) => s.selection)
  return (
    <div className="absolute bottom-6 left-6 z-10 flex w-[184px] flex-col gap-2 rounded-[10px] border bg-card px-3 pt-2.5 pb-3">
      <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground">ПЛАН ЦЕХА</span>
      <div className="relative h-24 rounded-sm bg-muted">
        <div className="absolute inset-x-1.5 top-[47px] h-0.5 bg-switch-off" />
        <div className="absolute inset-x-2 inset-y-[22px] grid grid-cols-6 gap-[5px]">
          {SECTIONS.map((s) => {
            const st = sectionById[s.id].status
            const sel = selection?.kind === 'section' && selection.id === s.id
            return (
              <button
                key={s.id}
                type="button"
                title={s.name}
                onClick={() => focusObject({ section: s.id })}
                className={cn(
                  'rounded-[2px] border',
                  sel ? 'border-brand bg-brand-soft' : st === 'alarm' ? cn(STATUS_CLASS.alarm.soft, 'border-alarm') : st === 'warn' ? 'border-warn bg-card' : 'border-[#b8c2cf] bg-card',
                )}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
