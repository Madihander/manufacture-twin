import { create } from 'zustand'

/** Фрагмент ответа: текст или чип-ссылка на объект карты. */
export type AnswerPart = string | { chip: string; equipmentId?: string; section?: import('@/data/plant').SectionId }

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  parts?: AnswerPart[]
  /** Вопрос ждёт ответа — его подхватит панель ИИ, у которой есть данные модели. */
  pending?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  ask: (question: string) => void
  answer: (questionId: number, parts: AnswerPart[]) => void
  clear: () => void
}

let seq = 0

export const useAiChat = create<ChatState>()((set) => ({
  messages: [],
  ask: (question) => {
    const q = question.trim()
    if (!q) return
    set((s) => ({ messages: [...s.messages, { id: ++seq, role: 'user', text: q, pending: true }] }))
  },
  answer: (questionId, parts) =>
    set((s) => ({
      messages: [
        ...s.messages.map((m) => (m.id === questionId ? { ...m, pending: false } : m)),
        { id: ++seq, role: 'assistant', text: parts.map((p) => (typeof p === 'string' ? p : p.chip)).join(''), parts },
      ],
    })),
  clear: () => set({ messages: [] }),
}))
