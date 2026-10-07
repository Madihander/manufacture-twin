import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MapIcon, PlayIcon, RotateCcwIcon, SaveIcon, SquareIcon, TrashIcon, TriangleAlertIcon } from 'lucide-react'
import { notify } from '@/components/notify'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { type CarModelId, CAR_MODELS, EQUIPMENT, EQUIPMENT_BY_ID, SECTIONS, SECTION_BY_ID } from '@/data/plant'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { LOC_WH_OUT } from '@/sim/engine'
import { DEMO_START_T, SHIFT_LEN, STATIONS } from '@/sim/model'
import {
  baseline,
  bottleneckText,
  DEFAULT_INPUT,
  INCIDENT_TYPES,
  type IncidentType,
  MARGIN_KZT,
  type MixMode,
  type Outcome,
  outputCurve,
  runScenario,
  type ScenarioInput,
} from '@/sim/scenario'
import { useScenarios } from '@/store/scenarios'
import { BASE_RUN, useSim } from '@/store/sim'

const AXIS = { fontSize: 11, fontFamily: 'JetBrains Mono Variable, monospace', fill: '#5b6b7f' }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function ScenariosScreen() {
  const base = useMemo(() => baseline(BASE_RUN), [])
  const [input, setInput] = useState<ScenarioInput>(DEFAULT_INPUT)
  const [result, setResult] = useState<Outcome | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [savedId, setSavedId] = useState<string | null>(null)
  const timer = useRef(0)
  const set = (p: Partial<ScenarioInput>) => {
    setInput((i) => ({ ...i, ...p }))
    setSavedId(null)
  }

  const run = (inp = input) => {
    clearInterval(timer.current)
    setRunning(true)
    setProgress(0)
    // Прогон смены занимает доли секунды; прогресс показывает «бег» модельного времени по смене.
    // Таймер, а не requestAnimationFrame: в фоновой вкладке rAF останавливается.
    const outcome = runScenario(inp)
    const t0 = performance.now()
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / 1100)
      setProgress(p)
      if (p >= 1) {
        clearInterval(timer.current)
        setResult(outcome)
        setRunning(false)
      }
    }, 30)
  }
  const stop = () => {
    clearInterval(timer.current)
    setRunning(false)
  }
  // Первый прогон — сразу и самый показательный: «ИИ предупредил, обрыва цепи не было».
  useEffect(() => {
    const first = useScenarios.getState().saved.find((x) => x.id === 'p1')
    if (first) {
      setInput(first.input)
      setSavedId(first.id)
      run(first.input)
    } else run(DEFAULT_INPUT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => clearInterval(timer.current), [])

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)_440px]">
      <Params input={input} set={set} onRun={() => run()} running={running} savedId={savedId} onLoad={(id, inp) => { setInput(inp); setSavedId(id); run(inp) }} />
      <FlowPanel input={input} result={result} running={running} progress={progress} onStop={stop} />
      <Results base={base} result={running ? null : result} input={input} name={useScenarios.getState().saved.find((x) => x.id === savedId)?.name} />
    </div>
  )
}

