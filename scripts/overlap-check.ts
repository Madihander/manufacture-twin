// Проверка сцены: кузова не должны перекрываться ни в один момент смены. npx tsx scripts/overlap-check.ts
import { runShift } from '../src/sim/engine'
import { CAR_L, CAR_W, carPose } from '../src/scene/layout'

const run = runShift()
let worst = Infinity
let at = ''
for (const s of run.snapshots) {
  const poses = Array.from(s.carIds, (_, k) => carPose(s.carLoc[k], s.carP[k]))
  for (let a = 0; a < poses.length; a++)
    for (let b = a + 1; b < poses.length; b++) {
      const pa = poses[a], pb = poses[b]
      // Прямоугольники кузовов (с учётом поворота) — пересечение по осям.
      const ha = pa.rot ? [CAR_W / 2, CAR_L / 2] : [CAR_L / 2, CAR_W / 2]
      const hb = pb.rot ? [CAR_W / 2, CAR_L / 2] : [CAR_L / 2, CAR_W / 2]
      const ox = ha[0] + hb[0] - Math.abs(pa.x - pb.x)
      const oz = ha[1] + hb[1] - Math.abs(pa.z - pb.z)
      if (ox > 0 && oz > 0) {
        const o = Math.min(ox, oz)
        if (-o < worst) { worst = -o; at = `t=${s.t} loc ${s.carLoc[a]}/${s.carLoc[b]} p ${s.carP[a].toFixed(2)}/${s.carP[b].toFixed(2)}` }
      }
    }
}
console.log(worst === Infinity ? 'перекрытий нет' : `перекрытие ${(-worst).toFixed(3)} ${at}`)
