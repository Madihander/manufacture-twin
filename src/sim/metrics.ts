// KPI участков и завода на момент снимка. Пороги — из настроек, поэтому статусы пересчитываются сразу.
import { CASE_TARGETS } from '@/data/seed'
import { AVG_DAILY_OUTPUT, HISTORY, MONTH_OUTPUT_BEFORE_SHIFT, workdaysOfMonth } from '@/data/history'
import { EQUIPMENT, type SectionId } from '@/data/plant'
import type { Thresholds } from '@/store/settings'
import type { Incident, ShiftRun, Snapshot } from './engine'
import { SHIFT_LEN, SHIFT_PLAN, SHIFT_START_SEC, SNAPSHOT_STEP, STATIONS, type Severity, TAKT } from './model'
import { isDown } from './telemetry'

export type Status = 'ok' | 'warn' | 'alarm'

export const STATION_INDEX: Partial<Record<SectionId, number>> = { welding: 0, painting: 1, assembly: 2, qc: 3 }

export interface OpenIncident extends Incident {
  /** Уровень на текущий момент: во время простоя — как у события, после — «внимание» до закрытия. */
  level: Severity
  ongoing: boolean
}

export interface SectionKpi {
  id: SectionId
  status: Status
  /** Почему такой статус — для подсказок. */
  reasons: string[]
  plan: number
  planToNow: number
  fact: number
  oee: number
  availability: number
  performance: number
  quality: number
  defects: number
  defectRate: number
  load: number
  queue: number
  wip: number
  incidents: OpenIncident[]
  /** Ключевая цифра для списка участков. */
  metric: string
  /** Склад: запас в часах; ОТК: FPY; Склад ГП: готово. */
  supplyHours?: number
  kits?: number
  fpy?: number
  ready?: number
}

export function incidentsAt(run: ShiftRun, t: number): OpenIncident[] {
  return run.incidents
    .filter((i) => i.start <= t && (i.closedAt === null || i.closedAt > t))
    .map((i) => {
      const ongoing = i.downtime !== null && t < i.start + i.downtime
      return { ...i, ongoing, level: i.downtime === null || ongoing ? i.severity : 'warn' }
    })
    .sort((a, b) => b.start - a.start)
}

const pct = (v: number) => `${(v * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`

export function sectionKpis(run: ShiftRun, snap: Snapshot, th: Thresholds, riskyEquipment: Set<string>): SectionKpi[] {
  const t = Math.max(snap.t, 1)
  const open = incidentsAt(run, snap.t)
  const planToNow = snap.t / TAKT

  return (['wh-in', 'welding', 'painting', 'assembly', 'qc', 'wh-out'] as SectionId[]).map((id) => {
    const incidents = open.filter((i) => i.section === id)
    const reasons: string[] = []
    let status: Status = 'ok'
    const raise = (s: Status, why: string) => {
      reasons.push(why)
      if (s === 'alarm' || (s === 'warn' && status === 'ok')) status = s
    }
    for (const inc of incidents) raise(inc.level, inc.title)

    const base = { id, plan: SHIFT_PLAN, planToNow, incidents }
    const si = STATION_INDEX[id]

    if (si === undefined) {
      if (id === 'wh-in') {
        const supplyHours = (snap.kits * TAKT) / 3600
        if (supplyHours < 1) raise('alarm', 'Запас комплектов меньше часа')
        else if (supplyHours < 2) raise('warn', 'Запас комплектов меньше 2 ч')
        return {
          ...base, status, reasons, fact: snap.kits, oee: NaN, availability: NaN, performance: NaN, quality: NaN,
          defects: 0, defectRate: 0, load: NaN, queue: 0, wip: snap.kits, supplyHours, kits: snap.kits,
          metric: `запас ${supplyHours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`,
        }
      }
      return {
        ...base, status, reasons, fact: snap.whOut, oee: NaN, availability: NaN, performance: NaN, quality: NaN,
        defects: 0, defectRate: 0, load: NaN, queue: 0, wip: 0, ready: snap.whOut, metric: `${snap.whOut} шт`,
      }
    }

    const c = snap.stations[si]
    const planned = Math.max(1, t - c.plannedDownSec)
    const running = Math.max(1, planned - c.downSec)
    const availability = running / planned
    const performance = Math.min(1, (c.produced * TAKT) / running)
    const quality = c.produced ? (c.produced - c.defects) / c.produced : 1
    const oee = availability * performance * quality
    const defectRate = c.produced ? c.defects / c.produced : 0
    const load = Math.min(1, (c.busySec + c.blockedSec) / planned)

    const downNow = EQUIPMENT.some((e) => e.section === id && e.critical && isDown(e.id, SHIFT_START_SEC + snap.t))
    if (downNow) raise('alarm', 'Оборудование остановлено')
    const judged = snap.t >= 30 * 60
    if (judged && id !== 'qc') {
      if (defectRate * 100 > th.defectMax * 2) raise('alarm', `Брак ${pct(defectRate)} — вдвое выше порога`)
      else if (defectRate * 100 > th.defectMax) raise('warn', `Брак ${pct(defectRate)} выше порога ${th.defectMax} %`)
      if (oee * 100 < th.oeeMin) raise('warn', `OEE ${pct(oee)} ниже цели ${th.oeeMin} %`)
    }
    if (EQUIPMENT.some((e) => e.section === id && riskyEquipment.has(e.id))) raise('warn', 'ИИ: высокий риск остановки')

    const kpi: SectionKpi = {
      ...base, status, reasons, fact: c.produced, oee, availability, performance, quality,
      defects: c.defects, defectRate, load, queue: c.queue, wip: c.wip, metric: '',
    }
    if (id === 'qc') {
      kpi.fpy = quality
      if (judged && quality < 0.95) raise('warn', `FPY ${pct(quality)}`)
      kpi.status = status
      kpi.metric = `FPY ${pct(quality)}`
    } else {
      kpi.metric = id === 'painting' && defectRate * 100 > th.defectMax ? `брак ${pct(defectRate)}` : `OEE ${pct(oee)}`
    }
    kpi.status = status
    return kpi
  })
}

