import { create } from 'zustand'

interface UiState {
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  /** Прочитанные уведомления колокольчика. */
  readNotifications: Set<string>
  markRead: (ids: string[]) => void
  /** Отклонённые карточки ИИ. */
  dismissedPredictions: Set<string>
  dismissPrediction: (id: string) => void
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  readNotifications: new Set(),
  markRead: (ids) => set((s) => ({ readNotifications: new Set([...s.readNotifications, ...ids]) })),
  dismissedPredictions: new Set(),
  dismissPrediction: (id) => set((s) => ({ dismissedPredictions: new Set([...s.dismissedPredictions, id]) })),
}))
