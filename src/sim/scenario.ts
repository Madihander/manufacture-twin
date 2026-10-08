// «Что если»: новый прогон смены с изменёнными параметрами и сравнение с базовой сменой.
import { AVG_DAILY_OUTPUT, MONTH_OUTPUT_BEFORE_SHIFT, workdaysOfMonth } from '@/data/history'
import { type CarModelId, EQUIPMENT_BY_ID, SECTION_BY_ID, type SectionId } from '@/data/plant'
import { DEFAULT_PARAMS, type RunParams, runShift, type ShiftRun } from './engine'
import { type DowntimeEvent, SHIFT_DOWNTIMES, SHIFT_LEN, SNAPSHOT_STEP, STATIONS, TAKT } from './model'

/** Тип остановки и типичная длительность, мин. */
export interface IncidentKind {
  type: string
  min: number
  max: number
  planned?: boolean
  /** Авария, а не предупреждение (линия встаёт надолго). */
  alarm?: boolean
}

// Причины из журнала простоев (data/history.ts, длительности — оттуда же) дополнены типовыми отказами
// этого вида оборудования; у каждого — своё плановое ТО.
const ROBOT: IncidentKind[] = [
  { type: 'Ошибка датчика', min: 15, max: 35 },
  { type: 'Износ электродов', min: 10, max: 25 },
  { type: 'Ошибка позиционирования', min: 10, max: 30 },
  { type: 'Плановое ТО', min: 30, max: 30, planned: true },
]

/** Какие остановки бывают у критичного оборудования. */
export const INCIDENTS_BY_EQUIPMENT: Record<string, IncidentKind[]> = {
  'ABB-01': ROBOT,
  'ABB-02': ROBOT,
  'ABB-03': ROBOT,
  'ABB-04': ROBOT,
  'Камера-02': [
    { type: 'Замена фильтра', min: 30, max: 45 },
    { type: 'Засор форсунок', min: 20, max: 40 },
    { type: 'Отказ вентиляции', min: 40, max: 90, alarm: true },
    { type: 'Плановое ТО', min: 30, max: 45, planned: true },
  ],
  'ПС-01': [
    { type: 'Отклонение температуры', min: 15, max: 30 },
    { type: 'Отказ горелки', min: 45, max: 120, alarm: true },
    { type: 'Плановое ТО', min: 30, max: 45, planned: true },
  ],
  'Конвейер-03': [
    { type: 'Обрыв цепи', min: 40, max: 60, alarm: true },
    { type: 'Заклинивание подвески', min: 15, max: 40 },
    { type: 'Ошибка датчика положения', min: 10, max: 25 },
    { type: 'Плановое ТО', min: 30, max: 30, planned: true },
  ],
}

const FALLBACK: IncidentKind[] = [{ type: 'Остановка', min: 15, max: 60 }]

export const incidentKinds = (equipmentId: string) => INCIDENTS_BY_EQUIPMENT[equipmentId] ?? FALLBACK

/** Середина типичного диапазона, кратно 5 мин. */
export const typicalDuration = (k: IncidentKind) => Math.round((k.min + k.max) / 2 / 5) * 5

/** Тип остановки, подходящий оборудованию: старые сохранённые сценарии могли хранить чужой тип. */
export function normalizeIncident(input: ScenarioInput): ScenarioInput {
  const kinds = incidentKinds(input.equipmentId)
  return kinds.some((k) => k.type === input.type) ? input : { ...input, type: kinds[0].type }
}

/** Самая типичная неплановая остановка оборудования — для вопросов ИИ «что если X встанет». */
export const defaultFailure = (equipmentId: string) => incidentKinds(equipmentId).find((k) => !k.planned) ?? incidentKinds(equipmentId)[0]
export type MixMode = 'plan' | 'cobalt' | 'custom'

export interface ScenarioInput {
  equipmentId: string
  /** Тип остановки из incidentKinds(equipmentId). */
  type: string
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
  const kind = incidentKinds(input.equipmentId).find((k) => k.type === input.type)
  const event: DowntimeEvent = {
    id: `scn-${input.equipmentId}`,
    equipmentId: input.equipmentId,
    section: eq.section,
    start: input.start,
    duration: input.duration * 60,
    reason: input.type,
    planned: !!kind?.planned,
    severity: kind?.alarm ? 'alarm' : 'warn',
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
