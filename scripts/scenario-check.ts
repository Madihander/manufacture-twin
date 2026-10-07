import { runShift } from '../src/sim/engine'
import { baseline, DEFAULT_INPUT, runScenario } from '../src/sim/scenario'
const b = baseline(runShift())
console.log('база', b.shiftOutput, 'OEE', b.oee.toFixed(3), 'очередь', b.maxQueue, 'месяц', b.monthForecast)
for (const p of [{ duration: 0 }, { duration: 120 }, { takt: 225 }, { paintDefect: 2 }, { shifts: 3 as const }, { saturdays: true }]) {
  const o = runScenario({ ...DEFAULT_INPUT, ...p })
  console.log(JSON.stringify(p), o.shiftOutput, 'OEE', o.oee.toFixed(3), 'очередь', o.maxQueue, 'ст', o.maxQueueStation, 'месяц', o.monthForecast, 'брак окр', (o.paintDefectRate * 100).toFixed(1))
}
