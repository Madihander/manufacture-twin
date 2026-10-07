import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_INPUT, type ScenarioInput } from '@/sim/scenario'

export interface SavedScenario {
  id: string
  name: string
  date: string
  input: ScenarioInput
}

/** Готовые сценарии для демо: «что было бы, если бы ИИ предупредил», «хуже», «3 смены». */
const PRESETS: SavedScenario[] = [
  { id: 'p1', name: 'ИИ предупредил: обрыва цепи нет', date: '15.10.2026', input: { ...DEFAULT_INPUT, duration: 0 } },
  { id: 'p2', name: 'Обрыв цепи 2 ч', date: '15.10.2026', input: { ...DEFAULT_INPUT, duration: 120 } },
  { id: 'p3', name: '3 смены до конца месяца', date: '14.10.2026', input: { ...DEFAULT_INPUT, shifts: 3 } },
  { id: 'p4', name: 'Брак окраски 2 %', date: '13.10.2026', input: { ...DEFAULT_INPUT, paintDefect: 2 } },
]

interface ScenariosState {
  saved: SavedScenario[]
  save: (name: string, input: ScenarioInput) => void
  remove: (id: string) => void
}

export const useScenarios = create<ScenariosState>()(
  persist(
    (set) => ({
      saved: PRESETS,
      save: (name, input) =>
        set((s) => ({
          saved: [{ id: crypto.randomUUID(), name, date: new Date(2026, 9, 15).toLocaleDateString('ru-RU'), input }, ...s.saved].slice(0, 8),
        })),
      remove: (id) => set((s) => ({ saved: s.saved.filter((x) => x.id !== id) })),
    }),
    { name: 'twin-scenarios', storage: createJSONStorage(() => localStorage) },
  ),
)
