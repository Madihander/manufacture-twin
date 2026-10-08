import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { HISTORY } from '@/data/history'
import { EQUIPMENT_BY_ID, type MaintenanceCrew, type MaintenancePriority, type MaintenanceWorkType } from '@/data/plant'
import { clockText } from '@/sim/clock'
import { type DowntimeEvent, SHIFT_DOWNTIMES } from '@/sim/model'
import { TODAY_ISO } from '@/sim/summary'

export const TICKET_STATUSES = ['Новая', 'В работе', 'Выполнена', 'Отменена'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

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
  status: TicketStatus
  /** Комментарий взят из рекомендации ИИ. */
  fromAi: boolean
  /** Заявка из журнала завода до демо (смоделирована), а не созданная в приложении. */
  history?: boolean
  /** Создана в приложении: момент модельного времени, с от 16:00. */
  createdT?: number
  /** Для заявок из журнала простоев: смена, длительность простоя, данные кейса. */
  shift?: 1 | 2
  minutes?: number
  real?: boolean
}

export interface MaintenanceDraft {
  equipmentId: string
  /** Текст рекомендации ИИ, которым предзаполняется комментарий. */
  aiComment?: string
}

export type NewTicket = Omit<MaintenanceTicket, 'id' | 'createdAt' | 'status' | 'history'>

interface MaintenanceState {
  /** Заявки, созданные в приложении (хранятся в браузере). */
  tickets: MaintenanceTicket[]
  nextSeq: number
  /** Открытая форма заявки; null — диалог закрыт. */
  draft: MaintenanceDraft | null
  openDraft: (draft: MaintenanceDraft) => void
  closeDraft: () => void
  createTicket: (ticket: NewTicket) => MaintenanceTicket
  setStatus: (id: string, status: TicketStatus) => void
  /** Удалить созданные в демо заявки — журнал возвращается к истории завода. */
  clearCreated: () => void
}

// Номера заявок в демо продолжают журнал завода: история — по простоям октября, до ТО-0146.
const FIRST_SEQ = 147

export const useMaintenance = create<MaintenanceState>()(
  persist(
    (set, get) => ({
      tickets: [],
      nextSeq: FIRST_SEQ,
      draft: null,
      openDraft: (draft) => set({ draft }),
      closeDraft: () => set({ draft: null }),
      createTicket: (data) => {
        const seq = get().nextSeq
        const ticket: MaintenanceTicket = { ...data, id: ticketId(seq), createdAt: new Date(), status: 'Новая' }
        set((s) => ({ tickets: [ticket, ...s.tickets], nextSeq: seq + 1, draft: null }))
        return ticket
      },
      setStatus: (id, status) => set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, status } : t)) })),
      clearCreated: () => set({ tickets: [], nextSeq: FIRST_SEQ }),
    }),
    {
      name: 'twin-maintenance',
      storage: createJSONStorage(() => localStorage, {
        // Даты в localStorage — строки; возвращаем им тип Date.
        reviver: (key, value) => ((key === 'date' || key === 'createdAt') && typeof value === 'string' ? new Date(value) : value),
      }),
      partialize: ({ tickets, nextSeq }) => ({ tickets, nextSeq }),
    },
  ),
)

const ticketId = (seq: number) => `ТО-${String(seq).padStart(4, '0')}`

/** Тип работ по причине простоя. */
const WORK_BY_REASON: Record<string, MaintenanceWorkType> = {
  'Плановое ТО': 'Осмотр',
  'Ошибка датчика': 'Калибровка датчика',
  'Ошибка позиционирования': 'Калибровка датчика',
  'Отклонение температуры': 'Калибровка датчика',
  'Отклонение момента затяжки': 'Калибровка датчика',
  'Износ электродов': 'Замена узла',
  'Замена фильтра': 'Замена узла',
  'Обрыв цепи': 'Замена узла',
}

function historyTicket(seq: number, rec: { date: string; shift: 1 | 2; equipmentId: string; reason: string; minutes: number; planned: boolean; real: boolean }): MaintenanceTicket {
  const date = new Date(Number(rec.date.slice(0, 4)), Number(rec.date.slice(5, 7)) - 1, Number(rec.date.slice(8, 10)))
  const critical = EQUIPMENT_BY_ID[rec.equipmentId]?.critical
  return {
    id: ticketId(seq),
    equipmentId: rec.equipmentId,
    workType: WORK_BY_REASON[rec.reason] ?? 'Осмотр',
    priority: rec.planned ? 'Средний' : critical ? 'Высокий' : 'Средний',
    date,
    // Время внутри смены журнал простоев не хранит — показываем смену.
    timeFrom: '',
    timeTo: '',
    shift: rec.shift,
    minutes: rec.minutes,
    crew: rec.planned && rec.equipmentId.startsWith('ABB') ? 'Сервис ABB' : rec.shift === 1 ? 'Бригада ТО-1' : 'Бригада ТО-2',
    comment: rec.planned ? 'Плановое ТО по графику' : `${rec.reason} — устранение`,
    createdAt: date,
    status: 'Выполнена',
    fromAi: false,
    history: true,
    real: rec.real,
  }
}

/**
 * Журнал до текущей смены: по заявке на каждый простой из журнала простоев (01–02.10 — данные кейса,
 * дальше — смоделированы). Номера идут по порядку и заканчиваются перед остановками текущей смены.
 */
const PAST: MaintenanceTicket[] = HISTORY.downtimes.map((d, i) => historyTicket(FIRST_SEQ - SHIFT_DOWNTIMES.length - HISTORY.downtimes.length + i, d))
/** Номер заявки для каждой остановки текущей смены. */
const SHIFT_SEQ = new Map(SHIFT_DOWNTIMES.map((d, i) => [d.id, FIRST_SEQ - SHIFT_DOWNTIMES.length + i]))

/**
 * Журнал на момент t: история + заявки по остановкам показанного прогона. Заявка появляется в начале
 * остановки, «в работе» до её окончания. Остановки, добавленные сценарием «что если», в журнал не попадают.
 */
export function historyTickets(t: number, downtimes: DowntimeEvent[]): MaintenanceTicket[] {
  const live = downtimes
    .filter((d) => SHIFT_SEQ.has(d.id) && t >= d.start)
    .map((d) => {
      const base = historyTicket(SHIFT_SEQ.get(d.id)!, { date: TODAY_ISO, shift: 2, equipmentId: d.equipmentId, reason: d.reason, minutes: Math.round(d.duration / 60), planned: d.planned, real: false })
      return { ...base, timeFrom: clockText(d.start, false), timeTo: clockText(d.start + d.duration, false), status: (t < d.start + d.duration ? 'В работе' : 'Выполнена') as TicketStatus }
    })
  return [...PAST, ...live]
}

/** Откуда заявка журнала: данные кейса, модель истории или остановка текущей смены в симуляции. */
export const ticketSource = (t: MaintenanceTicket) => (t.real ? 'кейс' : t.history && t.timeFrom ? 'симуляция' : 'история')

export const isOpen = (t: MaintenanceTicket) => t.status === 'Новая' || t.status === 'В работе'

/** Окно работ: время, а для истории без времени — смена. */
export const ticketWindow = (t: MaintenanceTicket) => (t.timeFrom ? `${t.timeFrom}–${t.timeTo}` : `смена ${t.shift}`)
