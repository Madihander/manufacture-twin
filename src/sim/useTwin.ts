// Производные данные на текущий снимок. Пересчитываются раз в 10 с модельного времени,
// а не на каждый кадр: на скорости 32× это ~3 раза в секунду.
import { useMemo } from 'react'
import { useSettings } from '@/store/settings'
import { useSim } from '@/store/sim'
import { SNAPSHOT_STEP } from './model'
import { downtimeToday, incidentsAt, plantKpi, sectionKpis } from './metrics'
import { predict } from './predict'

export function useSnapshotIndex(): number {
  return useSim((s) => Math.floor(s.t / SNAPSHOT_STEP))
}

export function useTwin() {
  const run = useSim((s) => s.run)
  const idx = useSnapshotIndex()
  const thresholds = useSettings((s) => s.thresholds)

  return useMemo(() => {
    const snap = run.snapshots[Math.min(idx, run.snapshots.length - 1)]
    const plant = plantKpi(run, snap)
    // Сначала KPI без учёта ИИ, затем прогнозы, затем статусы с учётом рисков.
    const draft = sectionKpis(run, snap, thresholds, new Set())
    const predictions = predict(run, snap, draft, plant, thresholds)
    const risky = new Set(
      predictions.filter((p) => p.kind === 'failure' && p.level === 'crit').map((p) => p.equipmentId!),
    )
    const sections = sectionKpis(run, snap, thresholds, risky)
    return {
      run,
      snap,
      plant,
      sections,
      sectionById: Object.fromEntries(sections.map((k) => [k.id, k])) as Record<string, (typeof sections)[number]>,
      predictions,
      incidents: incidentsAt(run, snap.t),
      downtime: downtimeToday(run, snap.t),
      thresholds,
    }
  }, [run, idx, thresholds])
}

export type Twin = ReturnType<typeof useTwin>
