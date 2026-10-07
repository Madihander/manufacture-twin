import { useMemo, useState } from 'react'
import { BellIcon, BoxIcon, GitBranchIcon, LayoutDashboardIcon, SettingsIcon, SparklesIcon, TriangleAlertIcon, CircleAlertIcon } from 'lucide-react'
import logo from '@/assets/allur-logo.png'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CAR_MODELS, type ModelFilter } from '@/data/plant'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { useTwin } from '@/sim/useTwin'
import { type Screen, useSim } from '@/store/sim'
import { useUi } from '@/store/ui'
import { focusIncidentObject, focusObject } from './focus'

const NAV: { id: Screen; label: string; Icon: typeof BoxIcon }[] = [
  { id: 'topology', label: 'Топология', Icon: BoxIcon },
  { id: 'summary', label: 'Сводка', Icon: LayoutDashboardIcon },
  { id: 'scenarios', label: 'Сценарии', Icon: GitBranchIcon },
]

export function AppHeader() {
  const screen = useSim((s) => s.screen)
  const setScreen = useSim((s) => s.setScreen)
  const modelFilter = useSim((s) => s.modelFilter)
  const setModelFilter = useSim((s) => s.setModelFilter)
  const openSettings = useUi((s) => s.setSettingsOpen)
  const { predictions } = useTwin()
  const dismissed = useUi((s) => s.dismissedPredictions)
  const aiCount = predictions.filter((p) => !dismissed.has(p.id) && p.level !== 'info').length

  const openAi = () => {
    const s = useSim.getState()
    s.setScreen('topology')
    s.setTab('ai')
  }

  return (
    <header className="relative z-30 flex h-16 flex-none items-center gap-6 border-b bg-card pr-5 pl-6">
      <div className="flex flex-none items-center gap-5">
        <img src={logo} alt="Allur" className="block h-[26px]" />
        <div className="h-[30px] w-px bg-border" />
        <div className="flex flex-col gap-px">
          <span className="text-[15px] font-semibold tracking-[-0.01em]">СарыаркаАвтоПром</span>
          <span className="text-xs text-muted-foreground">Цифровой двойник</span>
        </div>
      </div>

      <nav className="flex min-w-0 flex-1 justify-center">
        <div className="flex gap-1 rounded-[10px] border bg-muted p-1">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              className={cn(
                'flex h-[34px] items-center gap-2 rounded-[7px] px-4 text-sm font-medium transition-colors',
                screen === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex flex-none items-center gap-2.5">
        <Select value={modelFilter} onValueChange={(v) => setModelFilter(v as ModelFilter)}>
          <SelectTrigger className="h-9 gap-2 text-[13px] font-medium data-[size=default]:h-9">
            <span className="font-normal text-muted-foreground max-[1600px]:hidden">Модель</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value="all">Все модели</SelectItem>
            {Object.entries(CAR_MODELS).map(([id, m]) => (
              <SelectItem key={id} value={id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] whitespace-nowrap">
          <span className="size-[7px] rounded-full bg-ok" />
          Смена 2 · <span className="font-mono text-xs">16:00–00:00</span>
        </span>
        <Button variant="secondary" onClick={openAi} className="h-9 gap-2 px-3 text-[13px]">
          <SparklesIcon className="text-brand" />
          ИИ-диспетчер
          {aiCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-alarm px-1.5 font-mono text-[11px] text-white">{aiCount}</span>
          )}
        </Button>
        <div className="mx-0.5 h-6 w-px bg-border" />
        <NotificationsBell />
        <Button variant="ghost" size="icon" title="Настройки" onClick={() => openSettings(true)} className="size-9">
          <SettingsIcon className="size-[18px]" />
        </Button>
        <div title="Начальник смены" className="flex items-center gap-2.5 pl-1">
          <span className="flex size-[34px] items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-primary">НС</span>
          <span className="text-[13px] leading-tight whitespace-nowrap max-[1600px]:hidden">
            Начальник
            <br />
            <span className="text-muted-foreground">смены</span>
          </span>
        </div>
      </div>
    </header>
  )
}

interface Notification {
  id: string
  level: 'crit' | 'warn'
  obj: string
  text: string
  time: number
  onClick: () => void
}

function NotificationsBell() {
  const { run, snap, predictions } = useTwin()
  const read = useUi((s) => s.readNotifications)
  const markRead = useUi((s) => s.markRead)
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [open, setOpen] = useState(false)

  const items = useMemo<Notification[]>(() => {
    const list: Notification[] = run.incidents
      .filter((i) => i.start <= snap.t)
      .map((i) => ({
        id: i.id,
        level: i.severity === 'alarm' ? 'crit' : 'warn',
        obj: i.objectId,
        text: i.title,
        time: i.start,
        onClick: () => focusIncidentObject(i.objectId, i.section),
      }))
    for (const p of predictions.filter((p) => p.level === 'crit' && p.kind === 'failure')) {
      list.push({
        id: `ai-${p.id}`,
        level: 'crit',
        obj: p.equipmentId ?? '',
        text: `ИИ: риск остановки ${p.big} % ${p.bigLabel}`,
        time: snap.t,
        onClick: () => focusObject({ equipmentId: p.equipmentId, section: p.section }),
      })
    }
    return list.sort((a, b) => b.time - a.time).slice(0, 8)
  }, [run, snap.t, predictions])

  const unread = items.filter((n) => !read.has(n.id))
  const shown = tab === 'all' ? items : unread

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="Уведомления" className="relative size-9">
          <BellIcon className="size-[18px]" />
          {unread.length > 0 && <span className="absolute top-1.5 right-2 size-2 rounded-full border-2 border-card bg-alarm" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[380px] gap-0 overflow-hidden rounded-lg p-0 shadow-popover">
        <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Уведомления</span>
            <button type="button" onClick={() => markRead(items.map((n) => n.id))} className="text-xs font-medium text-brand-strong hover:underline">
              Отметить все прочитанными
            </button>
          </div>
          <div className="flex gap-1 self-start rounded-md border bg-muted p-[3px]">
            {(['all', 'unread'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium',
                  tab === k ? 'bg-card shadow-[0_1px_2px_rgba(15,27,42,0.08)]' : 'text-muted-foreground',
                )}
              >
                {k === 'all' ? 'Все' : 'Непрочитанные'}
                <span className="font-mono text-[11px] text-muted-foreground">{k === 'all' ? items.length : unread.length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex max-h-[420px] flex-col overflow-auto border-t">
          {shown.map((n) => {
            const crit = n.level === 'crit'
            const Icon = crit ? TriangleAlertIcon : CircleAlertIcon
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  markRead([n.id])
                  n.onClick()
                  setOpen(false)
                }}
                className={cn('grid grid-cols-[30px_minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-3 text-left hover:bg-muted', !read.has(n.id) && 'bg-brand-soft/40')}
              >
                <span className={cn('flex size-[30px] items-center justify-center rounded-md', crit ? 'bg-alarm-soft text-alarm' : 'bg-warn-soft text-warn')}>
                  <Icon className="size-[15px]" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] leading-snug">
                    <span className="font-mono font-medium">{n.obj}</span> · {n.text}
                  </span>
                  <span className={cn('text-xs', crit ? 'text-alarm-fg' : 'text-warn-fg')}>{crit ? 'Критично' : 'Внимание'}</span>
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className="font-mono text-xs text-muted-foreground">{clockText(n.time, false)}</span>
                  {!read.has(n.id) && <span className="size-[7px] rounded-full bg-brand" />}
                </span>
              </button>
            )
          })}
          {shown.length === 0 && <div className="px-4 py-7 text-center text-[13px] text-muted-foreground">Непрочитанных уведомлений нет</div>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
