import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Скелетон карточки KPI на время загрузки данных. */
export function KpiCardSkeleton({ titleWidth = '40%' }: { titleWidth?: string }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border bg-card px-[18px] py-4" aria-hidden>
      <div className="flex justify-between">
        <Skeleton className="h-3 rounded-sm" style={{ width: titleWidth }} />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-10 w-[52%]" />
      <Skeleton className="h-3 w-[70%] rounded-sm" />
      <Skeleton className="h-11 bg-[#f3f6f9]" />
    </div>
  )
}

/** Плашка «ИИ недоступен» с кнопкой повторного подключения. */
export function AiOfflineNotice({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <div className="flex gap-3 rounded-[10px] border border-[#f6ddb0] bg-warn-soft px-3.5 py-3">
      <WifiOffIcon className="mt-px size-[18px] flex-none text-warn" />
      <div className="flex flex-1 flex-col gap-2.5">
        <span className="text-[13px] leading-snug font-medium text-warn-fg">
          ИИ недоступен — показаны последние сохранённые рекомендации
        </span>
        <Button variant="secondary" size="sm" onClick={retry} disabled={retrying} className="self-start">
          <RefreshCwIcon className={cn(retrying && 'animate-spin')} />
          {retrying ? 'Подключение…' : 'Повторить'}
        </Button>
      </div>
    </div>
  )
}

/** Пустое состояние списка или таблицы. */
export function EmptyState({
  icon: Icon,
  text,
  actionLabel,
  onAction,
  className,
}: {
  icon: LucideIcon
  text: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3.5 px-5 py-14 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full border bg-muted">
        <Icon className="size-[22px] text-brand" strokeWidth={1.75} />
      </span>
      <span className="text-[15px]">{text}</span>
      {actionLabel && (
        <Button variant="link" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
