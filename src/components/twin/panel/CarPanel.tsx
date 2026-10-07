import { CheckIcon, CrosshairIcon, EyeOffIcon, MapPinIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CAR_MODELS, SECTIONS } from '@/data/plant'
import { cn } from '@/lib/utils'
import { clockText } from '@/sim/clock'
import { LOC_WH_OUT } from '@/sim/engine'
import { displayCar, STATIONS, TAKT } from '@/sim/model'
import { useTwin } from '@/sim/useTwin'
import { useSim } from '@/store/sim'
import { BigNumber } from '../primitives'
import { PanelBody } from './common'

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/** Индекс участка (0..5) по положению кузова в снимке. */
function sectionIndexOf(loc: number): { index: number; queued: boolean } {
  if (loc === LOC_WH_OUT) return { index: 5, queued: false }
  if (loc < 0) return { index: 0, queued: false }
  return { index: Math.floor(loc / 2) + 1, queued: loc % 2 === 0 }
}

export function CarPanel({ id }: { id: number }) {
  const { run, snap } = useTwin()
  const t = useSim((s) => Math.floor(s.t))
  const select = useSim((s) => s.select)
  const cameraCmd = useSim((s) => s.cameraCmd)
  const modelFilter = useSim((s) => s.modelFilter)
  const car = run.cars.get(id)
  const k = snap.carIds.indexOf(id)
  if (!car || k < 0) {
    return (
      <PanelBody>
        <span className="text-[13px] text-muted-foreground">Кузов вне линии в этот момент времени.</span>
      </PanelBody>
    )
  }
  const shown = displayCar(car, modelFilter)
  const { index: cur, queued } = sectionIndexOf(snap.carLoc[k])
  // Ожидаемые времена: норматив прохождения участка = мест × такт.
  const stationTime = (section: number) => (section >= 1 && section <= 4 ? STATIONS[section - 1].slots * TAKT : 0)
  const enteredCur = car.enter[cur]
  const dwell = Number.isFinite(enteredCur) && !queued ? t - enteredCur : NaN
  const norm = cur >= 1 && cur <= 4 ? stationTime(cur) : NaN
  const expected: number[] = []
  // В очереди ждёт ещё весь норматив участка; в работе — остаток норматива.
  let eta = t + (queued ? stationTime(cur) : Math.max(0, (Number.isFinite(norm) ? norm : 0) - (Number.isFinite(dwell) ? dwell : 0)))
  for (let i = cur + 1; i <= 5; i++) {
    expected[i] = eta
    eta += stationTime(i)
  }
  const late = Number.isFinite(dwell) && Number.isFinite(norm) && dwell > norm

  return (
    <>
      <PanelBody>
        <div className="flex flex-col gap-1.5">
          <span className="overline flex items-center gap-1.5 text-brand-strong">
            <CrosshairIcon className="size-[13px]" />
            Слежение за кузовом
          </span>
          <span className="text-2xl tracking-[-0.01em]">
            Кузов <span className="font-mono text-[21px]">{shown.code}</span>
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] text-muted-foreground">
              {CAR_MODELS[shown.model].name} · {shown.color}
            </span>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 text-xs font-medium text-primary">
              <MapPinIcon className="size-3 text-brand" strokeWidth={2.25} />
              {SECTIONS[cur].name}
              {queued && ' · очередь'}
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          {SECTIONS.map((s, i) => {
            const done = i < cur
            const current = i === cur
            const last = i === SECTIONS.length - 1
            const enter = car.enter[i]
            const exit = car.exit[i]
            return (
              <div key={s.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                <div className="flex flex-col items-center">
                  {done ? (
                    <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-primary">
                      <CheckIcon className="size-3 text-white" strokeWidth={3} />
                    </span>
                  ) : current ? (
                    <span className="relative flex size-[22px] flex-none items-center justify-center rounded-full border-2 border-brand bg-brand-soft">
                      <span className="absolute size-2 animate-ping rounded-full bg-brand opacity-60" />
                      <span className="size-2 rounded-full bg-brand" />
                    </span>
                  ) : (
                    <span className="my-1 size-3.5 flex-none rounded-full border-2 border-switch-off bg-card" />
                  )}
                  {!last && <span className={cn('flex-1', done ? 'w-0.5 bg-primary' : 'w-0 border-l-2 border-dashed border-switch-off')} />}
                </div>
                <div className={cn('flex flex-col gap-[3px]', !last && 'pb-[18px]')}>
                  {current ? (
                    <div className="-mt-1 -ml-1 flex flex-col gap-1 rounded-[10px] bg-brand-soft px-3 py-2.5">
                      <span className="text-sm font-medium text-primary">{s.name}</span>
                      {Number.isFinite(enter) && (
                        <span className="text-xs text-muted-foreground">
                          вход <span className="font-mono text-foreground">{clockText(enter, false)}</span>
                        </span>
                      )}
                      {Number.isFinite(dwell) && Number.isFinite(norm) && (
                        <span className={cn('flex items-center gap-1.5 text-xs font-medium', late ? 'text-warn-fg' : 'text-ok-fg')}>
                          <span className={cn('size-1.5 rounded-full', late ? 'bg-warn' : 'bg-ok')} />
                          на участке <span className="font-mono">{mmss(dwell)}</span> (норматив <span className="font-mono">{mmss(norm)}</span>)
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className={cn('text-sm', done ? 'font-medium' : 'text-muted-foreground')}>{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {done ? (
                          <>
                            {Number.isFinite(enter) && (
                              <>
                                вход <span className="font-mono text-foreground">{clockText(enter, false)}</span>
                              </>
                            )}
                            {Number.isFinite(exit) && (
                              <>
                                {' '}
                                · выход <span className="font-mono text-foreground">{clockText(exit, false)}</span>
                              </>
                            )}
                            {!Number.isFinite(enter) && !Number.isFinite(exit) && 'с прошлой смены'}
                          </>
                        ) : (
                          <>
                            ожид. <span className="font-mono">{clockText(expected[i], false)}</span>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {cur < 5 && (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3.5">
            <span className="text-[13px] text-muted-foreground">Ожидаемый выпуск</span>
            <BigNumber value={clockText(expected[5], false)} />
          </div>
        )}
        {car.defectAt && (
          <span className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn-fg">Отмечен дефект на участке «{SECTIONS.find((s) => s.id === car.defectAt)?.short}» — направлен на доработку</span>
        )}
      </PanelBody>
      <div className="flex-none border-t px-5 py-3.5">
        <Button
          variant="secondary"
          className="w-full text-[13px]"
          onClick={() => {
            select(null)
            cameraCmd({ type: 'fit' })
          }}
        >
          <EyeOffIcon className="size-[15px]" />
          Перестать следить
        </Button>
      </div>
    </>
  )
}