export interface PlantKpi {
  shiftOutput: number
  planToNow: number
  perHour: number
  perHourPlan: number
  oee: number
  defectRate: number
  monthOutput: number
  monthPlan: number
  forecast: number
  capacity: number
  remainingWorkdays: number
}

export function plantKpi(run: ShiftRun, snap: Snapshot): PlantKpi {
  const t = Math.max(snap.t, 1)
  const hourAgo = run.snapshots[Math.max(0, Math.floor((snap.t - 3600) / SNAPSHOT_STEP))]
  const span = Math.max(SNAPSHOT_STEP, snap.t - hourAgo.t)
  const perHour = ((snap.whOut - hourAgo.whOut) / span) * 3600

  const line = snap.stations.slice(0, 3)
  const produced = line.reduce((a, c) => a + c.produced, 0)
  const defects = line.reduce((a, c) => a + c.defects, 0)
  const qc = snap.stations[3]
  const good = qc.produced - qc.defects

  const workdays = workdaysOfMonth(2026, 9)
  const remainingWorkdays = workdays.filter((d) => d.getDate() > 15).length
  const monthOutput = MONTH_OUTPUT_BEFORE_SHIFT + snap.whOut
  const shiftRest = Math.max(0, ((SHIFT_LEN - snap.t) / 3600) * Math.min(perHour || SHIFT_PLAN / 8, 3600 / TAKT))
  const forecast = Math.round(monthOutput + shiftRest + remainingWorkdays * AVG_DAILY_OUTPUT)

  return {
    shiftOutput: snap.whOut,
    planToNow: snap.t / TAKT,
    perHour,
    perHourPlan: 3600 / TAKT,
    oee: (good * TAKT) / t,
    defectRate: produced ? defects / produced : 0,
    monthOutput,
    monthPlan: CASE_TARGETS.monthPlan,
    forecast,
    capacity: workdays.length * CASE_TARGETS.shiftsPerDay * SHIFT_PLAN,
    remainingWorkdays,
  }
}

export interface EquipmentDowntime {
  equipmentId: string
  minutes: number
  events: number
}

/** Простои за сутки 15.10: первая смена из истории + прошедшая часть текущей смены. */
export function downtimeToday(run: ShiftRun, t: number): EquipmentDowntime[] {
  const map = new Map<string, EquipmentDowntime>()
  const add = (id: string, minutes: number) => {
    const cur = map.get(id) ?? { equipmentId: id, minutes: 0, events: 0 }
    cur.minutes += minutes
    cur.events++
    map.set(id, cur)
  }
  for (const d of HISTORY.downtimes) if (d.date === '2026-10-15') add(d.equipmentId, d.minutes)
  for (const d of run.params.downtimes) if (d.start <= t) add(d.equipmentId, Math.round(Math.min(d.duration, t - d.start) / 60))
  return [...map.values()].sort((a, b) => b.minutes - a.minutes)
}

/** Простои оборудования по дням за 7 календарных дней, включая сегодня. */
export function downtimeLast7Days(run: ShiftRun, t: number, equipmentId: string): { date: Date; minutes: number }[] {
  const out: { date: Date; minutes: number }[] = []
  for (let k = 6; k >= 0; k--) {
    const date = new Date(2026, 9, 15 - k)
    const iso = `2026-10-${String(date.getDate()).padStart(2, '0')}`
    let minutes = HISTORY.downtimes.filter((d) => d.date === iso && d.equipmentId === equipmentId).reduce((a, d) => a + d.minutes, 0)
    if (k === 0)
      minutes += run.params.downtimes
        .filter((d) => d.equipmentId === equipmentId && d.start <= t)
        .reduce((a, d) => a + Math.round(Math.min(d.duration, t - d.start) / 60), 0)
    out.push({ date, minutes })
  }
  return out
}

/** Сколько кузовов на участке и в буфере перед ним — для полосы потока. */
export function flowCounts(snap: Snapshot): Record<SectionId, number> {
  const s = snap.stations
  return {
    'wh-in': snap.kits,
    welding: s[0].wip + s[0].queue,
    painting: s[1].wip + s[1].queue,
    assembly: s[2].wip + s[2].queue,
    qc: s[3].wip + s[3].queue,
    'wh-out': snap.whOut,
  }
}

export const STATION_SPECS = STATIONS
