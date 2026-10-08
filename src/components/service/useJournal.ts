import { useMemo } from 'react'
import { historyTickets, type MaintenanceTicket, useMaintenance } from '@/store/maintenance'
import { useSim } from '@/store/sim'

/** Все заявки на текущий момент модельного времени: созданные в приложении + история завода. */
export function useJournal(): MaintenanceTicket[] {
  const created = useMaintenance((s) => s.tickets)
  // Шаг 10 с модельного времени: аварийные заявки появляются вместе с остановкой, без перерисовки каждый кадр.
  const step = useSim((s) => Math.floor(s.t / 10))
  const run = useSim((s) => s.run)
  return useMemo(() => {
    const all = [...created, ...historyTickets(step * 10, run.params.downtimes)]
    return all.sort((a, b) => b.date.getTime() - a.date.getTime() || timeKey(b).localeCompare(timeKey(a)) || b.id.localeCompare(a.id))
  }, [created, step, run])
}

/** Порядок внутри дня: время работ, для истории — начало смены. */
const timeKey = (t: MaintenanceTicket) => t.timeFrom || (t.shift === 1 ? '08:00' : '16:00')
