// Справочник завода: участки, оборудование, модели. Цифры кейса — в seed.ts.

/** «Сейчас» в демо-сценарии: 15.10.2026, смена 2. Время внутри смены задаёт симуляция. */
export const DEMO_DATE = new Date(2026, 9, 15)
export const DEMO_NOW = new Date(2026, 9, 15, 21, 42)

export type SectionId = 'wh-in' | 'welding' | 'painting' | 'assembly' | 'qc' | 'wh-out'

export interface Section {
  id: SectionId
  code: string
  /** Название в списке и панели: «Сварка-1». */
  name: string
  /** Короткая подпись на карте: «Сварка». */
  short: string
}

/** Порядок участков = порядок потока. */
export const SECTIONS: Section[] = [
  { id: 'wh-in', code: 'WH-IN', name: 'Склад комплектующих', short: 'Склад' },
  { id: 'welding', code: 'WLD-1', name: 'Сварка-1', short: 'Сварка' },
  { id: 'painting', code: 'PNT-1', name: 'Окраска-1', short: 'Окраска' },
  { id: 'assembly', code: 'ASM-1', name: 'Сборка-1', short: 'Сборка' },
  { id: 'qc', code: 'QC-1', name: 'Контроль качества', short: 'ОТК' },
  { id: 'wh-out', code: 'WH-OUT', name: 'Склад ГП', short: 'Склад ГП' },
]

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<SectionId, Section>

export interface Equipment {
  id: string
  name: string
  section: SectionId
  /** Остановка этого оборудования останавливает участок. */
  critical: boolean
  lastService: Date
  nextService: Date
}

const d = (day: number, month = 10) => new Date(2026, month - 1, day)

export const EQUIPMENT: Equipment[] = [
  { id: 'ABB-01', name: 'Робот точечной сварки', section: 'welding', critical: true, lastService: d(28, 9), nextService: d(20) },
  { id: 'ABB-02', name: 'Робот точечной сварки', section: 'welding', critical: true, lastService: d(5), nextService: d(26) },
  { id: 'ABB-03', name: 'Робот точечной сварки', section: 'welding', critical: true, lastService: d(1), nextService: d(22) },
  { id: 'ABB-04', name: 'Робот точечной сварки', section: 'welding', critical: true, lastService: d(15), nextService: d(5, 11) },
  { id: 'Камера-02', name: 'Окрасочная камера', section: 'painting', critical: true, lastService: d(15), nextService: d(29) },
  { id: 'ПС-01', name: 'Печь сушки', section: 'painting', critical: true, lastService: d(7), nextService: d(28) },
  { id: 'Конвейер-03', name: 'Сборочный конвейер', section: 'assembly', critical: true, lastService: d(15), nextService: d(30) },
  { id: 'СЗ-01', name: 'Стенд затяжки', section: 'assembly', critical: false, lastService: d(9), nextService: d(23) },
  { id: 'СГ-01', name: 'Стенд геометрии', section: 'qc', critical: false, lastService: d(2), nextService: d(30) },
  { id: 'КЛ-01', name: 'Стенд контроля ЛКП', section: 'qc', critical: false, lastService: d(6), nextService: d(27) },
]

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, Equipment>

export type CarModelId = 'cobalt' | 'onix' | 'j7'

export const CAR_MODELS: Record<CarModelId, { name: string; prefix: string; monthPlan: number }> = {
  cobalt: { name: 'Chevrolet Cobalt', prefix: 'CB', monthPlan: 1800 },
  onix: { name: 'Chevrolet Onix', prefix: 'ON', monthPlan: 2500 },
  j7: { name: 'JAC J7', prefix: 'J7', monthPlan: 500 },
}

export type ModelFilter = CarModelId | 'all'

export const MAINTENANCE_WORK_TYPES = ['Осмотр', 'Замена узла', 'Калибровка датчика'] as const
export const MAINTENANCE_CREWS = ['Бригада ТО-1', 'Бригада ТО-2', 'Сервис ABB'] as const
export const MAINTENANCE_PRIORITIES = ['Низкий', 'Средний', 'Высокий'] as const

export type MaintenanceWorkType = (typeof MAINTENANCE_WORK_TYPES)[number]
export type MaintenanceCrew = (typeof MAINTENANCE_CREWS)[number]
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number]
