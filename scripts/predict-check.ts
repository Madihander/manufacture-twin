import { runShift, snapshotAt } from '../src/sim/engine'
import { plantKpi, sectionKpis } from '../src/sim/metrics'
import { predict } from '../src/sim/predict'
import { DEMO_START_T } from '../src/sim/model'
import { MONTH_OUTPUT_BEFORE_SHIFT, AVG_DAILY_OUTPUT } from '../src/data/history'
const th = { oeeMin: 85, defectMax: 2, downtimeMax: 60 }
const run = runShift()
console.log('месяц до смены', MONTH_OUTPUT_BEFORE_SHIFT, 'ср/день', AVG_DAILY_OUTPUT.toFixed(1))
for (const t of [3 * 3600 + 45 * 60, DEMO_START_T]) {
  const snap = snapshotAt(run, t)
  const k0 = sectionKpis(run, snap, th, new Set())
  const plant = plantKpi(run, snap)
  const preds = predict(run, snap, k0, plant, th)
  const risky = new Set(preds.filter((p) => p.kind === 'failure').map((p) => p.equipmentId!))
  const kpis = sectionKpis(run, snap, th, risky)
  console.log(`\n=== t=${(16 + t / 3600).toFixed(2)}ч`, JSON.stringify({ ...plant, perHour: +plant.perHour.toFixed(1), oee: +plant.oee.toFixed(3), defectRate: +plant.defectRate.toFixed(3) }))
  for (const k of kpis) console.log(k.id.padEnd(9), k.status.padEnd(5), k.metric.padEnd(14), k.reasons.join(' | '))
  for (const p of preds) console.log(`  [${p.level}] ${p.title}: ${p.big} ${p.unit} ${p.bigLabel} — ${p.signs.join('; ')}`)
}
