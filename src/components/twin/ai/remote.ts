// Ответы языковой модели (DeepSeek через /api/ask). Модель получает уже посчитанные данные двойника
// и только пересказывает их; если сервер недоступен — вызывающий код берёт локальный шаблон.
import { CAR_MODELS, EQUIPMENT, SECTIONS } from '@/data/plant'
import { clockText } from '@/sim/clock'
import { SHIFT_START_SEC } from '@/sim/model'
import { METRICS, metricState } from '@/sim/telemetry'
import type { Twin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import type { AnswerPart } from './chat'

const r1 = (v: number) => Math.round(v * 10) / 10
const pct = (v: number) => (Number.isNaN(v) ? null : r1(v * 100))

/** Компактный снимок данных для модели: только то, что видно в интерфейсе. */
export function buildContext(twin: Twin) {
  const { snap, plant, sections, predictions, incidents, downtime, thresholds } = twin
  const tAbs = SHIFT_START_SEC + snap.t
  const sim = useSim.getState()
  const sensors = METRICS.map((m) => ({ m, s: metricState(m, tAbs) }))
    .filter(({ s }) => s.level !== 'ok')
    .map(({ m, s }) => ({ equipment: m.equipmentId, sensor: m.label, value: `${r1(s.value)} ${m.unit}`, norm: m.norm, level: s.level, note: s.note }))
  return {
    plant: 'СарыаркаАвтоПром, линия 1 (сварка → окраска → сборка → ОТК)',
    now: `15.10.2026 ${clockText(snap.t, false)}, смена 2 (16:00–00:00)`,
    view: sim.scenario ? `сценарий «что если»: ${sim.scenario}` : 'реальная смена',
    model_filter: sim.modelFilter === 'all' ? 'все модели' : CAR_MODELS[sim.modelFilter].name,
    thresholds: { oee_min_pct: thresholds.oeeMin, defect_max_pct: thresholds.defectMax, downtime_max_min_per_day: thresholds.downtimeMax },
    shift: {
      output: plant.shiftOutput,
      plan_to_now: Math.round(plant.planToNow),
      shift_plan: 120,
      per_hour: r1(plant.perHour),
      per_hour_plan: 15,
      line_oee_pct: pct(plant.oee),
      defect_rate_pct: pct(plant.defectRate),
    },
    month: {
      output: plant.monthOutput,
      target: plant.monthPlan,
      forecast: plant.forecast,
      line_capacity_22_days: plant.capacity,
      plan_by_model: Object.fromEntries(Object.values(CAR_MODELS).map((m) => [m.name, m.monthPlan])),
      remaining_workdays: plant.remainingWorkdays,
    },
    sections: sections.map((k) => ({
      name: SECTIONS.find((s) => s.id === k.id)!.name,
      status: k.status,
      reasons: k.reasons,
      fact: k.fact,
      oee_pct: pct(k.oee),
      defect_pct: pct(k.defectRate),
      defects: k.defects,
      queue: k.queue,
      metric: k.metric,
    })),
    open_incidents: incidents.map((i) => ({
      time: clockText(i.start, false),
      object: i.objectId,
      title: i.title,
      downtime_min: i.downtime ? Math.round(i.downtime / 60) : null,
      ongoing: i.ongoing,
      level: i.level,
    })),
    downtime_today_min: downtime.map((d) => ({ equipment: d.equipmentId, minutes: d.minutes })),
    ai_forecasts: predictions.map((p) => ({
      level: p.level,
      title: p.title,
      value: `${p.big} ${p.unit}`,
      horizon: p.bigLabel,
      signs: p.signs,
      recommendation: p.recommendation,
      effect: p.effect,
    })),
    sensors_out_of_norm: sensors,
    equipment: EQUIPMENT.map((e) => `${e.id} — ${e.name} (${SECTIONS.find((s) => s.id === e.section)!.name})`),
  }
}

/** Названия оборудования и участков в тексте модели → кликабельные чипы карты. */
export function toParts(text: string): AnswerPart[] {
  const names: { re: string; part: (m: string) => AnswerPart }[] = [
    ...EQUIPMENT.map((e) => ({ re: e.id.replace(/[-]/g, '\\-'), part: () => ({ chip: e.id, equipmentId: e.id }) as AnswerPart })),
    ...SECTIONS.filter((s) => /-1$/.test(s.name)).map((s) => ({ re: s.name.replace(/[-]/g, '\\-'), part: () => ({ chip: s.name, section: s.id }) as AnswerPart })),
  ]
  const re = new RegExp(`(${names.map((n) => n.re).join('|')})`, 'g')
  const out: AnswerPart[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const n = names.find((x) => new RegExp(`^${x.re}$`).test(m[0]))!
    out.push(n.part(m[0]))
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  // Markdown-выделение модели убираем: в чате простой текст.
  return out.map((p) => (typeof p === 'string' ? p.replace(/\*\*|__|^#+\s*/gm, '') : p))
}

export async function askRemote(question: string, twin: Twin, history: { role: 'user' | 'assistant'; content: string }[]) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: buildContext(twin), history }),
      signal: ctrl.signal,
    })
    const data = (await res.json().catch(() => ({}))) as { answer?: string; model?: string; error?: string }
    if (!res.ok || !data.answer) throw new Error(data.error ?? `HTTP ${res.status}`)
    return { parts: toParts(data.answer), model: data.model ?? 'DeepSeek' }
  } finally {
    clearTimeout(timer)
  }
}
