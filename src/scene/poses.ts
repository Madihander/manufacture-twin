// Положения кузовов и состояние участков на текущий кадр — общие для кузовов и анимаций оборудования.
import type { ShiftRun } from '@/sim/engine'
import { SNAPSHOT_STEP } from '@/sim/model'
import { carPose, type Pose } from './layout'

export interface FramePose {
  id: number
  x: number
  y: number
  z: number
  rot: number
  painted: boolean
  /** Код положения из снимка (см. engine.ts): 2i+1 — в работе на станции i. */
  loc: number
}

let cache: { run: unknown; t: number; poses: FramePose[] } | null = null

/** Положения всех кузовов на момент t — считаются один раз за кадр для всех потребителей. */
export function framePoses(run: ShiftRun, t: number): FramePose[] {
  if (cache && cache.run === run && cache.t === t) return cache.poses
  const i = Math.min(run.snapshots.length - 1, Math.floor(t / SNAPSHOT_STEP))
  const sa = run.snapshots[i]
  const sb = run.snapshots[Math.min(run.snapshots.length - 1, i + 1)]
  const f = Math.min(1, (t - sa.t) / SNAPSHOT_STEP)
  const next = new Map<number, Pose>()
  for (let k = 0; k < sb.carIds.length; k++) next.set(sb.carIds[k], carPose(sb.carLoc[k], sb.carP[k]))
  const poses: FramePose[] = []
  for (let k = 0; k < sa.carIds.length; k++) {
    const id = sa.carIds[k]
    const pa = carPose(sa.carLoc[k], sa.carP[k])
    const pb = next.get(id) ?? pa
    // Переход буфер ↔ станция не интерполируем по диагонали — переставляем в середине шага.
    const jump = Math.abs(pb.rot - pa.rot) > 0.1
    poses.push({
      id,
      x: jump ? (f < 0.5 ? pa.x : pb.x) : pa.x + (pb.x - pa.x) * f,
      y: jump ? (f < 0.5 ? pa.y : pb.y) : pa.y + (pb.y - pa.y) * f,
      z: jump ? (f < 0.5 ? pa.z : pb.z) : pa.z + (pb.z - pa.z) * f,
      rot: jump ? (f < 0.5 ? pa.rot : pb.rot) : pa.rot,
      // Окрашен — после выхода из камеры окраски (loc ≥ 4 — дальше по линии).
      painted: sa.carLoc[k] >= 4 || (sa.carLoc[k] === 3 && sa.carP[k] > 0.6),
      loc: sa.carLoc[k],
    })
  }
  cache = { run, t, poses }
  return poses
}

export type Activity = 'work' | 'idle' | 'down'

/**
 * Что делает станция сейчас — по приросту счётчиков между соседними снимками:
 * остановка оборудования, работа или простой без кузовов / с заполненным выходом.
 */
export function stationActivity(run: ShiftRun, t: number, station: number): Activity {
  const i = Math.min(run.snapshots.length - 2, Math.floor(t / SNAPSHOT_STEP))
  if (i < 0) return 'idle'
  const a = run.snapshots[i].stations[station]
  const b = run.snapshots[i + 1].stations[station]
  const down = b.downSec - a.downSec + (b.plannedDownSec - a.plannedDownSec)
  const busy = b.busySec - a.busySec
  if (down > 0 && down >= busy) return 'down'
  return busy > 0 ? 'work' : 'idle'
}
