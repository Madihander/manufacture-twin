// Телеметрия оборудования: 24 датчика. Значение — детерминированная функция времени,
// поэтому графики за 1 ч / 8 ч / 24 ч строятся мгновенно и одинаково при каждом запуске.
// tAbs — секунды от 00:00 15.10 (отрицательные — предыдущие сутки).
import { type DowntimeEvent, SHIFT_DOWNTIMES, SHIFT_START_SEC } from './model'
import { smoothNoise } from './rng'

export interface MetricSpec {
  id: string
  equipmentId: string
  label: string
  unit: string
  digits: number
  /** Норма: нижняя и/или верхняя граница. */
  lo?: number
  hi?: number
  /** Подпись нормы для UI. */
  norm: string
  value: (tAbs: number) => number
}

const H = 3600
const hours = (tAbs: number) => tAbs / H

/** Остановки смены, показанной на карте: реальной или сценария «что если». */
let activeDowntimes: DowntimeEvent[] = SHIFT_DOWNTIMES

export function setActiveDowntimes(d: DowntimeEvent[]) {
  activeDowntimes = d
}

/** Оборудование стоит в момент tAbs (по расписанию остановок текущей смены). */
export function isDown(equipmentId: string, tAbs: number): boolean {
  const t = tAbs - SHIFT_START_SEC
  return activeDowntimes.some((d) => d.equipmentId === equipmentId && t >= d.start && t < d.start + d.duration)
}

const n = (key: string, tAbs: number, amp: number, step = 300) => amp * smoothNoise(key, tAbs, step)

function robot(id: string, degrading: boolean): MetricSpec[] {
  // ABB-01: износ подшипника оси 2 — вибрация и температура растут с 15:00.
  const wear = (tAbs: number) => (degrading ? Math.max(0, (hours(tAbs) - 15) / 6.7) : 0)
  const base = 2.5 + (id.charCodeAt(id.length - 1) % 4) * 0.12
  return [
    {
      id: `${id}:vib`,
      equipmentId: id,
      label: 'Вибрация',
      unit: 'мм/с',
      digits: 1,
      hi: 4.5,
      norm: '< 4,5',
      value: (t) => (isDown(id, t) ? 0.3 + n(`${id}v0`, t, 0.05) : base + 1.5 * wear(t) ** 1.4 + n(`${id}v`, t, 0.07, 240)),
    },
    {
      id: `${id}:temp`,
      equipmentId: id,
      label: 'Температура двигателя оси 2',
      unit: '°C',
      digits: 0,
      hi: 75,
      norm: '< 75',
      value: (t) => (isDown(id, t) ? 41 : 57 + 1.8 * (base - 2.5) * 5 + 9.5 * wear(t) + n(`${id}t`, t, 0.8, 600)),
    },
    {
      id: `${id}:cur`,
      equipmentId: id,
      label: 'Ток двигателя',
      unit: 'А',
      digits: 1,
      hi: 16,
      norm: '< 16',
      value: (t) => (isDown(id, t) ? 0.4 : 11.4 + 0.9 * wear(t) + n(`${id}c`, t, 0.25, 180)),
    },
  ]
}

const shiftClock = (h: number) => SHIFT_START_SEC + h * H

