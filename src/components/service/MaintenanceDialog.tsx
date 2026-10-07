import { useState } from 'react'
import { ru } from 'react-day-picker/locale'
import { CalendarIcon, ClockIcon, LockIcon, SparklesIcon, WrenchIcon, XIcon } from 'lucide-react'
import { notify } from '@/components/notify'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DEMO_NOW,
  MAINTENANCE_CREWS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_WORK_TYPES,
  type MaintenanceCrew,
  type MaintenancePriority,
  type MaintenanceWorkType,
} from '@/data/plant'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type MaintenanceDraft, useMaintenance } from '@/store/maintenance'

const PRIORITY_DOT: Record<MaintenancePriority, string> = {
  Низкий: 'bg-chart-plan',
  Средний: 'bg-warn',
  Высокий: 'bg-alarm',
}

const TODAY = new Date(DEMO_NOW.getFullYear(), DEMO_NOW.getMonth(), DEMO_NOW.getDate())

export function MaintenanceDialog() {
  const draft = useMaintenance((s) => s.draft)
  const closeDraft = useMaintenance((s) => s.closeDraft)

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && closeDraft()}>
      <DialogContent showCloseButton={false} className="w-[560px] max-w-[560px] gap-0 p-0 sm:max-w-[560px]">
        {draft && <MaintenanceForm key={draft.equipmentId} draft={draft} />}
      </DialogContent>
    </Dialog>
  )
}

function MaintenanceForm({ draft }: { draft: MaintenanceDraft }) {
  const createTicket = useMaintenance((s) => s.createTicket)
  const [workType, setWorkType] = useState<MaintenanceWorkType>('Осмотр')
  const [priority, setPriority] = useState<MaintenancePriority>('Высокий')
  const [date, setDate] = useState<Date>(TODAY)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [timeFrom, setTimeFrom] = useState('22:00')
  const [timeTo, setTimeTo] = useState('22:30')
  const [crew, setCrew] = useState<MaintenanceCrew>('Бригада ТО-2')
  const [comment, setComment] = useState(draft.aiComment ?? '')

  const timeInvalid = !timeFrom || !timeTo || timeTo <= timeFrom

  const submit = () => {
    if (timeInvalid) return
    const ticket = createTicket({
      equipmentId: draft.equipmentId,
      workType,
      priority,
      date,
      timeFrom,
      timeTo,
      crew,
      comment,
    })
    notify({
      tone: 'ok',
      title: (
        <>
          Заявка <span className="font-mono">{ticket.id}</span> создана
        </>
      ),
      description: (
        <>
          <span className="font-mono">{ticket.equipmentId}</span> · {formatDate(ticket.date)} · {ticket.crew}
        </>
      ),
    })
  }

  return (
    <>
      <div className="flex items-start justify-between px-6 pt-5 pb-1">
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-xl font-medium">Заявка на ТО</DialogTitle>
          <DialogDescription className="text-[13px]">Будет передана в службу главного механика</DialogDescription>
        </div>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" title="Закрыть" className="text-muted-foreground">
            <XIcon />
          </Button>
        </DialogClose>
      </div>

      <div className="flex flex-col gap-4 px-6 pt-4 pb-5">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Оборудование">
            <div className="flex h-[38px] items-center justify-between gap-2 rounded-md border bg-muted px-3">
              <span className="font-mono text-[13px]">{draft.equipmentId}</span>
              <LockIcon className="size-3.5 text-chart-plan" />
            </div>
          </Field>
          <Field label="Тип работ">
            <Select value={workType} onValueChange={(v) => setWorkType(v as MaintenanceWorkType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {MAINTENANCE_WORK_TYPES.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Приоритет">
          <ToggleGroup
            type="single"
            spacing={0}
            value={priority}
            onValueChange={(v) => v && setPriority(v as MaintenancePriority)}
            className="grid w-full grid-cols-3 overflow-hidden rounded-md border"
          >
            {MAINTENANCE_PRIORITIES.map((p) => (
              <ToggleGroupItem
                key={p}
                value={p}
                className="h-9 rounded-none border-r text-[13px] text-muted-foreground last:border-r-0 hover:bg-muted data-[state=on]:bg-brand-soft data-[state=on]:text-primary"
              >
                <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[p])} />
                {p}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field label="Окно работ">
          <div className="grid grid-cols-[minmax(0,1fr)_92px_12px_92px] items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-[38px] items-center gap-2 rounded-md border bg-card px-3 font-mono text-[13px] outline-none focus-visible:border-ring data-[state=open]:border-brand"
                >
                  <CalendarIcon className="size-[15px] text-muted-foreground" />
                  {formatDate(date)}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto rounded-lg p-2 shadow-popover">
                <Calendar
                  mode="single"
                  locale={ru}
                  weekStartsOn={1}
                  required
                  selected={date}
                  defaultMonth={date}
                  disabled={{ before: TODAY }}
                  onSelect={(d) => {
                    setDate(d)
                    setCalendarOpen(false)
                  }}
                  className="[--cell-size:34px] [&_.rdp-caption_label]:capitalize"
                />
              </PopoverContent>
            </Popover>
            <TimeInput value={timeFrom} onChange={setTimeFrom} icon invalid={timeInvalid} label="Начало работ" />
            <span className="text-center text-muted-foreground">–</span>
            <TimeInput value={timeTo} onChange={setTimeTo} invalid={timeInvalid} label="Окончание работ" />
          </div>
        </Field>

        <Field label="Исполнитель">
          <Select value={crew} onValueChange={(v) => setCrew(v as MaintenanceCrew)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {MAINTENANCE_CREWS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={
            <>
              Комментарий
              {draft.aiComment && (
                <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-brand-soft px-1.5 text-[11px] font-medium text-primary">
                  <SparklesIcon className="size-[11px] text-brand" strokeWidth={2.25} />
                  из рекомендации ИИ
                </span>
              )}
            </>
          }
        >
          <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} className="resize-y" />
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t px-6 py-3.5">
        <DialogClose asChild>
          <Button variant="secondary">Отмена</Button>
        </DialogClose>
        <Button onClick={submit} disabled={timeInvalid}>
          <WrenchIcon className="size-[15px]" />
          Создать заявку
        </Button>
      </div>
    </>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] font-medium">{label}</span>
      {children}
    </div>
  )
}

function TimeInput({
  value,
  onChange,
  icon,
  invalid,
  label,
}: {
  value: string
  onChange: (v: string) => void
  icon?: boolean
  invalid?: boolean
  label: string
}) {
  return (
    <label
      className={cn(
        'flex h-[38px] items-center justify-center gap-1.5 rounded-md border bg-card px-2 focus-within:border-ring',
        invalid && 'border-alarm',
      )}
    >
      {icon && <ClockIcon className="size-[13px] flex-none text-muted-foreground" />}
      <input
        type="time"
        step={1800}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-center font-mono text-[13px] outline-none [&::-webkit-calendar-picker-indicator]:hidden"
      />
    </label>
  )
}
