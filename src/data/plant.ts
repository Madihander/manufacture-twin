// Справочник завода для демо. Данные кейса — в seed (будет добавлен вместе с симуляцией).

/** «Сейчас» в демо-сценарии: 15.10.2026, смена 2, 21:42. */
export const DEMO_NOW = new Date(2026, 9, 15, 21, 42)

export type SectionId = 'wh-in' | 'welding' | 'painting' | 'assembly' | 'qc' | 'wh-out'

export const SECTIONS: Record<SectionId, { code: string; name: string }> = {
  'wh-in': { code: 'WH-IN', name: 'Склад комплектующих' },
  welding: { code: 'WLD-1', name: 'Сварка-1' },
  painting: { code: 'PNT-1', name: 'Окраска-1' },
  assembly: { code: 'ASM-1', name: 'Сборка-1' },
  qc: { code: 'QC-1', name: 'Контроль качества' },
  'wh-out': { code: 'WH-OUT', name: 'Склад готовой продукции' },
}

export interface Equipment {
  id: string
  name: string
  section: SectionId
}

export const EQUIPMENT: Equipment[] = [
  { id: 'ABB-01', name: 'Робот точечной сварки', section: 'welding' },
  { id: 'ABB-02', name: 'Робот точечной сварки', section: 'welding' },
  { id: 'ABB-03', name: 'Робот точечной сварки', section: 'welding' },
  { id: 'ABB-04', name: 'Робот точечной сварки', section: 'welding' },
  { id: 'Камера-02', name: 'Окрасочная камера', section: 'painting' },
  { id: 'ПС-01', name: 'Печь сушки', section: 'painting' },
  { id: 'Конвейер-03', name: 'Сборочный конвейер', section: 'assembly' },
  { id: 'СЗ-01', name: 'Стенд затяжки', section: 'assembly' },
  { id: 'СГ-01', name: 'Стенд геометрии', section: 'qc' },
  { id: 'КЛ-01', name: 'Стенд контроля ЛКП', section: 'qc' },
]

export const MAINTENANCE_WORK_TYPES = ['Осмотр', 'Замена узла', 'Калибровка датчика'] as const
export const MAINTENANCE_CREWS = ['Бригада ТО-1', 'Бригада ТО-2', 'Сервис ABB'] as const
export const MAINTENANCE_PRIORITIES = ['Низкий', 'Средний', 'Высокий'] as const

export type MaintenanceWorkType = (typeof MAINTENANCE_WORK_TYPES)[number]
export type MaintenanceCrew = (typeof MAINTENANCE_CREWS)[number]
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number]
