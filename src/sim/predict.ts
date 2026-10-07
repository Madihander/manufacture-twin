// «ИИ-диспетчер», расчётная часть: прогнозы строятся кодом по телеметрии и снимкам симуляции.
// Цифры честные и объяснимые; языковая модель позже только перескажет их человеческим языком.
import { EQUIPMENT_BY_ID, SECTION_BY_ID, type SectionId } from '@/data/plant'
import { plural } from '@/lib/format'
import type { Thresholds } from '@/store/settings'
import type { ShiftRun, Snapshot } from './engine'
import { type PlantKpi, type SectionKpi, STATION_INDEX } from './metrics'
import { SHIFT_PLAN, SHIFT_START_SEC, SNAPSHOT_STEP, STATIONS, TAKT } from './model'
import { isDown, METRICS, type MetricSpec, trendPerHour } from './telemetry'

export type PredictionLevel = 'crit' | 'warn' | 'info'

export interface Prediction {
  id: string
  level: PredictionLevel
  kind: 'failure' | 'quality' | 'bottleneck' | 'plan'
  title: string
  big: string
  unit: string
  bigLabel: string
  signs: string[]
  recommendation: string
  effect?: string
  /** Объяснение для «Почему такой прогноз?». */
  why: string
  section?: SectionId
  equipmentId?: string
  probability?: number
  /** Через сколько часов параметр выйдет за границу. */
  etaHours?: number
}

const fmt = (v: number, digits = 1) => v.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Типичная длительность аварийного простоя, мин — для оценки эффекта от предупреждения. */
const TYPICAL_REPAIR: Record<string, number> = { welding: 45, painting: 40, assembly: 55, qc: 20 }

const RECOMMENDATION: Record<string, string> = {
  'ABB-01': 'Осмотреть подшипник оси 2 в технологический перерыв 22:00, подготовить запасной датчик',
  'Конвейер-03': 'Проверить натяжитель и звенья цепи, подготовить ремкомплект — остановка на 15 мин сейчас вместо часа после обрыва',
}

interface MetricRisk {
  metric: MetricSpec
  value: number
  slope: number
  eta: number
  probability: number
  change6h: number
}

/** Риск выхода параметра за верхнюю границу: тренд за последний час + логистическая шкала по времени до границы. */
function metricRisk(m: MetricSpec, tAbs: number): MetricRisk | null {
  // Уставки с коридором (скорость цепи, воздух) не прогнозируем: их держит регулятор.
  if (m.hi === undefined || m.lo !== undefined || isDown(m.equipmentId, tAbs)) return null
  const slope = trendPerHour(m, tAbs)
  const value = m.value(tAbs)
  if (slope === null || slope <= 0 || value >= m.hi) return null
  const eta = (m.hi - value) / slope
  const probability = 1 / (1 + Math.exp((eta - 1.9) / 0.5))
  const past = m.value(tAbs - 6 * 3600)
  const change6h = past > 0 ? (value - past) / past : 0
  return { metric: m, value, slope, eta, probability, change6h }
}

function horizonLabel(eta: number): string {
  if (eta <= 1) return 'в течение 1 ч'
  if (eta <= 2) return 'в течение 2 ч'
  if (eta <= 4) return 'в течение 4 ч'
  return 'до конца смены'
}

