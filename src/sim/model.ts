// Модель линии и сценарий демо-смены. Время внутри смены — секунды от её начала (16:00).
import type { CarModelId, SectionId } from '@/data/plant'

export const SHIFT_START_SEC = 16 * 3600
export const SHIFT_LEN = 8 * 3600
/** Такт линии: 120 автомобилей за 8-часовую смену. */
export const TAKT = 240
export const SHIFT_PLAN = SHIFT_LEN / TAKT
/** Шаг снимков состояния для перемотки и графиков. */
export const SNAPSHOT_STEP = 10
/** С какого момента стартует демо: 21:42:10. */
export const DEMO_START_T = 5 * 3600 + 42 * 60 + 10

export type StationId = 'welding' | 'painting' | 'assembly' | 'qc'

export interface StationSpec {
  id: StationId
  /** Мест на участке — столько кузовов одновременно в работе. */
  slots: number
  /** Цикл одного места, с. Меньше такта: участок может нагонять отставание. */
  cycle: number
  /** Ёмкость буфера перед участком. */
  bufferCap: number
}

export const STATIONS: StationSpec[] = [
  { id: 'welding', slots: 4, cycle: 205, bufferCap: 4 },
  { id: 'painting', slots: 6, cycle: 212, bufferCap: 8 },
  { id: 'assembly', slots: 9, cycle: 208, bufferCap: 8 },
  { id: 'qc', slots: 3, cycle: 200, bufferCap: 4 },
]

export type Severity = 'warn' | 'alarm'

export interface DowntimeEvent {
  id: string
  equipmentId: string
  section: SectionId
  /** Начало, с от начала смены. */
  start: number
  duration: number
  reason: string
  planned: boolean
  severity: Severity
}

/** Остановки демо-смены 15.10 (смена 2). Причины и длительности — из статистики простоев кейса. */
export const SHIFT_DOWNTIMES: DowntimeEvent[] = [
  { id: 'dt-abb01', equipmentId: 'ABB-01', section: 'welding', start: 65 * 60, duration: 25 * 60, reason: 'Ошибка датчика', planned: false, severity: 'warn' },
  { id: 'dt-cam02', equipmentId: 'Камера-02', section: 'painting', start: 160 * 60, duration: 40 * 60, reason: 'Замена фильтра', planned: false, severity: 'warn' },
  { id: 'dt-conv03', equipmentId: 'Конвейер-03', section: 'assembly', start: 255 * 60, duration: 55 * 60, reason: 'Обрыв цепи', planned: false, severity: 'alarm' },
]

/** Через сколько после устранения инцидент закрывает мастер смены. */
export const INCIDENT_CLOSE_DELAY = 45 * 60

/** Доля моделей в потоке — по месячному плану кейса (Onix 2 500, Cobalt 1 800, J7 500). */
export const MODEL_MIX: [CarModelId, number][] = [
  ['onix', 2500 / 4800],
  ['cobalt', 1800 / 4800],
  ['j7', 500 / 4800],
]

export const BODY_COLORS = ['Белый', 'Серебристый', 'Чёрный', 'Синий', 'Красный'] as const
