import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface Thresholds {
  /** OEE, не ниже, % */
  oeeMin: number
  /** Брак, не выше, % */
  defectMax: number
  /** Простой критичного оборудования, не более, мин/сут */
  downtimeMax: number
}

export interface DisplayPrefs {
  autoFlyToAlarm: boolean
  sound: boolean
  equipmentLabels: boolean
}

export type DataSource = 'demo' | 'mes'

export interface SettingsValues {
  thresholds: Thresholds
  display: DisplayPrefs
  dataSource: DataSource
}

interface SettingsState extends SettingsValues {
  save: (next: SettingsValues) => void
}

// Пороги — из «Дополнительных вводных» кейса.
export const DEFAULT_SETTINGS: SettingsValues = {
  thresholds: { oeeMin: 85, defectMax: 2, downtimeMax: 60 },
  display: { autoFlyToAlarm: true, sound: false, equipmentLabels: true },
  dataSource: 'demo',
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      save: (next) => set(next),
    }),
    {
      name: 'twin-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ thresholds, display, dataSource }) => ({ thresholds, display, dataSource }),
    },
  ),
)
