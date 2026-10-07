import type { ReactNode } from 'react'
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tone = 'ok' | 'warn' | 'alarm' | 'info'

const TONE = {
  ok: { stripe: 'bg-ok', tile: 'bg-ok-soft text-ok', Icon: CheckIcon },
  warn: { stripe: 'bg-warn', tile: 'bg-warn-soft text-warn', Icon: TriangleAlertIcon },
  alarm: { stripe: 'bg-alarm', tile: 'bg-alarm-soft text-alarm', Icon: TriangleAlertIcon },
  info: { stripe: 'bg-brand', tile: 'bg-brand-soft text-brand', Icon: InfoIcon },
} satisfies Record<Tone, unknown>

interface NotifyOptions {
  tone: Tone
  title: ReactNode
  description?: ReactNode
  /** Кнопки действий под текстом (например «Перейти»). */
  actions?: ReactNode
  duration?: number
}

/** Карточка-уведомление из дизайн-системы: цветная полоса слева, иконка, текст, крестик. */
export function notify({ tone, title, description, actions, duration = 6000 }: NotifyOptions) {
  const t = TONE[tone]
  return toast.custom(
    (id) => (
      <div className="flex w-[340px] overflow-hidden rounded-lg border bg-card shadow-toast">
        <div className={cn('w-1 flex-none', t.stripe)} />
        <div className="flex flex-1 items-start gap-3 py-3.5 pr-3 pl-3.5">
          <span className={cn('flex size-7 flex-none items-center justify-center rounded-md', t.tile)}>
            <t.Icon className="size-[15px]" strokeWidth={2.5} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">{title}</span>
            {description && <span className="text-xs text-muted-foreground">{description}</span>}
            {actions && <div className="mt-2 flex gap-2">{actions}</div>}
          </div>
          <button
            type="button"
            title="Закрыть"
            onClick={() => toast.dismiss(id)}
            className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
          >
            <XIcon className="size-[13px]" />
          </button>
        </div>
      </div>
    ),
    { duration },
  )
}