export function predict(run: ShiftRun, snap: Snapshot, kpis: SectionKpi[], plant: PlantKpi, th: Thresholds): Prediction[] {
  const tAbs = SHIFT_START_SEC + snap.t
  const out: Prediction[] = []
  const kpiOf = (id: SectionId) => kpis.find((k) => k.id === id)!

  // 1. Качество: брак выше порога на участке.
  for (const id of ['welding', 'painting', 'assembly'] as const) {
    const k = kpiOf(id)
    if (snap.t < 1800 || k.defectRate * 100 <= th.defectMax) continue
    const signs = [`брак ${fmt(k.defectRate * 100)} % при пороге ${fmt(th.defectMax, 0)} %`]
    let recommendation = 'Проверить режимы участка и провести разбор дефектов с мастером'
    if (id === 'painting') {
      const dp = METRICS.find((m) => m.id === 'Камера-02:dp')!
      const slope = trendPerHour(dp, tAbs)
      if (slope !== null && slope > 0) signs.push(`перепад давления на фильтре растёт: ${fmt(dp.value(tAbs), 0)} Па, +${fmt(slope, 0)} Па/ч`)
      recommendation = 'Заменить фильтр Камеры-02 до конца смены и проверить подготовку воздуха'
    }
    out.push({
      id: `quality-${id}`,
      level: k.defectRate * 100 > th.defectMax * 2 ? 'crit' : 'warn',
      kind: 'quality',
      title: `${SECTION_BY_ID[id].name} — брак выше порога`,
      big: fmt(k.defectRate * 100),
      unit: '%',
      bigLabel: `брак · порог ${fmt(th.defectMax, 0)} %`,
      signs,
      recommendation,
      why: `За смену ${k.defects} дефектов на ${k.fact} кузовов. Порог брака — ${fmt(th.defectMax, 0)} %, сейчас ${fmt(k.defectRate * 100)} %.`,
      section: id,
    })
  }

  // 2. Отказы: тренд параметров к границе нормы.
  const byEquipment = new Map<string, MetricRisk>()
  for (const m of METRICS) {
    const r = metricRisk(m, tAbs)
    if (!r || r.probability < 0.4) continue
    const cur = byEquipment.get(m.equipmentId)
    if (!cur || r.probability > cur.probability) byEquipment.set(m.equipmentId, r)
  }
  for (const [equipmentId, r] of byEquipment) {
    const eq = EQUIPMENT_BY_ID[equipmentId]
    const quality = out.find((p) => p.kind === 'quality' && p.section === eq.section)
    // Засор фильтра уже объясняет брак окраски — отдельную карточку не дублируем.
    if (quality && equipmentId === 'Камера-02') continue
    const repair = TYPICAL_REPAIR[eq.section] ?? 30
    const cars = Math.round((repair * 60) / TAKT)
    const p = Math.round(r.probability * 100)
    const signs = [
      `${r.metric.label.toLowerCase()} ${fmt(r.value, r.metric.digits)} ${r.metric.unit}, граница ${r.metric.norm} ${r.metric.unit}`,
      `рост ${r.change6h > 0 ? '+' : ''}${fmt(r.change6h * 100, 0)} % за 6 ч`,
    ]
    const temp = METRICS.find((m) => m.equipmentId === equipmentId && m.id.endsWith(':temp') && m !== r.metric)
    if (temp) {
      const dT = temp.value(tAbs) - temp.value(tAbs - 6 * 3600)
      if (dT > 3) signs.push(`${temp.label.toLowerCase()} +${fmt(dT, 0)} °C`)
    }
    out.push({
      id: `failure-${equipmentId}`,
      level: r.probability >= 0.7 ? 'crit' : 'warn',
      kind: 'failure',
      title: `${equipmentId} — риск остановки`,
      big: String(p),
      unit: '%',
      bigLabel: horizonLabel(r.eta),
      signs,
      recommendation: RECOMMENDATION[equipmentId] ?? `Провести внеплановый осмотр ${equipmentId} в ближайший перерыв`,
      effect: `≈ ${repair} мин простоя предотвращено ≈ ${cars} автомобилей`,
      why: `Параметр «${r.metric.label}» за последний час растёт на ${fmt(r.slope, r.metric.digits)} ${r.metric.unit}/ч. При таком темпе граница ${r.metric.norm} будет пройдена через ${fmt(r.eta)} ч. Вероятность остановки оценена по времени до границы.`,
      section: eq.section,
      equipmentId,
      probability: r.probability,
      etaHours: r.eta,
    })
  }

  // 3. Узкое место: очередь перед участком и простой следующего за ним.
  const hourAgo = run.snapshots[Math.max(0, Math.floor((snap.t - 3600) / SNAPSHOT_STEP))]
  const span = Math.max(1, snap.t - hourAgo.t)
  let worst: { i: number; fill: number } | null = null
  STATIONS.forEach((st, i) => {
    if (i === 0) return
    const fill = snap.stations[i].queue / st.bufferCap
    const id = st.id as SectionId
    const stopped = kpiOf(id).incidents.some((x) => x.ongoing)
    if (!stopped && fill >= 0.5 && (!worst || fill > worst.fill)) worst = { i, fill }
  })
  if (worst) {
    const { i } = worst as { i: number; fill: number }
    const id = STATIONS[i].id as SectionId
    const next = STATIONS[i + 1]
    const signs = [`очередь перед участком: занято ${snap.stations[i].queue} из ${STATIONS[i].bufferCap} мест буфера`]
    if (next) {
      const starved = (snap.stations[i + 1].starvedSec - hourAgo.stations[i + 1].starvedSec) / span
      if (starved > 0.02) signs.push(`${SECTION_BY_ID[next.id as SectionId].short} простаивает ${fmt(starved * 100, 0)} % времени`)
    }
    const prev = STATION_INDEX[id]! - 1
    if (prev >= 0) {
      const blocked = (snap.stations[prev].blockedSec - hourAgo.stations[prev].blockedSec) / span
      if (blocked > 0.02) signs.push(`${SECTION_BY_ID[STATIONS[prev].id as SectionId].short} блокирован ${fmt(blocked * 100, 0)} % времени`)
    }
    out.push({
      id: `bottleneck-${id}`,
      level: 'warn',
      kind: 'bottleneck',
      title: `Узкое место: ${SECTION_BY_ID[id].short}`,
      big: String(snap.stations[i].queue),
      unit: plural(snap.stations[i].queue, ['кузов', 'кузова', 'кузовов']),
      bigLabel: `в очереди перед участком «${SECTION_BY_ID[id].short}»`,
      signs,
      recommendation:
        id === 'painting'
          ? 'Сократить цикл сушки на ПС-01 в пределах техкарты или вывести резервного маляра'
          : id === 'assembly'
            ? 'Добавить оператора на посты 5–7 сборки до разбора очереди'
            : 'Перераспределить операторов на участок до разбора очереди',
      why: 'Буфер перед участком заполнен больше чем наполовину, а соседние участки теряют время из-за него.',
      section: id,
    })
  }

  // 4. Месячный план.
  if (plant.forecast < plant.monthPlan) {
    const gap = plant.monthPlan - plant.forecast
    const perDay = Math.ceil(gap / Math.max(1, plant.remainingWorkdays))
    const saturdays = Math.ceil(gap / SHIFT_PLAN)
    out.push({
      id: 'plan-month',
      level: 'warn',
      kind: 'plan',
      title: 'Риск невыполнения месячного плана',
      big: plant.forecast.toLocaleString('ru-RU'),
      unit: `/ ${plant.monthPlan.toLocaleString('ru-RU')}`,
      bigLabel: 'прогноз выпуска на 31.10',
      signs: [
        `прогноз ${plant.forecast.toLocaleString('ru-RU')} из ${plant.monthPlan.toLocaleString('ru-RU')}`,
        `мощность линии при 22 рабочих днях — ${plant.capacity.toLocaleString('ru-RU')}`,
      ],
      recommendation: `Нужно +${perDay} авто в сутки или ${saturdays} ${plural(saturdays, ['дополнительная субботняя смена', 'дополнительные субботние смены', 'дополнительных субботних смен'])}`,
      why: `Выпуск с начала месяца — ${plant.monthOutput.toLocaleString('ru-RU')}. Осталось ${plant.remainingWorkdays} рабочих дней со средним выпуском за последнюю неделю. Даже при 100 % плана мощность линии (${plant.capacity.toLocaleString('ru-RU')}) ниже цели ${plant.monthPlan.toLocaleString('ru-RU')}.`,
    })
  }

  const order: Record<PredictionLevel, number> = { crit: 0, warn: 1, info: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level] || (b.probability ?? 0) - (a.probability ?? 0))
}