export const METRICS: MetricSpec[] = [
  ...robot('ABB-01', true),
  ...robot('ABB-02', false),
  ...robot('ABB-03', false),
  ...robot('ABB-04', false),
  {
    id: 'Камера-02:temp',
    equipmentId: 'Камера-02',
    label: 'Температура в камере',
    unit: '°C',
    digits: 1,
    lo: 20,
    hi: 26,
    norm: '20–26',
    value: (t) => 23.3 + n('c2t', t, 0.35, 420),
  },
  {
    id: 'Камера-02:hum',
    equipmentId: 'Камера-02',
    label: 'Влажность',
    unit: '%',
    digits: 0,
    lo: 50,
    hi: 65,
    norm: '50–65',
    value: (t) => 55 + 6.2 * Math.min(1, Math.max(0, (hours(t) - 16) / 5.7)) + n('c2h', t, 0.6, 600),
  },
  {
    id: 'Камера-02:dp',
    equipmentId: 'Камера-02',
    label: 'Перепад давления на фильтре',
    unit: 'Па',
    digits: 0,
    hi: 450,
    norm: '< 450',
    value: (t) => {
      const replacedAt = shiftClock(160 / 60)
      const restartAt = replacedAt + 40 * 60
      if (t >= replacedAt && t < restartAt) return 0
      // Новый фильтр забивается втрое быстрее нормы — признак проблемы с подготовкой воздуха.
      if (t >= restartAt) return 220 + 82 * hours(t - restartAt) + n('c2dp', t, 4, 300)
      return 300 + 55 * Math.max(0, hours(t) - 16) + n('c2dp0', t, 4, 300)
    },
  },
  {
    id: 'Камера-02:air',
    equipmentId: 'Камера-02',
    label: 'Скорость воздуха',
    unit: 'м/с',
    digits: 2,
    lo: 0.3,
    hi: 0.5,
    norm: '0,3–0,5',
    value: (t) => (isDown('Камера-02', t) ? 0 : 0.42 + n('c2a', t, 0.015, 300)),
  },
  {
    id: 'ПС-01:temp',
    equipmentId: 'ПС-01',
    label: 'Температура сушки',
    unit: '°C',
    digits: 0,
    lo: 150,
    hi: 170,
    norm: '150–170',
    value: (t) => 160 + n('ps1', t, 1.6, 600),
  },
  {
    id: 'ПС-01:hum',
    equipmentId: 'ПС-01',
    label: 'Влажность в печи',
    unit: '%',
    digits: 0,
    hi: 20,
    norm: '< 20',
    value: (t) => 12 + n('ps1h', t, 1.2, 900),
  },
  {
    id: 'Конвейер-03:speed',
    equipmentId: 'Конвейер-03',
    label: 'Скорость цепи',
    unit: 'м/мин',
    digits: 2,
    lo: 2.8,
    hi: 3.2,
    norm: '2,8–3,2',
    value: (t) => (isDown('Конвейер-03', t) ? 0 : 3.0 + n('cv3s', t, 0.03, 300)),
  },
  {
    id: 'Конвейер-03:tension',
    equipmentId: 'Конвейер-03',
    label: 'Натяжение цепи',
    unit: 'кН',
    digits: 1,
    hi: 15,
    norm: '< 15',
    value: (t) => {
      const breakAt = shiftClock(255 / 60)
      if (isDown('Конвейер-03', t)) return 0
      // До обрыва натяжение росло — предвестник, который ИИ мог поймать заранее.
      if (t < breakAt) return 11.6 + 3.1 * Math.max(0, (t - (breakAt - 3 * H)) / (3 * H)) ** 2 + n('cv3t', t, 0.15, 300)
      return 11.1 + n('cv3t2', t, 0.12, 300)
    },
  },
  {
    id: 'Конвейер-03:gear',
    equipmentId: 'Конвейер-03',
    label: 'Температура редуктора',
    unit: '°C',
    digits: 0,
    hi: 80,
    norm: '< 80',
    value: (t) => (isDown('Конвейер-03', t) ? 38 : 54 + n('cv3g', t, 1.4, 600)),
  },
  {
    id: 'Конвейер-03:cur',
    equipmentId: 'Конвейер-03',
    label: 'Ток привода',
    unit: 'А',
    digits: 1,
    hi: 24,
    norm: '< 24',
    value: (t) => (isDown('Конвейер-03', t) ? 0 : 18.2 + n('cv3c', t, 0.5, 240)),
  },
  {
    id: 'СЗ-01:torque',
    equipmentId: 'СЗ-01',
    label: 'Отклонение момента затяжки',
    unit: '%',
    digits: 1,
    lo: -3,
    hi: 3,
    norm: '±3',
    value: (t) => n('sz1', t, 1.1, 300),
  },
  {
    id: 'СГ-01:geom',
    equipmentId: 'СГ-01',
    label: 'Отклонение геометрии кузова',
    unit: 'мм',
    digits: 2,
    hi: 0.5,
    norm: '< 0,5',
    value: (t) => 0.26 + n('sg1', t, 0.05, 600),
  },
  {
    id: 'КЛ-01:thick',
    equipmentId: 'КЛ-01',
    label: 'Толщина ЛКП',
    unit: 'мкм',
    digits: 0,
    lo: 95,
    hi: 120,
    norm: '95–120',
    value: (t) => 106 + n('kl1', t, 2.5, 600),
  },
]

