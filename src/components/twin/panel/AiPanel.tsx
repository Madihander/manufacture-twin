import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, CircleAlertIcon, HelpCircleIcon, InfoIcon, MapPinIcon, MoreHorizontalIcon, SendIcon, SparklesIcon, TriangleAlertIcon, WrenchIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import type { Prediction, PredictionLevel } from '@/sim/predict'
import { useTwin } from '@/sim/useTwin'
import { useMaintenance } from '@/store/maintenance'
import { useUi } from '@/store/ui'
import { type AnswerPart, useAiChat } from '../ai/chat'
import { answerLocal } from '../ai/localAnswer'
import { askRemote } from '../ai/remote'
import { focusObject } from '../focus'

const LEVEL = {
  crit: { text: 'Критично', stripe: 'bg-alarm', tile: 'bg-alarm-soft text-alarm', fg: 'text-alarm-fg', Icon: TriangleAlertIcon },
  warn: { text: 'Внимание', stripe: 'bg-warn', tile: 'bg-warn-soft text-warn', fg: 'text-warn-fg', Icon: CircleAlertIcon },
  info: { text: 'Инфо', stripe: 'bg-brand', tile: 'bg-brand-soft text-brand', fg: 'text-brand-strong', Icon: InfoIcon },
} satisfies Record<PredictionLevel, unknown>

type Horizon = '2h' | 'shift' | 'day'

const ASK_CHIPS = ['Почему просела Окраска?', 'Что будет, если Конвейер-03 встанет на час?', 'Сводка смены для директора']

export function AiPanel() {
  const twin = useTwin()
  const dismissed = useUi((s) => s.dismissedPredictions)
  const [levels, setLevels] = useState<Record<PredictionLevel, boolean>>({ crit: true, warn: true, info: true })
  const [horizon, setHorizon] = useState<Horizon>('shift')

  const cards = twin.predictions.filter((p) => {
    if (dismissed.has(p.id) || !levels[p.level]) return false
    if (p.etaHours === undefined) return true
    return horizon === '2h' ? p.etaHours <= 2 : horizon === 'shift' ? p.etaHours <= 8 : true
  })

  return (
    <>
      <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-4 overflow-auto px-5 pt-[18px] pb-5">
        <div className="flex flex-col gap-1">
          <span className="text-[26px] tracking-[-0.01em]">ИИ-диспетчер</span>
          <span className="text-xs text-muted-foreground">
            Обновлено <span className="font-mono">{clockText(twin.snap.t, false)}</span> · анализ 24 датчиков и журнала простоев
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          {(['crit', 'warn', 'info'] as const).map((l) => (
            <label key={l} className="flex cursor-pointer items-center gap-[7px] text-[13px] whitespace-nowrap">
              <Checkbox checked={levels[l]} onCheckedChange={(v) => setLevels((s) => ({ ...s, [l]: v === true }))} />
              {LEVEL[l].text}
            </label>
          ))}
          <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
            <SelectTrigger className="ml-auto h-8 text-[13px] font-medium data-[size=default]:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="2h">2 ч</SelectItem>
              <SelectItem value="shift">Смена</SelectItem>
              <SelectItem value="day">Сутки</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {cards.map((p) => (
          <PredictionCard key={p.id} p={p} />
        ))}
        {cards.length === 0 && <span className="py-6 text-center text-[13px] text-muted-foreground">Активных прогнозов по выбранным фильтрам нет</span>}
      </div>
      <AskTwin />
    </>
  )
}

