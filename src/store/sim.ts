import { create } from 'zustand'
import type { ModelFilter, SectionId } from '@/data/plant'
import { DEFAULT_PARAMS, runShift, type ShiftRun } from '@/sim/engine'
import { DEMO_START_T, SHIFT_LEN } from '@/sim/model'
import { setActiveDowntimes } from '@/sim/telemetry'

export const SPEEDS = [1, 4, 8, 16, 32] as const
export type Speed = (typeof SPEEDS)[number]

export type Selection =
  | { kind: 'section'; id: SectionId }
  | { kind: 'equipment'; id: string }
  | { kind: 'car'; id: number }

export type PanelTab = 'overview' | 'section' | 'ai'
export type Screen = 'topology' | 'summary' | 'scenarios'
export type HeatMode = 'off' | 'oee' | 'defect' | 'risk'

export interface Layers {
  flow: boolean
  labels: boolean
  equipment: boolean
  cars: boolean
}

export type CameraCommand =
  | { type: 'fit'; nonce: number }
  | { type: 'zoom'; factor: number; nonce: number }
  | { type: 'focus'; nonce: number }

interface SimState {
  run: ShiftRun
  /** Если на карте показан сценарий «что если» — его название; null — реальная смена. */
  scenario: string | null
  /** Время внутри смены, с от 16:00. */
  t: number
  playing: boolean
  speed: Speed
  screen: Screen
  tab: PanelTab
  selection: Selection | null
  hoverSection: SectionId | null
  layers: Layers
  heat: HeatMode
  modelFilter: ModelFilter
  camera: CameraCommand | null

  setT: (t: number) => void
  advance: (dtReal: number) => void
  togglePlay: () => void
  setSpeed: (s: Speed) => void
  reset: () => void
  setScreen: (s: Screen) => void
  setTab: (tab: PanelTab) => void
  select: (sel: Selection | null) => void
  setHoverSection: (id: SectionId | null) => void
  setLayer: (key: keyof Layers, on: boolean) => void
  setHeat: (h: HeatMode) => void
  setModelFilter: (m: ModelFilter) => void
  cameraCmd: (cmd: CameraCommandInput) => void
  /** Показать на карте прогон сценария с момента t. */
  applyScenario: (run: ShiftRun, name: string, t: number) => void
  /** Вернуть реальную смену. */
  resetScenario: () => void
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type CameraCommandInput = DistributiveOmit<CameraCommand, 'nonce'>

let nonce = 0

/** Реальная (базовая) смена — считается один раз. */
export const BASE_RUN = runShift(DEFAULT_PARAMS)

export const useSim = create<SimState>()((set, get) => ({
  run: BASE_RUN,
  scenario: null,
  t: DEMO_START_T,
  playing: true,
  speed: 8,
  screen: 'topology',
  tab: 'overview',
  selection: null,
  hoverSection: null,
  layers: { flow: true, labels: true, equipment: true, cars: true },
  heat: 'off',
  modelFilter: 'all',
  camera: null,

  setT: (t) => set({ t: Math.max(0, Math.min(SHIFT_LEN, t)) }),
  advance: (dtReal) => {
    const { playing, speed, t } = get()
    if (!playing) return
    const next = t + dtReal * speed
    if (next >= SHIFT_LEN) set({ t: SHIFT_LEN, playing: false })
    else set({ t: next })
  },
  togglePlay: () =>
    set((s) => (s.t >= SHIFT_LEN ? { t: 0, playing: true } : { playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  reset: () => set({ t: DEMO_START_T, playing: false }),
  setScreen: (screen) => set({ screen }),
  setTab: (tab) => set({ tab }),
  select: (selection) => {
    set({ selection, tab: selection ? 'section' : get().tab })
    if (selection) get().cameraCmd({ type: 'focus' })
  },
  setHoverSection: (hoverSection) => set({ hoverSection }),
  setLayer: (key, on) => set((s) => ({ layers: { ...s.layers, [key]: on } })),
  setHeat: (heat) => set({ heat }),
  setModelFilter: (modelFilter) => set({ modelFilter }),
  cameraCmd: (cmd) => set({ camera: { ...cmd, nonce: ++nonce } as CameraCommand }),
  applyScenario: (run, name, t) => {
    setActiveDowntimes(run.params.downtimes)
    set({ run, scenario: name, t: Math.max(0, Math.min(SHIFT_LEN, t)), playing: true, screen: 'topology', tab: 'overview', selection: null, hoverSection: null })
  },
  resetScenario: () => {
    setActiveDowntimes(BASE_RUN.params.downtimes)
    set({ run: BASE_RUN, scenario: null, t: DEMO_START_T, playing: true, selection: null })
  },
}))
