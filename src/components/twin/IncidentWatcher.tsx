import { useEffect } from 'react'
import { toast } from 'sonner'
import { notify } from '@/components/notify'
import { Button } from '@/components/ui/button'
import { clockText } from '@/sim/clock'
import { useSettings } from '@/store/settings'
import { useSim } from '@/store/sim'
import { focusIncidentObject } from './focus'

/** Когда модельное время пересекает начало инцидента — показываем уведомление и (по настройке) летим к нему. */
export function IncidentWatcher() {
  useEffect(
    () =>
      useSim.subscribe((s, prev) => {
        // Перемотку и сброс не считаем: уведомляем только при обычном ходе времени.
        if (!s.playing || s.t <= prev.t || s.t - prev.t > 60) return
        for (const inc of s.run.incidents) {
          if (inc.start <= prev.t || inc.start > s.t) continue
          const go = () => focusIncidentObject(inc.objectId, inc.section)
          const id = notify({
            tone: inc.severity === 'alarm' ? 'alarm' : 'warn',
            title: (
              <>
                {inc.severity === 'alarm' ? 'Авария' : 'Внимание'} · <span className="font-mono">{inc.objectId}</span>
              </>
            ),
            description: (
              <>
                {inc.title} · <span className="font-mono">{clockText(inc.start, false)}</span>
              </>
            ),
            actions: (
              <>
                <Button size="sm" onClick={() => { go(); toast.dismiss(id) }}>
                  Перейти
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toast.dismiss(id)}>
                  Скрыть
                </Button>
              </>
            ),
            duration: 10000,
          })
          if (useSettings.getState().display.autoFlyToAlarm && inc.severity === 'alarm') go()
        }
      }),
    [],
  )
  return null
}
