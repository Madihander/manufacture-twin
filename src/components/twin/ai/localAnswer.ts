// Ответы «двойника» без внешней модели: шаблоны поверх тех же расчётов, что и карточки прогнозов.
// Это же — запасной режим на защите, если API языковой модели недоступен.
import { EQUIPMENT, EQUIPMENT_BY_ID, SECTIONS, SECTION_BY_ID, type SectionId } from '@/data/plant'
import { formatNumber } from '@/lib/format'
import { clockText } from '@/sim/clock'
import { SHIFT_START_SEC, STATIONS, TAKT } from '@/sim/model'
import { METRICS } from '@/sim/telemetry'
import type { Twin } from '@/sim/useTwin'
import type { AnswerPart } from './chat'

const sec = (id: SectionId): AnswerPart => ({ chip: SECTION_BY_ID[id].name, section: id })
const eq = (id: string): AnswerPart => ({ chip: id, equipmentId: id })

function findSection(q: string): SectionId | null {
  const s = q.toLowerCase()
  const keys: [string, SectionId][] = [
    ['окрас', 'painting'],
    ['свар', 'welding'],
    ['сбор', 'assembly'],
    ['отк', 'qc'],
    ['контрол', 'qc'],
    ['склад гп', 'wh-out'],
    ['готов', 'wh-out'],
    ['комплект', 'wh-in'],
    ['склад', 'wh-in'],
  ]
  return keys.find(([k]) => s.includes(k))?.[1] ?? null
}

function findEquipment(q: string): string | null {
  const s = q.toLowerCase()
  return EQUIPMENT.find((e) => s.includes(e.id.toLowerCase()))?.id ?? null
}

function sectionStory(twin: Twin, id: SectionId): AnswerPart[] {
  const k = twin.sectionById[id]
  const out: AnswerPart[] = []
  if (id === 'wh-in') {
    return [sec(id), `: ${k.kits} комплектов, запаса на ${formatNumber(k.supplyHours ?? 0, 1)} ч. Следующий подвоз — по графику каждые 2 часа.`]
  }
  if (id === 'wh-out') {
    return [sec(id), `: за смену выпущено ${twin.plant.shiftOutput} автомобилей при плане к этому моменту ${Math.round(twin.plant.planToNow)}. Темп за последний час — ${formatNumber(twin.plant.perHour, 1)} авто/ч при плане 15.`]
  }
  out.push(sec(id), `: OEE ${formatNumber(k.oee * 100, 1)} %, брак ${formatNumber(k.defectRate * 100, 1)} % (${k.defects} из ${k.fact}). `)
  if (k.status === 'ok') out.push('Отклонений нет. ')
  else out.push(`Причины статуса: ${k.reasons.map((r, i) => (i === 0 ? r : r.charAt(0).toLowerCase() + r.slice(1)).replace(/^oee/, 'OEE')).join('; ')}. `)
  const preds = twin.predictions.filter((p) => p.section === id)
  for (const p of preds) {
    if (p.kind === 'quality' && id === 'painting') {
      const dp = METRICS.find((m) => m.id === 'Камера-02:dp')!
      out.push(
        'Брак растёт вместе с перепадом давления на фильтре ',
        eq('Камера-02'),
        ` — сейчас ${formatNumber(dp.value(SHIFT_START_SEC + twin.snap.t), 0)} Па при границе 450. `,
      )
    } else if (p.kind === 'failure' && p.equipmentId) {
      out.push('Риск остановки ', eq(p.equipmentId), ` — ${p.big} % ${p.bigLabel}: ${p.signs[0]}. `)
    }
  }
  const rec = preds[0]?.recommendation
  if (rec) out.push(`Рекомендация: ${rec.charAt(0).toLowerCase()}${rec.slice(1)}.`)
  return out
}

