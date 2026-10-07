// Дискретная симуляция смены. Прогоняется один раз при старте (≈30 мс), дальше UI только читает снимки.
// Так перемотка по таймлайну мгновенная, а «Что если» — это просто новый прогон с другими параметрами.
import { CAR_MODELS, type CarModelId, type SectionId } from '@/data/plant'
import {
  BODY_COLORS,
  type DowntimeEvent,
  INCIDENT_CLOSE_DELAY,
  MODEL_MIX,
  SHIFT_DOWNTIMES,
  SHIFT_LEN,
  SNAPSHOT_STEP,
  STATIONS,
  type Severity,
  TAKT,
} from './model'
import { rand01, smoothNoise } from './rng'

export interface RunParams {
  seed: number
  downtimes: DowntimeEvent[]
  /** Множитель брака окраски (сценарии «что если»). */
  paintDefectFactor: number
}

export const DEFAULT_PARAMS: RunParams = {
  seed: 20261015,
  downtimes: SHIFT_DOWNTIMES,
  paintDefectFactor: 1,
}

export interface CarInfo {
  id: number
  code: string
  model: CarModelId
  color: string
  /** Вход/выход по участкам, с от начала смены (NaN — ещё не было). Индексы: 0 — склад, 1..4 — станции, 5 — склад ГП. */
  enter: number[]
  exit: number[]
  defectAt: SectionId | null
}

/**
 * Положение кузова. loc: −1 — склад комплектующих (запущен, ждёт сварку),
 * 2i — буфер перед станцией i, 2i+1 — в работе на станции i, 8 — склад ГП.
 * p — прогресс 0..1 в работе либо номер места в очереди.
 */
export const LOC_WH_OUT = 8

export interface StationCounters {
  produced: number
  defects: number
  /** Простой из-за остановок оборудования, с. */
  downSec: number
  plannedDownSec: number
  /** Есть кузова и линия движется. */
  busySec: number
  /** Готовый кузов не может уйти — следующий участок заполнен. */
  blockedSec: number
  /** Участок работоспособен, но кузовов нет. */
  starvedSec: number
  queue: number
  wip: number
}

export interface Snapshot {
  t: number
  carIds: Int32Array
  carLoc: Int8Array
  carP: Float32Array
  stations: StationCounters[]
  kits: number
  whOut: number
}

export interface Incident {
  id: string
  /** Оборудование или участок, к которому относится инцидент. */
  objectId: string
  section: SectionId
  title: string
  start: number
  /** Длительность простоя, с; null — не простой (например, брак). */
  downtime: number | null
  severity: Severity
  closedAt: number | null
}

export interface ShiftRun {
  params: RunParams
  snapshots: Snapshot[]
  cars: Map<number, CarInfo>
  incidents: Incident[]
}

interface LiveCar {
  info: CarInfo
  loc: number
  p: number
}

const STATION_SECTION: SectionId[] = ['welding', 'painting', 'assembly', 'qc']

/** Брак на выходе участка зависит от времени: на окраске он растёт вместе с засором фильтра. */
function defectRate(station: number, t: number, params: RunParams): number {
  switch (station) {
    case 0:
      return 0.022
    case 1: {
      // 16:00–18:00 ≈ 2,5 %, затем рост до ≈ 8 % к 21:30 — вместе с засором фильтра Камеры-02.
      const ramp = Math.min(1, Math.max(0, (t - 2 * 3600) / (3.5 * 3600)))
      return (0.025 + 0.055 * ramp) * params.paintDefectFactor
    }
    case 2:
      return 0.012
    default:
      return 0.026
  }
}

function pickModel(id: number): CarModelId {
  const r = rand01('model', id)
  let acc = 0
  for (const [m, share] of MODEL_MIX) {
    acc += share
    if (r < acc) return m
  }
  return 'onix'
}

