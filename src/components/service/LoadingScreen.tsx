import logo from '@/assets/allur-logo.png'
import { cn } from '@/lib/utils'

interface LoadingScreenProps {
  /** 0–100 */
  progress: number
  label?: string
  /** Строка-детализация под прогрессом, например «геометрия участков · 6 / 6». */
  detail?: string
  /** Встроить в контейнер вместо полноэкранного слоя (для превью). */
  embedded?: boolean
}

export function LoadingScreen({ progress, label = 'Загрузка модели цеха…', detail, embedded }: LoadingScreenProps) {
  const pct = Math.round(Math.min(100, Math.max(0, progress)))
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center bg-background',
        embedded ? 'absolute inset-0' : 'fixed inset-0 z-[100]',
      )}
    >
      <div className="flex w-[420px] flex-col items-center gap-7">
        <img src={logo} alt="Allur" className="block h-16" />
        <div className="flex items-center gap-3.5 text-xl">
          <span className="font-semibold tracking-[-0.01em]">СарыаркаАвтоПром</span>
          <span className="h-5 w-px bg-switch-off" />
          <span className="text-muted-foreground">Цифровой двойник</span>
        </div>
        <div className="mt-3 flex w-full flex-col gap-2.5">
          <div className="flex justify-between text-[13px] text-muted-foreground">
            <span>{label}</span>
            <span className="font-mono text-foreground">{pct} %</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          {detail && <span className="text-center font-mono text-[11px] text-chart-plan">{detail}</span>}
        </div>
      </div>
      <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-chart-plan">
        Qostanai Industry Hackathon · АО «Группа компаний Аллюр»
      </span>
    </div>
  )
}
