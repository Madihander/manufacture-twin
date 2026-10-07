import { create } from 'zustand'
import type { MaintenanceCrew, MaintenancePriority, MaintenanceWorkType } from '@/data/plant'

export interface MaintenanceTicket {
  id: string
  equipmentId: string
  workType: MaintenanceWorkType
  priority: MaintenancePriority
  date: Date
  timeFrom: string
  timeTo: string
  crew: MaintenanceCrew
  comment: string
  createdAt: Date
}

export interface MaintenanceDraft {
  equipmentId: string
  /** Текст рекомендации ИИ, которым предзаполняется комментарий. */
  aiComment?: string
}

interface MaintenanceState {
  tickets: MaintenanceTicket[]
  nextSeq: number
  /** Открытая форма заявки; null — диалог закрыт. */
  draft: MaintenanceDraft | null
  openDraft: (draft: MaintenanceDraft) => void
  closeDraft: () => void
  createTicket: (ticket: Omit<MaintenanceTicket, 'id' | 'createdAt'>) => MaintenanceTicket
}

export const useMaintenance = create<MaintenanceState>()((set, get) => ({
  tickets: [],
  // Номера заявок в демо продолжают «журнал» завода.
  nextSeq: 147,
  draft: null,
  openDraft: (draft) => set({ draft }),
  closeDraft: () => set({ draft: null }),
  createTicket: (data) => {
    const seq = get().nextSeq
    const ticket: MaintenanceTicket = {
      ...data,
      id: `ТО-${String(seq).padStart(4, '0')}`,
      createdAt: new Date(),
    }
    set((s) => ({ tickets: [ticket, ...s.tickets], nextSeq: seq + 1, draft: null }))
    return ticket
  },
}))