export function runShift(params: RunParams = DEFAULT_PARAMS): ShiftRun {
  const cars = new Map<number, CarInfo>()
  const incidents: Incident[] = []
  let seq = 860

  const newCar = (): CarInfo => {
    const id = ++seq
    const model = pickModel(id)
    const info: CarInfo = {
      id,
      code: `${CAR_MODELS[model].prefix}-2610-${String(id).padStart(4, '0')}`,
      model,
      color: BODY_COLORS[Math.floor(rand01('color', id) * BODY_COLORS.length)],
      enter: Array(6).fill(Number.NaN),
      exit: Array(6).fill(Number.NaN),
      defectAt: null,
    }
    cars.set(id, info)
    return info
  }

  // Смена принимает линию заполненной: на каждой станции ~ половина мест и по кузову в буферах.
  const live: LiveCar[] = []
  STATIONS.forEach((st, i) => {
    const n = Math.max(1, Math.round(st.slots * 0.85))
    for (let k = 0; k < n; k++) {
      const info = newCar()
      const p = 1 - (k + 0.5) / st.slots
      info.enter[i + 1] = -p * st.slots * st.cycle
      live.push({ info, loc: 2 * i + 1, p })
    }
    // Буферы между участками к началу смены заполнены наполовину.
    const inBuffer = i > 0 ? Math.floor(st.bufferCap / 2) : 0
    for (let q = 0; q < inBuffer; q++) live.push({ info: newCar(), loc: 2 * i, p: q })
  })

  const counters: StationCounters[] = STATIONS.map(() => ({
    produced: 0,
    defects: 0,
    downSec: 0,
    plannedDownSec: 0,
    busySec: 0,
    blockedSec: 0,
    starvedSec: 0,
    queue: 0,
    wip: 0,
  }))

  let kits = 88
  let whOut = 0
  let launchDue = 0
  const parked: LiveCar[] = []
  const snapshots: Snapshot[] = []

  // Брак на окраске — скользящее окно последних выпусков, чтобы поймать превышение порога.
  const paintWindow: boolean[] = []
  let paintIncidentOpen = false

  const downAt = (station: number, t: number): DowntimeEvent | undefined =>
    params.downtimes.find((d) => d.section === STATION_SECTION[station] && t >= d.start && t < d.start + d.duration)

  const snapshot = (t: number) => {
    const all = [...live, ...parked]
    const carIds = new Int32Array(all.length)
    const carLoc = new Int8Array(all.length)
    const carP = new Float32Array(all.length)
    all.forEach((c, i) => {
      carIds[i] = c.info.id
      carLoc[i] = c.loc
      carP[i] = c.p
    })
    STATIONS.forEach((_, i) => {
      counters[i].queue = live.filter((c) => c.loc === 2 * i).length
      counters[i].wip = live.filter((c) => c.loc === 2 * i + 1).length
    })
    snapshots.push({
      t,
      carIds,
      carLoc,
      carP,
      stations: counters.map((c) => ({ ...c })),
      kits,
      whOut,
    })
  }

  const dt = 1
  for (let t = 0; t <= SHIFT_LEN; t += dt) {
    if (t % SNAPSHOT_STEP === 0) snapshot(t)
    if (t === SHIFT_LEN) break

    // Подвоз комплектов каждые 2 часа.
    if (t > 0 && t % 7200 === 0) kits += 60
    // Запуск кузова в такт.
    if (t % TAKT === 0) launchDue++
    const weldBuffer = live.filter((c) => c.loc === 0).length
    if (launchDue > 0 && kits > 0 && weldBuffer < STATIONS[0].bufferCap) {
      const info = newCar()
      info.enter[0] = t - 120
      info.exit[0] = t
      live.push({ info, loc: 0, p: weldBuffer })
      kits--
      launchDue--
    }

    // Станции обрабатываем от конца линии к началу, чтобы освобождённое место сразу занималось.
    for (let i = STATIONS.length - 1; i >= 0; i--) {
      const st = STATIONS[i]
      const c = counters[i]
      const down = downAt(i, t)
      if (down) {
        if (down.planned) c.plannedDownSec += dt
        else c.downSec += dt
      }

      const inProc = live.filter((x) => x.loc === 2 * i + 1).sort((a, b) => b.p - a.p)
      const nextBufferCount = i < STATIONS.length - 1 ? live.filter((x) => x.loc === 2 * (i + 1)).length : 0
      const nextCap = i < STATIONS.length - 1 ? STATIONS[i + 1].bufferCap : Infinity

      if (!down) {
        // Темп слегка «дышит»: ±3 % по минутам.
        const perf = 0.985 + 0.03 * smoothNoise(`perf-${i}-${params.seed}`, t, 600) * 0.5
        const rate = (perf * dt) / (st.slots * st.cycle)
        let blocked = false
        let moved = false
        // Позиция предыдущего кузова на участке; если он ушёл — путь свободен до конца.
        let aheadP = 1 + 1 / st.slots
        for (let k = 0; k < inProc.length; k++) {
          const car = inProc[k]
          const limit = Math.min(1, aheadP - 1 / st.slots)
          const before = car.p
          car.p = Math.min(limit, car.p + rate)
          if (car.p > before) moved = true
          aheadP = car.p
          if (k === 0 && car.p >= 1) {
            if (nextBufferCount < nextCap) {
              // Выход со станции.
              c.produced++
              car.info.exit[i + 1] = t
              const defective = rand01('defect', car.info.id, i, params.seed) < defectRate(i, t, params)
              if (defective) {
                c.defects++
                car.info.defectAt ??= STATION_SECTION[i]
              }
              if (i === 1) {
                paintWindow.push(defective)
                if (paintWindow.length > 30) paintWindow.shift()
                const share = paintWindow.filter(Boolean).length / paintWindow.length
                if (!paintIncidentOpen && paintWindow.length >= 20 && share > 0.04) {
                  paintIncidentOpen = true
                  incidents.push({
                    id: `q-paint-${t}`,
                    objectId: 'Окраска-1',
                    section: 'painting',
                    title: 'Брак ЛКП выше порога',
                    start: t,
                    downtime: null,
                    severity: 'alarm',
                    closedAt: null,
                  })
                }
              }
              aheadP = 1 + 1 / st.slots
              if (i < STATIONS.length - 1) {
                car.loc = 2 * (i + 1)
                car.p = nextBufferCount
              } else {
                // Склад готовой продукции.
                whOut++
                car.loc = LOC_WH_OUT
                car.info.enter[5] = t
                live.splice(live.indexOf(car), 1)
                parked.push(car)
                if (parked.length > 12) parked.shift()
                parked.forEach((pc, idx) => (pc.p = parked.length - 1 - idx))
              }
            } else {
              blocked = true
            }
          }
        }

        // Вход в станцию из буфера, когда первое место освободилось.
        const buffer = live.filter((x) => x.loc === 2 * i).sort((a, b) => a.p - b.p)
        const lastIn = inProc.length ? Math.min(...inProc.filter((x) => x.loc === 2 * i + 1).map((x) => x.p)) : 1
        if (buffer.length && (inProc.length === 0 || lastIn >= 1 / st.slots)) {
          const car = buffer.shift()!
          car.loc = 2 * i + 1
          car.p = 0
          car.info.enter[i + 1] = t
          buffer.forEach((b, idx) => (b.p = idx))
          moved = true
        }

        if (blocked) c.blockedSec += dt
        else if (moved) c.busySec += dt
        else if (inProc.length === 0) c.starvedSec += dt
      }
    }
  }

  // Инциденты по остановкам: открыты, пока мастер не закроет (через 45 мин после устранения).
  for (const d of params.downtimes) {
    incidents.push({
      id: d.id,
      objectId: d.equipmentId,
      section: d.section,
      title: d.reason,
      start: d.start,
      downtime: d.duration,
      severity: d.severity,
      closedAt: d.start + d.duration + INCIDENT_CLOSE_DELAY,
    })
  }
  incidents.sort((a, b) => a.start - b.start)

  return { params, snapshots, cars, incidents }
}

/** Снимок на момент t (ближайший не позже). */
export function snapshotAt(run: ShiftRun, t: number): Snapshot {
  const i = Math.max(0, Math.min(run.snapshots.length - 1, Math.floor(t / SNAPSHOT_STEP)))
  return run.snapshots[i]
}