function whatIfStop(twin: Twin, equipmentId: string, minutes: number): AnswerPart[] {
  const e = EQUIPMENT_BY_ID[equipmentId]
  const cars = Math.round((minutes * 60) / TAKT)
  const idx = SECTIONS.findIndex((s) => s.id === e.section)
  const upstream = SECTIONS[idx - 1]
  const downstream = SECTIONS[idx + 1]
  const k = twin.sectionById[e.section]
  const si = STATIONS.findIndex((st) => st.id === e.section)
  const free = si >= 0 ? STATIONS[si].bufferCap - k.queue : 0
  const fillMin = Math.round((free * TAKT) / 60)
  return [
    'Остановка ',
    eq(equipmentId),
    ` на ${minutes} мин остановит участок `,
    sec(e.section),
    free > 0 ? `. Через ~${fillMin} мин заполнится буфер перед ним, и ` : '. Буфер перед ним уже заполнен, поэтому сразу ',
    sec(upstream.id),
    ' встанет из-за блокировки; ',
    sec(downstream.id),
    ` начнёт простаивать почти сразу. Потери — около ${cars} автомобилей (${formatNumber(cars / 120 * 100, 0)} % плана смены), прогноз месяца снизится до ~${formatNumber(twin.plant.forecast - cars)}. Сократить потери поможет резерв участка: после пуска он нагоняет ~1 кузов за 6 тактов.`,
  ]
}

function shiftSummary(twin: Twin): AnswerPart[] {
  const p = twin.plant
  const worst = [...twin.sections].filter((k) => k.status !== 'ok')
  const out: AnswerPart[] = [
    `Смена 2, ${clockText(twin.snap.t, false)}. Выпуск ${p.shiftOutput} авто при плане к этому часу ${Math.round(p.planToNow)} (${formatNumber((p.shiftOutput / Math.max(1, p.planToNow)) * 100, 0)} %). `,
    `OEE линии ${formatNumber(p.oee * 100, 1)} %, брак ${formatNumber(p.defectRate * 100, 1)} %. `,
  ]
  const longest = twin.downtime[0]
  if (longest) out.push('Главная потеря дня — ', eq(longest.equipmentId), ` (${longest.minutes} мин простоя). `)
  if (worst.length) {
    out.push('Требуют внимания: ')
    worst.forEach((k, i) => out.push(sec(k.id), i < worst.length - 1 ? ', ' : '. '))
  }
  out.push(`Месяц: ${formatNumber(p.monthOutput)} из ${formatNumber(p.monthPlan)}, прогноз ${formatNumber(p.forecast)}.`)
  return out
}

export function answerLocal(question: string, twin: Twin): AnswerPart[] {
  const q = question.toLowerCase()
  if (/сводк|итог|смен[аеуы] для|директор/.test(q)) return shiftSummary(twin)
  const equipment = findEquipment(q)
  if (/если|встанет|останов/.test(q) && equipment) {
    const m = q.match(/(\d+)\s*(мин|ч)/)
    const minutes = m ? (m[2] === 'ч' ? Number(m[1]) * 60 : Number(m[1])) : /час/.test(q) ? 60 : 30
    return whatIfStop(twin, equipment, minutes)
  }
  if (equipment) {
    const p = twin.predictions.find((x) => x.equipmentId === equipment)
    const e = EQUIPMENT_BY_ID[equipment]
    const metrics = METRICS.filter((m) => m.equipmentId === equipment)
    const tAbs = SHIFT_START_SEC + twin.snap.t
    return [
      eq(equipment),
      ` (${e.name.toLowerCase()}, участок `,
      sec(e.section),
      `): ${metrics.map((m) => `${m.label.toLowerCase()} ${formatNumber(m.value(tAbs), m.digits)} ${m.unit}`).join(', ')}. `,
      p ? `${p.title}: ${p.big} % ${p.bigLabel}. ${p.recommendation}.` : 'Признаков скорой остановки нет.',
    ]
  }
  const section = findSection(q)
  if (section) return sectionStory(twin, section)
  if (/план|месяц/.test(q)) {
    const p = twin.predictions.find((x) => x.kind === 'plan')
    return p ? [`${p.title}. ${p.signs.join('; ')}. ${p.recommendation}.`] : ['Месячный план выполняется по графику.']
  }
  return [
    'Я отвечаю по данным модели: о состоянии участков, оборудовании (например, ',
    eq('ABB-01'),
    '), сценариях «что будет, если…» и сводке смены. Уточните вопрос.',
  ]
}
