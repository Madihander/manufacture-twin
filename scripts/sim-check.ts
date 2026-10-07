// Быстрая проверка калибровки симуляции: npx tsx scripts/sim-check.ts
import { runShift, snapshotAt } from '../src/sim/engine'
import { DEMO_START_T, SHIFT_LEN, STATIONS, TAKT } from '../src/sim/model'

const t0 = performance.now()
const run = runShift()
console.log(`прогон: ${(performance.now() - t0).toFixed(0)} мс, снимков ${run.snapshots.length}, кузовов ${run.cars.size}`)
for (const t of [DEMO_START_T, SHIFT_LEN]) {
  const s = snapshotAt(run, t)
  const hh = Math.floor((16 * 3600 + t) / 3600) % 24, mm = Math.floor(((16 * 3600 + t) % 3600) / 60)
  console.log(`\n== ${hh}:${String(mm).padStart(2, '0')}  план к моменту ${(t / TAKT).toFixed(0)}  склад ГП ${s.whOut}  комплектов ${s.kits}`)
  s.stations.forEach((c, i) => {
    const elapsed = t, planned = elapsed - c.plannedDownSec
    const A = (planned - c.downSec) / planned
    const P = (c.produced * TAKT) / Math.max(1, planned - c.downSec)
    const Q = (c.produced - c.defects) / Math.max(1, c.produced)
    console.log(`${STATIONS[i].id.padEnd(9)} вып ${String(c.produced).padStart(3)} брак ${String(c.defects).padStart(2)} (${(100 * c.defects / Math.max(1, c.produced)).toFixed(1)}%) A ${(A * 100).toFixed(1)} P ${(P * 100).toFixed(1)} Q ${(Q * 100).toFixed(1)} OEE ${(A * P * Q * 100).toFixed(1)}  busy ${(c.busySec / 60).toFixed(0)}м blk ${(c.blockedSec / 60).toFixed(0)}м starv ${(c.starvedSec / 60).toFixed(0)}м q ${c.queue} wip ${c.wip}`)
  })
}
console.log('\nинциденты:', run.incidents.map((i) => `${i.title}@${((16 * 3600 + i.start) / 3600).toFixed(2)}`).join('; '))
