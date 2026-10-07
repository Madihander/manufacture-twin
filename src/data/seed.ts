// Тестовые данные кейса «Цифровой двойник завода» — один в один из документа организаторов.
// Допущение: строки «План 120 / факт» — это одна смена (8 ч). Иначе 2 смены × 120 авто
// дают 2 640 авто в месяц при цели 5 500, что противоречит остальным вводным.

export const CASE_LINE_RUNS = [
  { date: '2026-10-01', line: 'Сварка-1', plan: 120, fact: 118, hours: 7.8, load: 98 },
  { date: '2026-10-01', line: 'Окраска-1', plan: 120, fact: 115, hours: 7.5, load: 94 },
  { date: '2026-10-01', line: 'Сборка-1', plan: 120, fact: 121, hours: 8.0, load: 100 },
  { date: '2026-10-02', line: 'Сварка-1', plan: 120, fact: 111, hours: 7.2, load: 91 },
  { date: '2026-10-02', line: 'Окраска-1', plan: 120, fact: 116, hours: 7.7, load: 96 },
  { date: '2026-10-02', line: 'Сборка-1', plan: 120, fact: 119, hours: 7.9, load: 99 },
] as const

export const CASE_DOWNTIMES = [
  { date: '2026-10-01', section: 'Сварка', equipment: 'ABB-01', reason: 'Ошибка датчика', minutes: 25 },
  { date: '2026-10-01', section: 'Окраска', equipment: 'Камера-02', reason: 'Замена фильтра', minutes: 40 },
  { date: '2026-10-02', section: 'Сборка', equipment: 'Конвейер-03', reason: 'Обрыв цепи', minutes: 55 },
  { date: '2026-10-02', section: 'Сварка', equipment: 'ABB-04', reason: 'Плановое ТО', minutes: 30 },
] as const

export const CASE_MONTH_PLAN = [
  { model: 'Chevrolet Onix', plan: 2500 },
  { model: 'Chevrolet Cobalt', plan: 1800 },
  { model: 'JAC J7', plan: 500 },
] as const

export const CASE_QUALITY = [
  { date: '2026-10-01', section: 'Сварка', produced: 118, defects: 2, rate: 1.7 },
  { date: '2026-10-01', section: 'Окраска', produced: 115, defects: 4, rate: 3.5 },
  { date: '2026-10-01', section: 'Сборка', produced: 121, defects: 1, rate: 0.8 },
  { date: '2026-10-02', section: 'Сварка', produced: 111, defects: 3, rate: 2.7 },
  { date: '2026-10-02', section: 'Окраска', produced: 116, defects: 6, rate: 5.2 },
  { date: '2026-10-02', section: 'Сборка', produced: 119, defects: 2, rate: 1.7 },
] as const

export const CASE_FLOW = [
  'Склад комплектующих',
  'Сварка',
  'Окраска',
  'Сборка',
  'Контроль качества',
  'Склад готовой продукции',
] as const

/** «Дополнительные вводные» кейса. */
export const CASE_TARGETS = {
  shiftsPerDay: 2,
  shiftHours: 8,
  oeeMin: 85,
  defectMax: 2,
  criticalDowntimeMaxMin: 60,
  monthPlan: 5500,
} as const
