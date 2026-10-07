// «Что если»: новый прогон смены с изменёнными параметрами и сравнение с базовой сменой.
import { AVG_DAILY_OUTPUT, MONTH_OUTPUT_BEFORE_SHIFT, workdaysOfMonth } from '@/data/history'
import { type CarModelId, EQUIPMENT_BY_ID, SECTION_BY_ID, type SectionId } from '@/data/plant'
import { DEFAULT_PARAMS, type RunParams, runShift, type ShiftRun } from './engine'
import { type DowntimeEvent, SHIFT_DOWNTIMES, SHIFT_LEN, SNAPSHOT_STEP, STATIONS, TAKT } from './model'

export const INCIDENT_TYPES = ['Обрыв цепи', 'Плановое ТО', 'Ошибка датчика', 'Замена фильтра'] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]
export type MixMode = 'plan' | 'cobalt' | 'custom'

export interface ScenarioInput {
  equipmentId: string
  type: IncidentType
  /** мин */
  duration: number
  /** с от начала смены */
  start: number
  shifts: 2 | 3
  /** с */
  takt: number
  /** % брака на окраске; null — как в базовой смене */
  paintDefect: number | null
  mixMode: MixMode
  mix: Record<CarModelId, number>
  goal: number
  saturdays: boolean
}

export const DEFAULT_INPUT: ScenarioInput = {
  equipmentId: 'Конвейер-03',
  type: 'Обрыв цепи',
  duration: 55,
  start: 255 * 60,
  shifts: 2,
  takt: TAKT,
  paintDefect: null,
  mixMode: 'plan',
  mix: { onix: 52, cobalt: 38, j7: 10 },
  goal: 5500,
  saturdays: false,
}

/** Условная маржа на автомобиль, ₸ — та же, что в «Эффекте для бизнеса». */
export const MARGIN_KZT = 400_000

export function buildParams(input: ScenarioInput): RunParams {
  const eq = EQUIPMENT_BY_ID[input.equipmentId]
  const event: DowntimeEvent = {
    id: `scn-${input.equipmentId}`,
    equipmentId: input.equipmentId,
    section: eq.section,
    start: input.start,
    duration: input.duration * 60,
    reason: input.type,
    planned: input.type === 'Плановое ТО',
    severity: input.type === 'Обрыв цепи' ? 'alarm' : 'warn',
  }
  // Событие того же оборудования в то же время (±30 мин) сценарий заменяет — так задаётся «что если бы его не было»;
  // остановка в другое время добавляется к остальным событиям смены.
  const downtimes = SHIFT_DOWNTIMES.filter((d) => !(d.equipmentId === input.equipmentId && Math.abs(d.start - input.start) <= 30 * 60))
  if (input.duration > 0) downtimes.push(event)
  const mix: [CarModelId, number][] | undefined =
    input.mixMode === 'plan'
      ? undefined
      : input.mixMode === 'cobalt'
        ? [['cobalt', 1]]
        : (Object.entries(input.mix).map(([m, v]) => [m, v / 100]) as [CarModelId, number][])
  return {
    ...DEFAULT_PARAMS,
    downtimes: downtimes.sort((a, b) => a.start - b.start),
    takt: input.takt,
    paintDefectRate: input.paintDefect === null ? undefined : input.paintDefect / 100,
    mix,
  }
}

export interface Outcome {
  run: ShiftRun
  shiftOutput: number
  oee: number
  downtimeMin: number
  maxQueue: number
  maxQueueAt: number
  maxQueueStation: number
  paintDefectRate: number
  monthForecast: number
  /** Индекс снимка для схемы потока (пик очереди). */
  peakIndex: number
}

const SATURDAYS_LEFT = 3 // 17, 24, 31 октября

export function evaluate(run: ShiftRun, input: ScenarioInput): Outcome {
  const end = run.snapshots[run.snapshots.length - 1]
  const qc = end.stations[3]
  const takt = run.params.takt ?? TAKT
  let maxQueue = 0
  let maxQueueAt = 0
  let maxQueueStation = 1
  let peakIndex = 0
  run.snapshots.forEach((s, i) => {
    s.stations.forEach((c, k) => {
      if (k > 0 && c.queue > maxQueue) {
        maxQueue = c.queue
        maxQueueAt = s.t
        maxQueueStation = k
        peakIndex = i
      }
    })
  })
  const remaining = workdaysOfMonth(2026, 9).filter((d) => d.getDate() > 15).length
  // Участки физически не быстрее цикла ~212 с: ускорять такт имеет смысл лишь до этого предела.
  const speed = Math.min(TAKT / 212, TAKT / takt)
  const perDay = AVG_DAILY_OUTPUT * (input.shifts / 2) * speed
  const saturday = input.saturdays ? SATURDAYS_LEFT * (AVG_DAILY_OUTPUT / 2) * input.shifts * speed : 0
  const monthForecast = Math.round(MONTH_OUTPUT_BEFORE_SHIFT + end.whOut + remaining * perDay + saturday)
  const paint = end.stations[1]
  return {
    run,
    shiftOutput: end.whOut,
    oee: ((qc.produced - qc.defects) * TAKT) / SHIFT_LEN,
    downtimeMin: Math.round(run.params.downtimes.reduce((a, d) => a + d.duration, 0) / 60),
    maxQueue,
    maxQueueAt,
    maxQueueStation,
    paintDefectRate: paint.produced ? paint.defects / paint.produced : 0,
    monthForecast,
    peakIndex,
  }
}

export function runScenario(input: ScenarioInput): Outcome {
  return evaluate(runShift(buildParams(input)), input)
}

/** Базовая смена — как в «Топологии»; месяц считаем с базовыми 2 сменами без суббот. */
export function baseline(run: ShiftRun): Outcome {
  return evaluate(run, { ...DEFAULT_INPUT, shifts: 2, saturdays: false })
}

/** Накопленный выпуск за смену каждые 5 минут. */
export function outputCurve(base: ShiftRun, scen: ShiftRun) {
  const out: { t: number; base: number; scen: number }[] = []
  const step = 300 / SNAPSHOT_STEP
  for (let i = 0; i < base.snapshots.length; i += step) out.push({ t: base.snapshots[i].t, base: base.snapshots[i].whOut, scen: scen.snapshots[i]?.whOut ?? 0 })
  return out
}

/** «Узкое место: Сборка-1 → простой Окраски». */
export function bottleneckText(o: Outcome): string {
  const st = STATIONS[o.maxQueueStation]
  const prev = STATIONS[o.maxQueueStation - 1]
  return `Узкое место: ${SECTION_BY_ID[st.id as SectionId].name}${prev ? ` → блокировка ${SECTION_BY_ID[prev.id as SectionId].short === 'Сварка' ? 'Сварки' : SECTION_BY_ID[prev.id as SectionId].short === 'Окраска' ? 'Окраски' : 'Сборки'}` : ''}`
}