function PredictionCard({ p }: { p: Prediction }) {
  const L = LEVEL[p.level]
  const [why, setWhy] = useState(false)
  const dismiss = useUi((s) => s.dismissPrediction)
  const openDraft = useMaintenance((s) => s.openDraft)
  const target = p.equipmentId ?? (p.section ? undefined : null)
  return (
    <div className="flex rounded-lg border bg-card">
      <div className={cn('w-1 flex-none rounded-l-[11px]', L.stripe)} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-3.5">
        <div className="grid grid-cols-[30px_minmax(0,1fr)_28px] items-start gap-2.5">
          <span className={cn('flex size-[30px] items-center justify-center rounded-md', L.tile)}>
            <L.Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={cn('text-[11px] font-semibold tracking-[0.12em] uppercase', L.fg)}>{L.text}</span>
            <span className="text-sm leading-snug font-medium">{p.title}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" title="Ещё" className="size-7 text-muted-foreground">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px]">
              <DropdownMenuItem onSelect={() => setWhy((v) => !v)} className="text-[13px]">
                <HelpCircleIcon className="text-muted-foreground" />
                Почему такой прогноз?
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => dismiss(p.id)} className="text-[13px] text-alarm-fg focus:bg-alarm-soft focus:text-alarm-fg">
                <XIcon className="text-alarm-fg" />
                Отклонить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-[34px] leading-none font-light tracking-[-0.02em] whitespace-nowrap text-primary">
            {p.big}
            <span className="text-base text-muted-foreground"> {p.unit}</span>
          </span>
          <span className="text-[13px] text-muted-foreground">{p.bigLabel}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="overline text-[11px]">Признаки</span>
          {p.signs.map((s) => (
            <span key={s} className="flex gap-2 text-[13px] leading-snug">
              <span className="mt-2 size-1 flex-none rounded-full bg-chart-plan" />
              {s}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="overline text-[11px]">Рекомендация</span>
          <span className="text-[13px] leading-normal">{p.recommendation}</span>
        </div>
        {p.effect && (
          <div className="flex flex-col gap-1 rounded-md bg-brand-soft px-3 py-2.5">
            <span className="overline text-[11px] text-primary">Эффект</span>
            <span className="text-[13px] leading-normal text-primary">{p.effect}</span>
          </div>
        )}
        {why && (
          <div className="flex gap-2 rounded-md border bg-muted px-3 py-2.5 text-xs leading-normal text-muted-foreground">
            <HelpCircleIcon className="mt-px size-3.5 flex-none" />
            {p.why}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-[34px] flex-1"
            disabled={target === null}
            onClick={() => focusObject({ equipmentId: p.equipmentId, section: p.section })}
          >
            <MapPinIcon />
            Показать на карте
          </Button>
          <Button
            size="sm"
            className="h-[34px] flex-1"
            disabled={!p.equipmentId && p.section !== 'painting'}
            onClick={() => openDraft({ equipmentId: p.equipmentId ?? 'Камера-02', aiComment: `${p.recommendation}. Признаки: ${p.signs.join('; ')}.` })}
          >
            <WrenchIcon />
            Создать заявку ТО
          </Button>
        </div>
      </div>
    </div>
  )
}

function AskTwin() {
  const twin = useTwin()
  const messages = useAiChat((s) => s.messages)
  const ask = useAiChat((s) => s.ask)
  const answer = useAiChat((s) => s.answer)
  const take = useAiChat((s) => s.take)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(true)
  const list = useRef<HTMLDivElement>(null)

  // Новый вопрос: сначала языковая модель (DeepSeek через /api/ask), при ошибке — офлайн-ответ по тем же данным.
  useEffect(() => {
    const q = messages.find((m) => m.pending && !m.inFlight)
    if (!q) return
    take(q.id)
    const history = messages
      .filter((m) => m.id < q.id && !m.pending)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }))
    askRemote(q.text, twin, history)
      .then(({ parts, model }) => answer(q.id, parts, { kind: 'llm', model }))
      .catch((e: Error) => answer(q.id, answerLocal(q.text, twin), { kind: 'offline', reason: e.message }))
  }, [messages, twin, answer, take])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = (text: string) => {
    ask(text)
    setQ('')
    setOpen(true)
  }

  return (
    <div className="flex flex-none flex-col gap-2.5 border-t bg-card px-5 pt-3 pb-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <SparklesIcon className="size-[15px] text-brand" />
          Спросить двойника
        </span>
        <Button variant="ghost" size="icon-sm" title={open ? 'Свернуть' : 'Развернуть'} onClick={() => setOpen((v) => !v)} className="size-7 text-muted-foreground">
          <ChevronDownIcon className={cn('transition-transform', !open && 'rotate-180')} />
        </Button>
      </div>
      {open && messages.length > 0 && (
        <div ref={list} className="flex max-h-[220px] flex-col gap-3 overflow-auto py-0.5">
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="max-w-[85%] self-end rounded-[10px_10px_2px_10px] bg-brand-soft px-3 py-2 text-[13px] leading-snug text-primary">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary">
                  <SparklesIcon className="size-3 text-white" strokeWidth={2.25} />
                </span>
                <div className="flex flex-col gap-1">
                  <div className="text-[13px] leading-[1.75] whitespace-pre-line">
                    <Parts parts={m.parts ?? [m.text]} />
                  </div>
                  {m.source && (
                    <span className="text-[11px] text-muted-foreground" title={m.source.kind === 'offline' ? m.source.reason : undefined}>
                      {m.source.kind === 'llm' ? `DeepSeek · ${m.source.model} · по данным двойника` : 'Офлайн-ответ по данным двойника — ИИ-сервер недоступен'}
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
          {messages.some((m) => m.pending) && (
            <div className="flex items-center gap-2 pl-[34px] text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              Анализирую данные…
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {ASK_CHIPS.map((c) => (
          <button key={c} type="button" onClick={() => send(c)} className="h-7 rounded-full border bg-card px-2.5 text-xs whitespace-nowrap hover:border-brand hover:bg-brand-soft">
            {c}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Спросите о линии, участке или оборудовании"
          className="h-10 min-w-0 flex-1 rounded-md border bg-card px-3 text-[13px] outline-none focus:border-ring"
        />
        <Button type="submit" size="icon" title="Отправить" disabled={!q.trim()}>
          <SendIcon />
        </Button>
      </form>
    </div>
  )
}

function Parts({ parts }: { parts: AnswerPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => focusObject({ equipmentId: p.equipmentId, section: p.section })}
            className="mx-0.5 inline-flex h-[22px] items-center gap-1 rounded-sm border border-[#cfe6f3] bg-brand-soft px-[7px] align-[1px] font-mono text-xs text-primary hover:border-brand"
          >
            <MapPinIcon className="size-[11px] text-brand" strokeWidth={2.5} />
            {p.chip}
          </button>
        ),
      )}
    </>
  )
}