export const METRICS_BY_EQUIPMENT = METRICS.reduce<Record<string, MetricSpec[]>>((acc, m) => {
  ;(acc[m.equipmentId] ??= []).push(m)
  return acc
}, {})

export type MetricLevel = 'ok' | 'warn' | 'alarm'

/** Уровень значения: за границей — авария, в последних 10 % диапазона до границы — внимание. */
export function metricLevel(m: MetricSpec, v: number): MetricLevel {
  if ((m.hi !== undefined && v > m.hi) || (m.lo !== undefined && v < m.lo && v !== 0)) return 'alarm'
  // Коридор (20–26): «внимание» в крайних 25 %; односторонняя граница: в последних 5 %.
  const ranged = m.hi !== undefined && m.lo !== undefined
  const span = ranged ? m.hi! - m.lo! : Math.abs(m.hi ?? m.lo ?? 1) * 0.5
  const zone = ranged ? 0.25 : 0.1
  if (m.hi !== undefined && v > m.hi - span * zone) return 'warn'
  if (m.lo !== undefined && v !== 0 && v < m.lo + span * zone) return 'warn'
  return 'ok'
}

/** Уровень с учётом тренда: параметр ещё в норме, но дойдёт до границы за 2 ч — «внимание». */
export function metricState(m: MetricSpec, tAbs: number): { value: number; level: MetricLevel; note?: string } {
  const value = m.value(tAbs)
  if (isDown(m.equipmentId, tAbs)) return { value, level: 'alarm', note: 'оборудование стоит' }
  const level = metricLevel(m, value)
  if (level === 'alarm') return { value, level, note: 'вне нормы' }
  if (m.hi !== undefined && m.lo === undefined) {
    const slope = trendPerHour(m, tAbs)
    if (slope !== null && slope > 0 && (m.hi - value) / slope < 2) return { value, level: 'warn', note: 'растёт' }
  }
  if (level === 'warn') return { value, level, note: m.hi !== undefined && value > (m.lo ?? 0) + ((m.hi - (m.lo ?? 0)) / 2) ? 'у верхней границы' : 'у нижней границы' }
  return { value, level }
}

/** Ряд значений за окно `windowSec` до момента tAbs. */
export function series(m: MetricSpec, tAbs: number, windowSec: number, points = 60): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = []
  for (let i = 0; i <= points; i++) {
    const t = tAbs - windowSec + (windowSec * i) / points
    out.push({ t, v: m.value(t) })
  }
  return out
}

/** Наклон линейной регрессии, единиц в час. */
export function slopePerHour(pts: { t: number; v: number }[]): number {
  const n = pts.length
  const mt = pts.reduce((a, p) => a + p.t, 0) / n
  const mv = pts.reduce((a, p) => a + p.v, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.t - mt) * (p.v - mv)
    den += (p.t - mt) ** 2
  }
  return den === 0 ? 0 : (num / den) * H
}

/**
 * Тренд параметра за окно, единиц в час. Точки, когда оборудование стояло или параметр был
 * сброшен (замена фильтра), отбрасываются — иначе перезапуск выглядит как «рост».
 */
export function trendPerHour(m: MetricSpec, tAbs: number, windowSec = 3600): number | null {
  const pts = series(m, tAbs, windowSec, 30).filter((p) => !isDown(m.equipmentId, p.t) && p.v > 0)
  // После сброса значения берём только участок после последнего провала.
  let start = 0
  for (let i = 1; i < pts.length; i++) if (pts[i].t - pts[i - 1].t > (windowSec / 30) * 1.5) start = i
  const tail = pts.slice(start)
  if (tail.length < 10) return null
  return slopePerHour(tail)
}
