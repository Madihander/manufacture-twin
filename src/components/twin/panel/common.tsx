import type { ReactNode } from 'react'
import { CrosshairIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSim } from '@/store/sim'

/** Шапка панели детализации: надзаголовок, заголовок, бейдж, «центрировать» и «закрыть». */
export function PanelHeader({ overline, title, badge }: { overline: ReactNode; title: ReactNode; badge?: ReactNode }) {
  const select = useSim((s) => s.select)
  const cameraCmd = useSim((s) => s.cameraCmd)
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="overline">{overline}</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[26px] leading-tight tracking-[-0.01em]">{title}</span>
          {badge}
        </div>
      </div>
      <div className="flex flex-none gap-0.5">
        <Button variant="ghost" size="icon-sm" title="Центрировать на карте" onClick={() => cameraCmd({ type: 'focus' })} className="text-muted-foreground">
          <CrosshairIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Закрыть" onClick={() => select(null)} className="text-muted-foreground">
          <XIcon />
        </Button>
      </div>
    </div>
  )
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-[18px] overflow-auto px-5 pt-[18px] pb-5">{children}</div>
}

export function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="grid flex-none grid-cols-2 gap-2 border-t px-5 py-3.5">{children}</div>
}

/** Карточка KPI с прогрессом/пояснением — для 2×2 сеток панели. */
export function MetricCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-3.5 py-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