function Params({
  input,
  set,
  onRun,
  running,
  savedId,
  onLoad,
}: {
  input: ScenarioInput
  set: (p: Partial<ScenarioInput>) => void
  onRun: () => void
  running: boolean
  savedId: string | null
  onLoad: (id: string, input: ScenarioInput) => void
}) {
  const saved = useScenarios((s) => s.saved)
  const save = useScenarios((s) => s.save)
  const remove = useScenarios((s) => s.remove)
  const critical = EQUIPMENT.filter((e) => e.critical)
  const mixSum = input.mix.cobalt + input.mix.onix + input.mix.j7

  const setMix = (m: CarModelId, v: number) => {
    // Остальные доли пересчитываются пропорционально, сумма всегда 100 %.
    const others = (Object.keys(input.mix) as CarModelId[]).filter((k) => k !== m)
    const rest = 100 - v
    const prev = others.reduce((a, k) => a + input.mix[k], 0) || 1
    const next = { ...input.mix, [m]: v }
    let acc = 0
    others.forEach((k, i) => {
      next[k] = i === others.length - 1 ? rest - acc : Math.round((input.mix[k] / prev) * rest)
      acc += next[k]
    })
    set({ mix: next })
  }

  return (
    <aside className="flex min-h-0 flex-col border-r bg-card">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-5 pt-5 pb-4">
        <div className="flex flex-col gap-1">
          <span className="overline">Что если</span>
          <span className="text-[22px] tracking-[-0.01em]">Параметры сценария</span>
        </div>

        <Group title="Инцидент">
          <Field label="Оборудование">
            <Select value={input.equipmentId} onValueChange={(v) => set({ equipmentId: v })}>
              <SelectTrigger className="w-full text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {critical.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="text-[13px]">
                    <span className="font-mono">{e.id}</span>
                    <span className="text-muted-foreground"> · {SECTION_BY_ID[e.section].short}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Тип">
            <Select value={input.type} onValueChange={(v) => set({ type: v as IncidentType })}>
              <SelectTrigger className="w-full text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {INCIDENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-[13px]">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <SliderField label="Длительность" value={`${input.duration} мин`} min={0} max={180} step={5} v={input.duration} onChange={(v) => set({ duration: v })} marks={['0', '180 мин']} />
          <SliderField
            label="Время начала"
            value={clockText(input.start, false)}
            min={0}
            max={SHIFT_LEN - 15 * 60}
            step={300}
            v={input.start}
            onChange={(v) => set({ start: v })}
            marks={['16:00', '20:00', '00:00']}
          />
        </Group>

        <Group title="Производство">
          <Field label="Смен в сутки">
            <div className="grid grid-cols-2 overflow-hidden rounded-md border">
              {([2, 3] as const).map((n) => (
                <button key={n} type="button" onClick={() => set({ shifts: n })} className={cn('h-9 border-r text-[13px] font-medium last:border-r-0', input.shifts === n ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted')}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <SliderField label="Такт" value={`${mmss(input.takt)} мин`} min={180} max={360} step={15} v={input.takt} onChange={(v) => set({ takt: v })} marks={['3:00', '6:00']} />
          <SliderField
            label="Брак на окраске"
            value={input.paintDefect === null ? 'как в смене' : `${formatNumber(input.paintDefect, 1)} %`}
            min={0}
            max={8}
            step={0.5}
            v={input.paintDefect ?? 5}
            onChange={(v) => set({ paintDefect: v })}
            marks={['0', 'порог 2', '8 %']}
            alarm={input.paintDefect !== null && input.paintDefect > 2}
          />
          <Field label="Микс моделей">
            <Select value={input.mixMode} onValueChange={(v) => set({ mixMode: v as MixMode })}>
              <SelectTrigger className="w-full text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="plan">Как в плане</SelectItem>
                <SelectItem value="cobalt">Только Cobalt</SelectItem>
                <SelectItem value="custom">Свой</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {input.mixMode === 'custom' && (
            <div className="flex flex-col gap-3 rounded-md border bg-muted px-3 py-3">
              {(['onix', 'cobalt', 'j7'] as CarModelId[]).map((m) => (
                <div key={m} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs">
                    <span>{CAR_MODELS[m].name}</span>
                    <span className="font-mono">{input.mix[m]} %</span>
                  </div>
                  <Slider value={[input.mix[m]]} min={0} max={100} step={1} onValueChange={(v) => setMix(m, v[0])} />
                </div>
              ))}
              <span className="text-[11px] text-muted-foreground">
                Сумма <span className="font-mono text-foreground">{mixSum} %</span> — остальные доли пересчитываются автоматически
              </span>
            </div>
          )}
        </Group>

        <Group title="План">
          <Field label="Цель на месяц">
            <span className="flex h-[38px] items-center overflow-hidden rounded-md border focus-within:border-ring">
              <input
                inputMode="numeric"
                value={formatNumber(input.goal)}
                onChange={(e) => set({ goal: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-right font-mono text-sm outline-none"
              />
              <span className="flex h-full items-center border-l bg-muted px-3 text-xs text-muted-foreground">авто</span>
            </span>
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
            <Checkbox checked={input.saturdays} onCheckedChange={(v) => set({ saturdays: v === true })} />
            Учитывать субботние смены
          </label>
        </Group>

        <div className="flex flex-col gap-2.5">
          <span className="overline">Сохранённые сценарии</span>
          {saved.map((v) => (
            <div key={v.id} className={cn('group flex items-center gap-2 rounded-md border px-3 py-2', savedId === v.id ? 'border-brand bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]' : 'hover:bg-muted')}>
              <button type="button" onClick={() => onLoad(v.id, v.input)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="truncate text-[13px] font-medium">{v.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{v.date}</span>
              </button>
              <button type="button" title="Удалить" onClick={() => remove(v.id)} className="hidden size-7 items-center justify-center rounded-sm text-muted-foreground group-hover:flex hover:bg-card hover:text-alarm">
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="grid flex-none grid-cols-[1fr_auto_auto] gap-2 border-t px-5 py-3.5">
        <Button onClick={onRun} disabled={running}>
          <PlayIcon className="fill-current" />
          Запустить сценарий
        </Button>
        <Button variant="ghost" size="icon" title="Сбросить" onClick={() => set(DEFAULT_INPUT)}>
          <RotateCcwIcon />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          title="Сохранить"
          onClick={() => {
            const name = `${input.equipmentId} · ${input.type.toLowerCase()} ${input.duration} мин${input.shifts === 3 ? ' · 3 смены' : ''}`
            save(name, input)
            notify({ tone: 'ok', title: 'Сценарий сохранён', description: name })
          }}
        >
          <SaveIcon />
        </Button>
      </div>
    </aside>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border px-4 py-3.5">
      <span className="text-sm font-medium">{title}</span>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  v,
  onChange,
  marks,
  alarm,
}: {
  label: string
  value: string
  min: number
  max: number
  step: number
  v: number
  onChange: (v: number) => void
  marks: string[]
  alarm?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-mono text-[13px]', alarm && 'text-alarm-fg')}>{value}</span>
      </div>
      <Slider value={[v]} min={min} max={max} step={step} onValueChange={(x) => onChange(x[0])} />
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        {marks.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  )
}

/** Схема потока в момент пика очереди + окно инцидента на шкале смены. */
function FlowPanel({ input, result, running, progress, onStop }: { input: ScenarioInput; result: Outcome | null; running: boolean; progress: number; onStop: () => void }) {
  const snap = result ? result.run.snapshots[result.peakIndex] : null
  const end = result ? result.run.snapshots[result.run.snapshots.length - 1] : null
  const eq = EQUIPMENT_BY_ID[input.equipmentId]
  const recoverEnd = useMemo(() => {
    if (!result) return null
    // Когда очередь перед участком инцидента рассосалась после окончания простоя.
    const st = STATIONS.findIndex((s) => s.id === eq.section)
    const after = input.start + input.duration * 60
    const s = result.run.snapshots.find((x) => x.t > after && (st <= 0 || x.stations[st].queue <= 1))
    return s?.t ?? null
  }, [result, eq.section, input.start, input.duration])

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-auto bg-[#eef2f6] px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground">СХЕМА ПОТОКА · СЦЕНАРИЙ</span>
          <span className="text-[22px] tracking-[-0.01em]">
            {input.type} · <span className="font-mono text-xl">{input.equipmentId}</span>
          </span>
          <span className="text-[13px] text-muted-foreground">
            Начало <span className="font-mono text-foreground">{clockText(input.start, false)}</span> · длительность <span className="font-mono text-foreground">{input.duration} мин</span> · такт{' '}
            <span className="font-mono text-foreground">{mmss(input.takt)}</span>
            {snap && (
              <>
                {' '}
                · момент <span className="font-mono text-foreground">{clockText(snap.t, false)}</span> — пик очереди
              </>
            )}
          </span>
        </div>
        {running && (
          <div className="flex w-[300px] flex-col gap-2 rounded-lg border bg-card px-4 py-3">
            <div className="flex justify-between text-[13px]">
              <span>Моделирование… {Math.round(progress * 100)} %</span>
              <button type="button" onClick={onStop} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <SquareIcon className="size-3" /> Остановить
              </button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">смена 2 · {clockText(progress * SHIFT_LEN, false)} модельного времени</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {SECTIONS.map((s, i) => {
          const si = i - 1
          const st = STATIONS[si]
          const isIncident = eq.section === s.id
          const wip = snap && st ? snap.stations[si].wip : 0
          const queue = snap && st ? snap.stations[si].queue : 0
          const util = end && st ? (end.stations[si].busySec + end.stations[si].blockedSec) / SHIFT_LEN : null
          const starved = end && st ? end.stations[si].starvedSec / SHIFT_LEN : 0
          const parked = snap ? Array.from(snap.carLoc).filter((l) => l === LOC_WH_OUT).length : 0
          return (
            <div key={s.id} className={cn('flex flex-col gap-2.5 rounded-lg border bg-card px-3.5 py-3', isIncident && 'border-alarm shadow-[0_0_0_3px_var(--alarm-soft)]')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  {isIncident && <TriangleAlertIcon className="size-3.5 text-alarm" />}
                  {s.name}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{s.code}</span>
              </div>
              {st ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: st.slots }, (_, k) => (
                      <span key={k} className={cn('h-3 w-5 rounded-[3px] border', k < wip ? 'border-primary bg-primary' : 'border-dashed border-switch-off bg-card')} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Очередь</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: st.bufferCap }, (_, k) => (
                        <span key={k} className={cn('h-3 w-2.5 rounded-[2px]', k < queue ? (queue >= st.bufferCap ? 'bg-alarm' : 'bg-warn') : 'bg-skeleton')} />
                      ))}
                    </div>
                    <span className={cn('ml-auto font-mono', queue >= st.bufferCap ? 'text-alarm-fg' : '')}>
                      {queue}/{st.bufferCap}
                    </span>
                  </div>
                  {util !== null && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Загрузка за смену</span>
                        <span className="font-mono text-foreground">{Math.round(util * 100)} %</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-border">
                        <div className={cn('h-full rounded-full', util > 0.97 ? 'bg-alarm' : 'bg-brand')} style={{ width: `${util * 100}%` }} />
                      </div>
                      {starved > 0.05 && <span className="text-[11px] text-warn-fg">простаивает без кузовов {Math.round(starved * 100)} %</span>}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{s.id === 'wh-in' ? `${snap?.kits ?? '—'} комплектов` : `${end?.whOut ?? '—'} авто за смену · на площадке ${parked}`}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5">
        <span className="text-[13px] font-medium">Окно инцидента в смене</span>
        <div className="relative h-7 rounded-sm bg-muted">
          <div className="absolute inset-y-0 rounded-sm bg-alarm/80" style={{ left: `${(input.start / SHIFT_LEN) * 100}%`, width: `${((input.duration * 60) / SHIFT_LEN) * 100}%` }} title="простой" />
          {recoverEnd && (
            <div
              className="absolute inset-y-0 rounded-sm bg-warn/40"
              style={{ left: `${((input.start + input.duration * 60) / SHIFT_LEN) * 100}%`, width: `${(Math.max(0, recoverEnd - input.start - input.duration * 60) / SHIFT_LEN) * 100}%` }}
              title="рассасывание очереди"
            />
          )}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
          {['16:00', '18:00', '20:00', '22:00', '00:00'].map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-[2px] bg-alarm/80" />
            простой <span className="font-mono">{input.equipmentId}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-[2px] bg-warn/40" />
            рассасывание очереди
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-[2px] bg-primary" />
            кузов в работе
          </span>
        </div>
      </div>
    </section>
  )
}

function Results({ base, result, input, name }: { base: Outcome; result: Outcome | null; input: ScenarioInput; name?: string }) {
  const applyScenario = useSim((s) => s.applyScenario)
  const curve = useMemo(() => (result ? outputCurve(base.run, result.run) : []), [base, result])
  if (!result) {
    return (
      <aside className="flex flex-col gap-4 border-l bg-card px-5 py-5">
        <span className="text-[22px]">Результат</span>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
        <Skeleton className="h-48" />
      </aside>
    )
  }
  const lossCars = base.shiftOutput - result.shiftOutput
  const rows: { name: string; b: string; s: string; d: string; good: boolean | null }[] = [
    { name: 'Выпуск за смену', b: String(base.shiftOutput), s: String(result.shiftOutput), d: signed(result.shiftOutput - base.shiftOutput), good: cmp(result.shiftOutput - base.shiftOutput, true) },
    { name: 'Прогноз на месяц', b: formatNumber(base.monthForecast), s: formatNumber(result.monthForecast), d: signed(result.monthForecast - base.monthForecast), good: cmp(result.monthForecast - base.monthForecast, true) },
    { name: 'OEE линии', b: `${formatNumber(base.oee * 100, 1)} %`, s: `${formatNumber(result.oee * 100, 1)} %`, d: `${signed((result.oee - base.oee) * 100, 1)} п.п.`, good: cmp(result.oee - base.oee, true) },
    { name: 'Простой за смену', b: `${base.downtimeMin} мин`, s: `${result.downtimeMin} мин`, d: signed(result.downtimeMin - base.downtimeMin), good: cmp(result.downtimeMin - base.downtimeMin, false) },
    { name: 'Макс. очередь', b: String(base.maxQueue), s: String(result.maxQueue), d: signed(result.maxQueue - base.maxQueue), good: cmp(result.maxQueue - base.maxQueue, false) },
    { name: 'Брак окраски', b: `${formatNumber(base.paintDefectRate * 100, 1)} %`, s: `${formatNumber(result.paintDefectRate * 100, 1)} %`, d: `${signed((result.paintDefectRate - base.paintDefectRate) * 100, 1)} п.п.`, good: cmp(result.paintDefectRate - base.paintDefectRate, false) },
    {
      name: lossCars >= 0 ? 'Потери маржи, ₸' : 'Доп. маржа, ₸',
      b: '—',
      s: `${formatNumber((Math.abs(lossCars) * MARGIN_KZT) / 1e6, 1)} млн`,
      d: lossCars === 0 ? '0' : `${lossCars > 0 ? '−' : '+'}${formatNumber((Math.abs(lossCars) * MARGIN_KZT) / 1e6, 1)} млн`,
      good: lossCars === 0 ? null : lossCars < 0,
    },
  ]
  const goalOk = result.monthForecast >= input.goal
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-auto border-l bg-card px-5 py-5">
      <div className="flex flex-col gap-1">
        <span className="overline">Сравнение с базовым</span>
        <span className="text-[22px] tracking-[-0.01em]">Результат</span>
      </div>
      <span className="inline-flex h-7 items-center gap-2 self-start rounded-full bg-warn-soft px-3 text-xs font-medium text-warn-fg">
        <span className="size-1.5 rounded-full bg-warn" />
        {bottleneckText(result)}
      </span>
      <div className="overflow-hidden rounded-[10px] border text-[13px]">
        <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr] gap-2 border-b bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          <span>Метрика</span>
          <span className="text-right">Базовый</span>
          <span className="text-right">Сценарий</span>
          <span className="text-right">Δ</span>
        </div>
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr] items-center gap-2 border-b px-3 py-2.5 last:border-b-0">
            <span>{r.name}</span>
            <span className="text-right font-mono text-xs text-muted-foreground">{r.b}</span>
            <span className="text-right font-mono text-xs">{r.s}</span>
            <span className={cn('text-right font-mono text-xs', r.good === true && 'text-ok-fg', r.good === false && 'text-alarm-fg')}>{r.d}</span>
          </div>
        ))}
      </div>
      <div className={cn('rounded-md px-3 py-2.5 text-[13px]', goalOk ? 'bg-ok-soft text-ok-fg' : 'bg-alarm-soft text-alarm-fg')}>
        {goalOk ? 'Цель месяца выполняется' : 'Цель месяца не выполняется'}: прогноз <span className="font-mono">{formatNumber(result.monthForecast)}</span> из{' '}
        <span className="font-mono">{formatNumber(input.goal)}</span>
        {!goalOk && (
          <>
            {' '}
            (недобор <span className="font-mono">{formatNumber(input.goal - result.monthForecast)}</span>)
          </>
        )}
      </div>
      <Button
        onClick={() =>
          applyScenario(
            result.run,
            name ?? `${input.type} · ${input.equipmentId} · ${input.duration} мин`,
            // Показываем с момента за 5 минут до инцидента, чтобы было видно, как он развивается.
            input.duration > 0 ? input.start - 300 : DEMO_START_T,
          )
        }
      >
        <MapIcon />
        Показать сценарий на карте
      </Button>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-medium">Накопленный выпуск за смену</span>
          <span className="font-mono text-[11px] text-muted-foreground">авто, 16:00–00:00</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={curve} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#e3e8ef" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, SHIFT_LEN]} ticks={[0, 7200, 14400, 21600, 28800]} tickFormatter={(t) => clockText(t, false)} tick={AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} />
            <ReferenceArea x1={input.start} x2={input.start + input.duration * 60} fill="#c8453b" fillOpacity={0.08} />
            <Tooltip
              formatter={(v, n) => [String(v), n === 'base' ? 'Базовый' : 'Сценарий']}
              labelFormatter={(t) => clockText(Number(t), false)}
              contentStyle={{ borderRadius: 8, border: '1px solid #e3e8ef', fontSize: 12 }}
            />
            <Line dataKey="base" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="scen" stroke="#0088cc" strokeWidth={2.25} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed border-chart-plan" />
            Базовый
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 bg-brand" />
            Сценарий
          </span>
        </div>
      </div>
    </aside>
  )
}

function signed(v: number, digits = 0): string {
  if (Math.abs(v) < 10 ** -digits / 2) return '0'
  return `${v > 0 ? '+' : '−'}${formatNumber(Math.abs(v), digits)}`
}

function cmp(delta: number, upIsGood: boolean): boolean | null {
  if (Math.abs(delta) < 1e-9) return null
  return upIsGood ? delta > 0 : delta < 0
}
