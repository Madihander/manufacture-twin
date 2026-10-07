// Временная витрина служебных окон, повторяет холст design/Служебные окна.dc.html.
// Уйдёт, когда появятся экраны «Топология» и «Сводка».
import { useEffect, useState } from 'react'
import { CalendarCheckIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingScreen } from '@/components/service/LoadingScreen'
import { AiOfflineNotice, EmptyState, KpiCardSkeleton } from '@/components/service/States'
import { useMaintenance } from '@/store/maintenance'
import { useUi } from '@/store/ui'

const AI_TEXT =
  'Осмотреть подшипник оси 2 в технологический перерыв 22:00, подготовить запасной датчик. Признаки: вибрация +38 % за 6 ч, температура оси 2 +9 °C.'

export function ServiceShowcase() {
  const openSettings = useUi((s) => s.setSettingsOpen)
  const openDraft = useMaintenance((s) => s.openDraft)
  const tickets = useMaintenance((s) => s.tickets)
  const progress = useFakeProgress()

  return (
    <div className="flex min-w-[1440px] flex-col gap-12 bg-[#e9eef3] p-12">
      <div className="flex flex-col gap-2">
        <div className="overline flex gap-3">
          <span>Цифровой двойник</span>
          <span className="text-[#b8c2cf]">|</span>
          <span>Служебные окна</span>
        </div>
        <h1 className="text-4xl font-normal tracking-[-0.02em]">Окна, загрузка и пустые состояния</h1>
      </div>

      <section className="grid grid-cols-2 gap-8">
        <Frame n={1} title="Sheet «Настройки»" hint="по клику на шестерёнку" caption="экран «Топология»">
          <Button variant="secondary" onClick={() => openSettings(true)}>
            <SettingsIcon />
            Открыть настройки
          </Button>
        </Frame>
        <Frame n={2} title="Dialog «Заявка на ТО»" hint="из карточки ИИ или оборудования" caption="экран «Топология» · вкладка ИИ">
          <div className="flex flex-col items-center gap-3">
            <Button onClick={() => openDraft({ equipmentId: 'ABB-01', aiComment: AI_TEXT })}>Создать заявку ТО</Button>
            {tickets.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground">
                создано: {tickets.map((t) => t.id).join(', ')}
              </span>
            )}
          </div>
        </Frame>
      </section>

      <section className="flex flex-col gap-3">
        <FrameTitle n={3} title="Экран загрузки приложения" />
        <div className="relative aspect-video max-h-[760px] overflow-hidden rounded-lg border border-border-strong">
          <LoadingScreen
            embedded
            progress={progress}
            detail={`геометрия участков · 6 / 6 · оборудование · ${Math.min(10, Math.floor(progress / 10))} / 10`}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <FrameTitle n={4} title="Состояния загрузки, ошибки и пустоты" />
        <span className="font-mono text-xs text-muted-foreground">KPI · Skeleton</span>
        <div className="grid grid-cols-4 gap-3">
          {['42%', '30%', '48%', '36%'].map((w) => (
            <KpiCardSkeleton key={w} titleWidth={w} />
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[420px_minmax(0,1fr)] items-start gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">Вкладка «ИИ» · нет связи</span>
            <div className="flex flex-col gap-3.5 rounded-lg border bg-card px-5 py-[18px]">
              <div className="flex flex-col gap-1">
                <span className="text-[22px] tracking-[-0.01em]">ИИ-диспетчер</span>
                <span className="text-xs text-muted-foreground">
                  Последнее обновление <span className="font-mono">21:12</span>
                </span>
              </div>
              <AiOfflineNotice onRetry={() => new Promise((r) => setTimeout(r, 1500))} />
              <CachedForecast title="ABB-01 — риск остановки" probability={78} horizon="в течение 2 ч" />
              <CachedForecast title="Окраска-1 — брак выше порога 2-е сутки" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">Журнал инцидентов · пусто</span>
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-base font-medium">Журнал простоев</span>
                <span className="font-mono text-xs text-muted-foreground">16.10.2026 — 18.10.2026</span>
              </div>
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow className="text-xs">
                    <TableHead className="pl-5">Дата</TableHead>
                    <TableHead>Участок</TableHead>
                    <TableHead>Оборудование</TableHead>
                    <TableHead>Причина</TableHead>
                    <TableHead className="text-right">Длительность</TableHead>
                    <TableHead className="pr-5 text-right">Статус</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
              <EmptyState icon={CalendarCheckIcon} text="За выбранный период инцидентов нет" actionLabel="Изменить период" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FrameTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 items-center rounded-sm bg-primary px-2 font-mono text-xs text-primary-foreground">{n}</span>
      <span className="text-base font-medium">{title}</span>
      {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

function Frame({
  n,
  title,
  hint,
  caption,
  children,
}: {
  n: number
  title: string
  hint: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <FrameTitle n={n} title={title} hint={hint} />
      <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-[repeating-linear-gradient(135deg,#eef2f6_0_1px,#f5f7fa_1px_14px)]">
        <span className="absolute top-[18px] left-5 font-mono text-xs text-muted-foreground">{caption}</span>
        {children}
      </div>
    </div>
  )
}

function CachedForecast({ title, probability, horizon }: { title: string; probability?: number; horizon?: string }) {
  return (
    <div className="flex rounded-lg border opacity-70">
      <div className="w-1 flex-none rounded-l-[11px] bg-alarm" />
      <div className="flex flex-1 flex-col gap-2 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-alarm-fg uppercase">Критично</span>
          <span className="font-mono text-[11px] text-muted-foreground">сохранено 21:12</span>
        </div>
        <span className="text-sm font-medium">{title}</span>
        {probability !== undefined && (
          <span className="text-[30px] leading-none font-light tracking-[-0.02em] text-primary">
            {probability}
            <span className="text-[15px] text-muted-foreground"> %</span>{' '}
            <span className="text-[13px] tracking-normal text-muted-foreground">{horizon}</span>
          </span>
        )}
      </div>
    </div>
  )
}

/** Прогресс-бар для превью: крутится по кругу 0 → 100. */
function useFakeProgress() {
  const [p, setP] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setP((v) => (v >= 100 ? 0 : v + 2)), 120)
    return () => clearInterval(id)
  }, [])
  return p
}
