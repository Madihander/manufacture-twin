// Данные экрана «Сводка»: история октября + текущая смена из симуляции, с фильтрами.
import { type DowntimeRecord, HISTORY, type LineSection, isoDate, workdaysOfMonth } from '@/data/history'
import { CAR_MODELS, type ModelFilter } from '@/data/plant'
import type { ShiftRun, Snapshot } from './engine'
import { MODEL_MIX, SHIFT_PLAN, TAKT } from './model'

export const LINE_SECTIONS: LineSection[] = ['welding', 'painting', 'assembly']
export const TODAY_ISO = '2026-10-15'

export interface Row {
  date: string
  shift: 1 | 2
  section: LineSection
  plan: number
  fact: number
  hours: number
  /** Плановое время, ч (для текущей смены — прошедшее). */
  plannedHours: number
  load: number
  defects: number
  real: boolean
  live: boolean
}

export interface Filters {
  from: Date
  to: Date
  sections: LineSection[]
  shift: 'all' | 1 | 2
  detail: 'day' | 'shift'
  model: ModelFilter
}

const STATION_OF: Record<LineSection, number> = { welding: 0, painting: 1, assembly: 2 }

/** Строки текущей смены (15.10, смена 2) из снимка симуляции. */
export function liveRows(_run: ShiftRun, snap: Snapshot): Row[] {
  const t = Math.max(1, snap.t)
  return LINE_SECTIONS.map((section) => {
    const c = snap.stations[STATION_OF[section]]
    const planned = Math.max(1, t - c.plannedDownSec)
    const hours = (planned - c.downSec) / 3600
    return {
      date: TODAY_ISO,
      shift: 2 as const,
      section,
      plan: Math.round(t / TAKT),
      fact: c.produced,
      hours,
      plannedHours: planned / 3600,
      load: Math.round(Math.min(1, (c.busySec + c.blockedSec) / planned) * 100),
      defects: c.defects,
      real: false,
      live: true,
    }
  })
}

export function allRows(run: ShiftRun, snap: Snapshot): Row[] {
  return [...HISTORY.shifts.map((s) => ({ ...s, plannedHours: 8, live: false })), ...liveRows(run, snap)]
}

/** Доля модели в выпуске (история не хранит модели — берём микс плана). */
export function modelShare(model: ModelFilter): number {
  if (model === 'all') return 1
  return MODEL_MIX.find(([m]) => m === model)?.[1] ?? 1
}

export function inPeriod(date: string, f: Filters): boolean {
  return date >= isoDate(f.from) && date <= isoDate(f.to)
}

export function filterRows(rows: Row[], f: Filters): Row[] {
  return rows.filter((r) => inPeriod(r.date, f) && f.sections.includes(r.section) && (f.shift === 'all' || r.shift === f.shift))
}

export interface Oee {
  a: number
  p: number
  q: number
  oee: number
}

export function oeeOf(rows: Row[]): Oee {
  const fact = rows.reduce((s, r) => s + r.fact, 0)
  const defects = rows.reduce((s, r) => s + r.defects, 0)
  const hours = rows.reduce((s, r) => s + r.hours, 0)
  const planned = rows.reduce((s, r) => s + r.plannedHours, 0)
  const a = planned ? Math.min(1, hours / planned) : 0
  const p = hours ? Math.min(1, (fact * TAKT) / 3600 / hours) : 0
  const q = fact ? (fact - defects) / fact : 1
  return { a, p, q, oee: a * p * q }
}

/** Группы оси X: день или день·смена. */
export function groups(rows: Row[], detail: Filters['detail']): { key: string; label: string; rows: Row[] }[] {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const key = detail === 'day' ? r.date : `${r.date}#${r.shift}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rs]) => {
      const [date, shift] = key.split('#')
      const dm = `${date.slice(8, 10)}.${date.slice(5, 7)}`
      return { key, label: shift ? `${dm}·${shift}` : dm, rows: rs }
    })
}

/** Простои за период: история + прошедшие остановки текущей смены. */
export function downtimeRecords(run: ShiftRun, snap: Snapshot): (DowntimeRecord & { live?: boolean; status: 'Открыт' | 'Закрыт' })[] {
  const live = run.params.downtimes
    .filter((d) => d.start <= snap.t)
    .map((d) => {
      const inc = run.incidents.find((i) => i.id === d.id)
      const open = !inc?.closedAt || inc.closedAt > snap.t
      return {
        date: TODAY_ISO,
        shift: 2 as const,
        section: d.section as LineSection,
        equipmentId: d.equipmentId,
        reason: d.reason,
        minutes: Math.round(Math.min(d.duration, snap.t - d.start) / 60),
        planned: d.planned,
        real: false,
        live: true,
        status: (open ? 'Открыт' : 'Закрыт') as 'Открыт' | 'Закрыт',
      }
    })
  return [...HISTORY.downtimes.map((d) => ({ ...d, status: 'Закрыт' as const })), ...live]
}

/** Выпуск готовых авто (выход сборки) по рабочим дням с начала месяца, накопительно. */
export function cumulativeOutput(rows: Row[]): { date: string; day: number; cum: number }[] {
  const byDate = new Map<string, number>()
  for (const r of rows) if (r.section === 'assembly') byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.fact)
  let cum = 0
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      cum += v
      return { date, day: Number(date.slice(8, 10)), cum }
    })
}

/**
 * Прогноз накопленного выпуска до 31.10 с коридором (±1,5 σ дневного выпуска).
 * target — итог месяца из общей модели (plantKpi): кривая приходит ровно в него, чтобы график
 * и число прогноза на всех экранах совпадали.
 */
export function forecastSeries(rows: Row[], liveRemaining: number, target?: number) {
  const actual = cumulativeOutput(rows)
  const daily = new Map<string, number>()
  for (const r of rows) if (r.section === 'assembly' && !r.live) daily.set(r.date, (daily.get(r.date) ?? 0) + r.fact)
  const full = [...daily.entries()].filter(([d]) => d !== TODAY_ISO).map(([, v]) => v).slice(-7)
  const mean = full.reduce((a, v) => a + v, 0) / Math.max(1, full.length)
  const sd = Math.sqrt(full.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, full.length))
  const workdays = workdaysOfMonth(2026, 9)
  const last = actual[actual.length - 1]
  let cum = (last?.cum ?? 0) + liveRemaining
  const future = workdays.filter((w) => w.getDate() > 15)
  const step = target !== undefined && future.length ? (target - cum) / future.length : mean
  const out: { day: number; actual?: number; forecast?: number; band?: [number, number] }[] = actual.map((a) => ({ day: a.day, actual: a.cum }))
  if (last) out[out.length - 1].forecast = last.cum
  let k = 0
  for (const d of future) {
    k++
    cum += step
    const spread = 1.5 * sd * Math.sqrt(k)
    out.push({ day: d.getDate(), forecast: Math.round(cum), band: [Math.round(cum - spread), Math.round(cum + spread)] })
  }
  // Ось — все дни месяца с данными (выходные пропускаем).
  return { points: out, mean, sd, final: Math.round(cum) }
}

export function shiftPlanFor(model: ModelFilter): number {
  return Math.round(SHIFT_PLAN * modelShare(model))
}

export const MODEL_LIST = Object.entries(CAR_MODELS).map(([id, m]) => ({ id: id as keyof typeof CAR_MODELS, ...m }))
