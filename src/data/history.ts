// История октября до текущей смены: 01–02.10 смена 1 — данные кейса, остальное смоделировано
// детерминированно (одно зерно — одни и те же цифры при каждом запуске).
import { gaussian, mulberry32 } from '@/sim/rng'
import { CASE_DOWNTIMES, CASE_LINE_RUNS, CASE_QUALITY } from './seed'
import type { SectionId } from './plant'

export type LineSection = Extract<SectionId, 'welding' | 'painting' | 'assembly'>

export interface ShiftRecord {
  /** YYYY-MM-DD */
  date: string
  shift: 1 | 2
  section: LineSection
  plan: number
  fact: number
  hours: number
  load: number
  defects: number
  /** true — строка из данных кейса. */
  real: boolean
}

export interface DowntimeRecord {
  date: string
  shift: 1 | 2
  section: LineSection
  equipmentId: string
  reason: string
  minutes: number
  planned: boolean
  real: boolean
}

const LINE_NAMES: Record<string, LineSection> = { 'Сварка-1': 'welding', 'Окраска-1': 'painting', 'Сборка-1': 'assembly' }
const SECTION_NAMES: Record<string, LineSection> = { Сварка: 'welding', Окраска: 'painting', Сборка: 'assembly' }

/** Каталог причин простоя для моделирования — расширяет статистику кейса. */
const DOWNTIME_CATALOG: { section: LineSection; equipmentId: string; reason: string; min: number; max: number; planned?: boolean }[] = [
  { section: 'welding', equipmentId: 'ABB-01', reason: 'Ошибка датчика', min: 15, max: 35 },
  { section: 'welding', equipmentId: 'ABB-02', reason: 'Износ электродов', min: 10, max: 25 },
  { section: 'welding', equipmentId: 'ABB-03', reason: 'Ошибка позиционирования', min: 10, max: 30 },
  { section: 'welding', equipmentId: 'ABB-04', reason: 'Плановое ТО', min: 30, max: 30, planned: true },
  { section: 'painting', equipmentId: 'Камера-02', reason: 'Замена фильтра', min: 30, max: 45 },
  { section: 'painting', equipmentId: 'ПС-01', reason: 'Отклонение температуры', min: 15, max: 30 },
  { section: 'assembly', equipmentId: 'Конвейер-03', reason: 'Обрыв цепи', min: 40, max: 60 },
  { section: 'assembly', equipmentId: 'СЗ-01', reason: 'Отклонение момента затяжки', min: 10, max: 20 },
]

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isWorkday(d: Date): boolean {
  const wd = d.getDay()
  return wd !== 0 && wd !== 6
}

/** Рабочие дни месяца. */
export function workdaysOfMonth(year: number, month0: number): Date[] {
  const out: Date[] = []
  for (let d = new Date(year, month0, 1); d.getMonth() === month0; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (isWorkday(d)) out.push(d)
  }
  return out
}

function generate() {
  const rnd = mulberry32(1015)
  const shifts: ShiftRecord[] = []
  const downtimes: DowntimeRecord[] = []
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  // 15.10 — только первая смена: вторая идёт сейчас в симуляции.
  const days = workdaysOfMonth(2026, 9).filter((d) => d.getDate() <= 15)

  for (const day of days) {
    const date = iso(day)
    for (const shift of [1, 2] as const) {
      const real = shift === 1 && CASE_LINE_RUNS.some((r) => r.date === date)
      if (day.getDate() === 15 && shift === 2) continue

      if (real) {
        for (const r of CASE_LINE_RUNS.filter((r) => r.date === date)) {
          const section = LINE_NAMES[r.line]
          const q = CASE_QUALITY.find((q) => q.date === date && SECTION_NAMES[q.section] === section)
          shifts.push({ date, shift, section, plan: r.plan, fact: r.fact, hours: r.hours, load: r.load, defects: q?.defects ?? 0, real: true })
        }
        for (const dt of CASE_DOWNTIMES.filter((x) => x.date === date)) {
          downtimes.push({
            date,
            shift,
            section: SECTION_NAMES[dt.section],
            equipmentId: dt.equipment,
            reason: dt.reason,
            minutes: dt.minutes,
            planned: dt.reason === 'Плановое ТО',
            real: true,
          })
        }
        continue
      }

      // Простои смены: 0–2 события.
      const events: DowntimeRecord[] = []
      const n = rnd() < 0.25 ? 0 : rnd() < 0.7 ? 1 : 2
      for (let k = 0; k < n; k++) {
        const c = DOWNTIME_CATALOG[Math.floor(rnd() * DOWNTIME_CATALOG.length)]
        events.push({
          date,
          shift,
          section: c.section,
          equipmentId: c.equipmentId,
          reason: c.reason,
          minutes: Math.round(c.min + rnd() * (c.max - c.min)),
          planned: !!c.planned,
          real: false,
        })
      }
      // Утро 15.10 — плановое ТО ABB-04 (оно же видно в «простоях за сутки»).
      if (date === '2026-10-15') {
        events.length = 0
        events.push({ date, shift, section: 'welding', equipmentId: 'ABB-04', reason: 'Плановое ТО', minutes: 30, planned: true, real: false })
      }
      downtimes.push(...events)

      const lost = (s: LineSection) => events.filter((e) => e.section === s).reduce((a, e) => a + e.minutes, 0)
      // Потери участка + часть потерь соседей (линия связана буферами).
      const welding = clamp(Math.round(gaussian(rnd, 118, 2.5) - lost('welding') / 5), 95, 122)
      const painting = clamp(Math.round(Math.min(welding + 2, gaussian(rnd, 116, 3)) - lost('painting') / 5), 92, 121)
      const assembly = clamp(Math.round(Math.min(painting + 2, gaussian(rnd, 116, 3)) - lost('assembly') / 5), 90, 121)
      const facts: Record<LineSection, number> = { welding, painting, assembly }
      const defectRates: Record<LineSection, number> = { welding: 0.017, painting: 0.032, assembly: 0.011 }

      for (const section of ['welding', 'painting', 'assembly'] as const) {
        const hours = Math.round((8 - lost(section) / 60 - rnd() * 0.3) * 10) / 10
        const fact = facts[section]
        shifts.push({
          date,
          shift,
          section,
          plan: 120,
          fact,
          hours,
          load: clamp(Math.round((fact / 120) * 100 + gaussian(rnd, 0, 1)), 80, 100),
          defects: Math.max(0, Math.round(gaussian(rnd, fact * defectRates[section], 1.2))),
          real: false,
        })
      }
    }
  }
  return { shifts, downtimes }
}

export const HISTORY = generate()

/** Выпуск готовых автомобилей (выход сборки) с начала месяца до текущей смены. */
export const MONTH_OUTPUT_BEFORE_SHIFT = HISTORY.shifts
  .filter((s) => s.section === 'assembly')
  .reduce((a, s) => a + s.fact, 0)

/** Средний выпуск за рабочий день за последние 7 полных рабочих дней. */
export const AVG_DAILY_OUTPUT = (() => {
  const byDate = new Map<string, number>()
  for (const s of HISTORY.shifts) if (s.section === 'assembly') byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.fact)
  const full = [...byDate.entries()].filter(([d]) => d !== '2026-10-15').slice(-7)
  return full.reduce((a, [, v]) => a + v, 0) / full.length
})()

export { iso as isoDate }
