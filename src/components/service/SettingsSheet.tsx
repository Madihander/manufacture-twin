import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { parseDecimal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type DisplayPrefs, type SettingsValues, type Thresholds, useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'

const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; unit: string }[] = [
  { key: 'oeeMin', label: 'OEE, не ниже', unit: '%' },
  { key: 'defectMax', label: 'Брак, не выше', unit: '%' },
  { key: 'downtimeMax', label: 'Простой критичного оборудования, не более', unit: 'мин / сут' },
]

const DISPLAY_FIELDS: { key: keyof DisplayPrefs; label: string }[] = [
  { key: 'autoFlyToAlarm', label: 'Автоперелёт камеры к аварии' },
  { key: 'sound', label: 'Звук уведомлений' },
  { key: 'equipmentLabels', label: 'Показывать подписи оборудования' },
]

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen)
  const setOpen = useUi((s) => s.setSettingsOpen)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 p-0 data-[side=right]:w-[440px] data-[side=right]:sm:max-w-[440px]">
        {/* Форма монтируется заново при каждом открытии — черновик начинается с сохранённых значений. */}
        {open && <SettingsForm onDone={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  )
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const saved = useSettings()
  const [thresholds, setThresholds] = useState(() =>
    Object.fromEntries(
      THRESHOLD_FIELDS.map(({ key }) => [key, String(saved.thresholds[key]).replace('.', ',')]),
    ) as Record<keyof Thresholds, string>,
  )
  const [display, setDisplay] = useState(saved.display)
  const [dataSource, setDataSource] = useState(saved.dataSource)

  const parsed = Object.fromEntries(
    THRESHOLD_FIELDS.map(({ key }) => [key, parseDecimal(thresholds[key])]),
  ) as Record<keyof Thresholds, number>
  const invalid = Object.values(parsed).some((v) => Number.isNaN(v) || v < 0)

  const save = () => {
    if (invalid) return
    const next: SettingsValues = { thresholds: parsed, display, dataSource }
    saved.save(next)
    onDone()
  }

  return (
    <>
      <div className="flex items-start justify-between border-b px-6 pt-5 pb-4">
        <div className="flex flex-col gap-1">
          <SheetTitle className="text-xl font-medium">Настройки</SheetTitle>
          <SheetDescription className="text-[13px]">Применяются для всех пользователей завода</SheetDescription>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" title="Закрыть" className="text-muted-foreground">
            <XIcon />
          </Button>
        </SheetClose>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-auto px-6 py-5">
        <section className="flex flex-col gap-3.5">
          <span className="overline">Пороги KPI</span>
          {THRESHOLD_FIELDS.map(({ key, label, unit }) => {
            const bad = Number.isNaN(parsed[key]) || parsed[key] < 0
            return (
              <label key={key} className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-4">
                <span className="text-sm leading-snug">{label}</span>
                <span
                  className={cn(
                    'flex h-[38px] items-center overflow-hidden rounded-md border bg-card focus-within:border-ring',
                    bad && 'border-alarm focus-within:border-alarm',
                  )}
                >
                  <input
                    inputMode="decimal"
                    value={thresholds[key]}
                    aria-invalid={bad}
                    onChange={(e) =>
                      setThresholds((t) => ({ ...t, [key]: e.target.value.replace(/[^\d,.]/g, '') }))
                    }
                    className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-right font-mono text-sm outline-none"
                  />
                  <span className="flex h-full items-center border-l bg-muted px-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {unit}
                  </span>
                </span>
              </label>
            )
          })}
        </section>

        <Separator />

        <section className="flex flex-col gap-3.5">
          <span className="overline">Отображение</span>
          {DISPLAY_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <Switch
                checked={display[key]}
                onCheckedChange={(v) => setDisplay((d) => ({ ...d, [key]: v }))}
              />
            </label>
          ))}
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <span className="overline">Источник данных</span>
          <RadioGroup value={dataSource} onValueChange={(v) => setDataSource(v as SettingsValues['dataSource'])}>
            <DataSourceOption
              value="demo"
              title="Демо-симуляция"
              hint="Тестовые данные кейса, 01–02.10; дальше смоделировано"
              selected={dataSource === 'demo'}
            />
            <DataSourceOption
              value="mes"
              title="Подключение к MES"
              hint="Потоковые данные с линии в реальном времени"
              selected={dataSource === 'mes'}
              disabled
            />
          </RadioGroup>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t px-6 py-3.5">
        <SheetClose asChild>
          <Button variant="secondary">Отмена</Button>
        </SheetClose>
        <Button onClick={save} disabled={invalid}>
          Сохранить
        </Button>
      </div>
    </>
  )
}

function DataSourceOption({
  value,
  title,
  hint,
  selected,
  disabled,
}: {
  value: string
  title: string
  hint: string
  selected: boolean
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-[10px] border px-3.5 py-3',
        selected && 'border-[1.5px] border-brand bg-brand-soft',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <RadioGroupItem value={value} disabled={disabled} className="mt-px" />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className={cn('text-sm font-medium', selected && 'text-primary')}>{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      {disabled && (
        <span className="flex h-[22px] items-center rounded-sm border bg-muted px-2 text-[11px] font-medium text-muted-foreground">
          Скоро
        </span>
      )}
    </label>
  )
}
