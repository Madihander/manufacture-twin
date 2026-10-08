// Выгрузка «Сводки» в Excel: несколько листов с настоящими числами, датами и формулами.
// Модуль грузится динамически по клику «Экспорт → Excel» — exceljs не попадает в основной бандл.
import ExcelJS, { type Cell, type CellValue, type Worksheet } from 'exceljs'
import { formatNumber } from '@/lib/format'
import { download, fileBase, filtersText, kpiNumber, paretoAll, periodText, type ReportData, SECTION_RU, SOURCE_NOTE, utcDate } from './common'

const FONT = 'Arial'
const NAVY = 'FF0B3B60'
const MUTED = 'FF5B6B7F'
const BORDER = 'FFE3E8EF'
const OK = 'FF1F7A50'
const ALARM = 'FFA3352C'
const SOFT = 'FFF5F7FA'

interface Col {
  title: string
  width: number
  numFmt?: string
  align?: 'left' | 'right' | 'center'
}

// Разделитель тысяч «,» и десятичный «.» — коды формата; Excel покажет их по локали (2 461 и 84,6 в русской).
const INT = '#,##0'
const DEC1 = '#,##0.0'
/** Формат по значению: у «0.##» Excel оставляет висящую точку у целых чисел. */
const numFmtOf = (v: number) => (Number.isInteger(v) ? INT : DEC1)
const PCT1 = '0.0" %"'
const DATE = 'dd.mm.yyyy'

export async function exportExcel(data: ReportData) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Цифровой двойник СарыаркаАвтоПром'
  wb.created = new Date()

  summarySheet(wb, data)
  shiftsSheet(wb, data)
  dynamicsSheet(wb, data)
  defectsSheet(wb, data)
  downtimeSheet(wb, data)
  paretoSheet(wb, data)
  forecastSheet(wb, data)
  risksSheet(wb, data)

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(data)}.xlsx`)
}

/** Заголовок листа: название, период и фильтры, источник данных. Возвращает первую свободную строку. */
function sheetTitle(ws: Worksheet, title: string, data: ReportData, span: number, note?: string): number {
  ws.mergeCells(1, 1, 1, span)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { name: FONT, size: 15, color: { argb: NAVY } }
  ws.getRow(1).height = 24
  const lines = [`Период ${periodText(data)} · ${filtersText(data)}`, note ?? SOURCE_NOTE, `Сформировано ${data.generatedAt} (модельное время)`]
  lines.forEach((text, i) => {
    ws.mergeCells(2 + i, 1, 2 + i, span)
    const c = ws.getCell(2 + i, 1)
    c.value = text
    c.font = { name: FONT, size: 9, color: { argb: MUTED } }
  })
  return 6
}

/** Таблица с шапкой: тёмно-синяя строка заголовков, тонкие рамки, форматы чисел по колонкам. */
function addTable(ws: Worksheet, top: number, cols: Col[], rows: CellValue[][], opts: { filter?: boolean; freeze?: boolean } = {}): number {
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    col.width = Math.max(col.width ?? 0, c.width)
  })
  const head = ws.getRow(top)
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.title
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left', wrapText: true }
  })
  head.height = 30
  rows.forEach((r, k) => {
    const row = ws.getRow(top + 1 + k)
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      body(cell, cols[i])
    })
  })
  if (opts.filter && rows.length) ws.autoFilter = { from: { row: top, column: 1 }, to: { row: top + rows.length, column: cols.length } }
  if (opts.freeze) ws.views = [{ state: 'frozen', ySplit: top }]
  return top + rows.length + 1
}

function body(cell: Cell, col: Col) {
  cell.font = { name: FONT, size: 10 }
  cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } }
  cell.alignment = { vertical: 'middle', horizontal: col.align ?? (col.numFmt ? 'right' : 'left'), wrapText: col.width > 30 }
  if (col.numFmt) cell.numFmt = col.numFmt
}

const paint = (cell: Cell, argb: string, bold = false) => (cell.font = { ...cell.font, color: { argb }, bold })

function sectionHeading(ws: Worksheet, row: number, text: string) {
  const c = ws.getCell(row, 1)
  c.value = text
  c.font = { name: FONT, size: 12, bold: true, color: { argb: NAVY } }
  ws.getRow(row).height = 20
}

function summarySheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Сводка', { properties: { tabColor: { argb: NAVY } } })
  let r = sheetTitle(ws, 'Сводный отчёт по производству · СарыаркаАвтоПром', d, 5)

  sectionHeading(ws, r, 'Ключевые показатели')
  r = addTable(
    ws,
    r + 1,
    [
      { title: 'Показатель', width: 34 },
      { title: 'Значение', width: 14, numFmt: INT },
      { title: 'Ед.', width: 22 },
      { title: 'Комментарий', width: 44 },
      { title: 'Статус', width: 14, align: 'center' },
    ],
    d.kpis.map((k) => [k.label, kpiNumber(k.value) ?? k.value, k.unit, k.note, k.ok === null ? '—' : k.ok ? 'в норме' : 'вне нормы']),
  )
  d.kpis.forEach((k, i) => {
    const v = kpiNumber(k.value)
    if (v !== null) ws.getCell(r - d.kpis.length + i, 2).numFmt = numFmtOf(v)
    if (k.ok !== null) paint(ws.getCell(r - d.kpis.length + i, 5), k.ok ? OK : ALARM, true)
  })

  r += 1
  sectionHeading(ws, r, 'Выпуск по моделям (с начала месяца)')
  const top = r + 1
  r = addTable(
    ws,
    top,
    [
      { title: 'Модель', width: 34 },
      { title: 'План месяца', width: 14, numFmt: INT },
      { title: 'Факт', width: 22, numFmt: INT },
      { title: 'Выполнение', width: 44, numFmt: '0.0 %' },
    ],
    d.models.map((m, i) => [m.name, m.plan, m.fact, { formula: `C${top + 1 + i}/B${top + 1 + i}`, result: m.fact / m.plan }]),
  )
  const sum = ws.getRow(r)
  sum.values = ['Итого по моделям', { formula: `SUM(B${top + 1}:B${r - 1})` }, { formula: `SUM(C${top + 1}:C${r - 1})` }, { formula: `C${r}/B${r}` }]
  ;[1, 2, 3, 4].forEach((i) => {
    const c = sum.getCell(i)
    body(c, { title: '', width: 10, numFmt: i === 4 ? '0.0 %' : i > 1 ? INT : undefined })
    c.font = { name: FONT, size: 10, bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }
  })
  note(ws, r + 1, `Сумма плана по моделям 4 800 < цели месяца 5 500: 700 авто не распределены по моделям. История не хранит модели — факт разложен по миксу плана.`)
  r += 3

  sectionHeading(ws, r, 'Прогноз выпуска на 31.10')
  r = addTable(
    ws,
    r + 1,
    [
      { title: 'Показатель', width: 34 },
      { title: 'Значение', width: 14, numFmt: INT },
    ],
    [
      ['План месяца', d.monthPlan],
      ['Прогноз ИИ', d.forecast],
      [d.forecast < d.monthPlan ? 'Недобор' : 'Перевыполнение', Math.abs(d.monthPlan - d.forecast)],
    ],
  )
  paint(ws.getCell(r - 1, 2), d.forecast < d.monthPlan ? ALARM : OK, true)

  r += 1
  sectionHeading(ws, r, 'Эффект для бизнеса')
  const e = d.effect
  r = addTable(
    ws,
    r + 1,
    [
      { title: 'Показатель', width: 34 },
      { title: 'Значение', width: 14, numFmt: INT },
      { title: 'Ед.', width: 22 },
    ],
    [
      ['Незапланированные простои в рабочий день', Math.round(e.perDay), 'мин'],
      ['То же за 22 рабочих дня', Math.round(e.monthMinutes), 'мин'],
      ['Доля предотвращённых простоев', e.share, '%'],
      ['Дополнительный выпуск', e.cars, 'авто в месяц'],
      ['Условная маржа на автомобиль', e.margin, '₸ (допущение)'],
      ['Дополнительная маржа', Math.round(e.money * 10) / 10, 'млн ₸ в месяц'],
    ],
  )
  ws.getCell(r - 1, 2).numFmt = numFmtOf(Math.round(e.money * 10) / 10)
  note(ws, r, 'Минуты → автомобили: такт линии 4 мин. Маржа — допущение, подставьте фактическую из финансовой модели.')
}

function note(ws: Worksheet, row: number, text: string) {
  ws.mergeCells(row, 1, row, 5)
  const c = ws.getCell(row, 1)
  c.value = text
  c.font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } }
  c.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(row).height = 26
}

function shiftsSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('По сменам')
  const top = sheetTitle(ws, 'Выпуск, загрузка и брак по сменам', d, 11, `${SOURCE_NOTE} · выпуск линии по всем моделям`)
  const rows = [...d.rows].sort((a, b) => a.date.localeCompare(b.date) || a.shift - b.shift || order(a.section) - order(b.section))
  const end = addTable(
    ws,
    top,
    [
      { title: 'Дата', width: 12, numFmt: DATE },
      { title: 'Смена', width: 8, align: 'center' },
      { title: 'Участок', width: 12 },
      { title: 'План, авто', width: 11, numFmt: INT },
      { title: 'Факт, авто', width: 11, numFmt: INT },
      { title: 'Отклонение', width: 12, numFmt: '+#,##0;-#,##0;0' },
      { title: 'Время работы, ч', width: 14, numFmt: DEC1 },
      { title: 'Загрузка, %', width: 12, numFmt: INT },
      { title: 'Брак, шт', width: 10, numFmt: INT },
      { title: 'Брак, %', width: 10, numFmt: PCT1 },
      { title: 'Источник', width: 12 },
    ],
    rows.map((r, i) => {
      const n = top + 1 + i
      return [
        utcDate(r.date),
        r.shift,
        SECTION_RU[r.section],
        r.plan,
        r.fact,
        { formula: `E${n}-D${n}`, result: r.fact - r.plan },
        Math.round(r.hours * 10) / 10,
        r.load,
        r.defects,
        { formula: `IF(E${n}=0,0,I${n}/E${n}*100)`, result: r.fact ? (r.defects / r.fact) * 100 : 0 },
        r.real ? 'кейс' : r.live ? 'симуляция' : 'модель',
      ]
    }),
    { filter: true, freeze: true },
  )
  rows.forEach((r, i) => {
    const n = top + 1 + i
    if (r.fact < r.plan) paint(ws.getCell(n, 6), ALARM)
    if (r.fact && (r.defects / r.fact) * 100 > d.defectMax) paint(ws.getCell(n, 10), ALARM)
  })
  if (rows.length) {
    const first = top + 1
    const last = end - 1
    const total = ws.getRow(end)
    total.values = [
      'Итого',
      '',
      '',
      { formula: `SUBTOTAL(9,D${first}:D${last})` },
      { formula: `SUBTOTAL(9,E${first}:E${last})` },
      { formula: `E${end}-D${end}` },
      { formula: `SUBTOTAL(9,G${first}:G${last})` },
      { formula: `SUBTOTAL(1,H${first}:H${last})` },
      { formula: `SUBTOTAL(9,I${first}:I${last})` },
      { formula: `IF(E${end}=0,0,I${end}/E${end}*100)` },
      '',
    ]
    const fmts = [undefined, undefined, undefined, INT, INT, '+#,##0;-#,##0;0', DEC1, INT, INT, PCT1, undefined]
    fmts.forEach((numFmt, i) => {
      const c = total.getCell(i + 1)
      body(c, { title: '', width: 10, numFmt })
      c.font = { name: FONT, size: 10, bold: true }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }
    })
    ws.getCell(end + 1, 1).value = 'Итоги учитывают автофильтр: скройте строки фильтром — суммы пересчитаются.'
    ws.getCell(end + 1, 1).font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } }
  }
}

const order = (s: keyof typeof SECTION_RU) => ['welding', 'painting', 'assembly'].indexOf(s)

function dynamicsSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Динамика')
  const sections = d.filters.sections
  const top = sheetTitle(ws, `План / факт и OEE по ${d.filters.detail === 'day' ? 'рабочим дням' : 'сменам'}`, d, 2 + sections.length * 2 + 1)
  const oeeBy = new Map(d.oeeData.map((p) => [p.label, p]))
  const cols: Col[] = [
    { title: d.filters.detail === 'day' ? 'День' : 'День · смена', width: 13 },
    ...sections.map((s) => ({ title: `Факт ${SECTION_RU[s]}, авто/смену`, width: 14, numFmt: INT })),
    { title: 'План, авто/смену', width: 12, numFmt: INT },
    ...sections.map((s) => ({ title: `OEE ${SECTION_RU[s]}, %`, width: 13, numFmt: PCT1 })),
    { title: 'Цель OEE, %', width: 11, numFmt: numFmtOf(d.oeeTarget) },
  ]
  const rows = d.planFact.map((p) => {
    const o = oeeBy.get(p.label)
    return [String(p.label), ...sections.map((s) => (p[s] as number | undefined) ?? null), d.plan, ...sections.map((s) => (o?.[s] as number | undefined) ?? null), d.oeeTarget]
  })
  addTable(ws, top, cols, rows, { freeze: true })
  rows.forEach((row, i) => {
    sections.forEach((_, k) => {
      const fact = row[1 + k] as number | null
      if (fact !== null && fact < d.plan) paint(ws.getCell(top + 1 + i, 2 + k), ALARM)
      const oee = row[2 + sections.length + k] as number | null
      if (oee !== null && oee < d.oeeTarget) paint(ws.getCell(top + 1 + i, 3 + sections.length + k), ALARM)
    })
  })
}

function defectsSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Брак')
  const top = sheetTitle(ws, 'Брак по участкам за период', d, 6)
  addTable(
    ws,
    top,
    [
      { title: 'Участок', width: 16 },
      { title: 'Выпущено, шт', width: 14, numFmt: INT },
      { title: 'Брак, шт', width: 12, numFmt: INT },
      { title: 'Брак, %', width: 12, numFmt: '0.00" %"' },
      { title: 'Порог, %', width: 12, numFmt: Number.isInteger(d.defectMax) ? '0" %"' : PCT1 },
      { title: 'Статус', width: 14, align: 'center' },
    ],
    d.defectData.map((x, i) => {
      const n = top + 1 + i
      return [x.name, x.produced, x.defects, { formula: `IF(B${n}=0,0,C${n}/B${n}*100)`, result: x.rate }, d.defectMax, x.rate > d.defectMax ? 'выше порога' : 'в норме']
    }),
  )
  d.defectData.forEach((x, i) => {
    const bad = x.rate > d.defectMax
    paint(ws.getCell(top + 1 + i, 6), bad ? ALARM : OK, true)
    if (bad) paint(ws.getCell(top + 1 + i, 4), ALARM, true)
  })
}

function downtimeSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Журнал простоев')
  const top = sheetTitle(ws, 'Журнал простоев', d, 9)
  const list = [...d.downtimes].sort((a, b) => b.date.localeCompare(a.date) || b.shift - a.shift)
  const end = addTable(
    ws,
    top,
    [
      { title: 'Дата', width: 12, numFmt: DATE },
      { title: 'Смена', width: 8, align: 'center' },
      { title: 'Участок', width: 12 },
      { title: 'Оборудование', width: 15 },
      { title: 'Причина', width: 34 },
      { title: 'Длительность, мин', width: 13, numFmt: INT },
      { title: 'Тип', width: 12 },
      { title: 'Статус', width: 11 },
      { title: 'Источник', width: 12 },
    ],
    list.map((x) => [utcDate(x.date), x.shift, SECTION_RU[x.section], x.equipmentId, x.reason, x.minutes, x.planned ? 'плановый' : 'аварийный', x.status, x.real ? 'кейс' : x.live ? 'симуляция' : 'модель']),
    { filter: true, freeze: true },
  )
  list.forEach((x, i) => {
    if (x.minutes > 45) paint(ws.getCell(top + 1 + i, 6), ALARM)
    if (x.status === 'Открыт') paint(ws.getCell(top + 1 + i, 8), NAVY, true)
  })
  if (list.length) {
    ws.getCell(end, 5).value = 'Итого, мин'
    ws.getCell(end, 6).value = { formula: `SUBTOTAL(9,F${top + 1}:F${end - 1})` }
    for (const i of [5, 6]) {
      const c = ws.getCell(end, i)
      body(c, { title: '', width: 10, numFmt: i === 6 ? INT : undefined })
      c.font = { name: FONT, size: 10, bold: true }
    }
  }
}

function paretoSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Парето простоев')
  // Все причины, а не только 6 с графика.
  const reasons = paretoAll(d)
  const top = sheetTitle(ws, 'Парето простоев: причины по суммарным минутам', d, 4)
  addTable(
    ws,
    top,
    [
      { title: 'Причина', width: 34 },
      { title: 'Минуты', width: 12, numFmt: INT },
      { title: 'Доля, %', width: 12, numFmt: PCT1 },
      { title: 'Накоплено, %', width: 14, numFmt: PCT1 },
    ],
    reasons.map((r, i) => {
      const n = top + 1 + i
      const range = `$B$${top + 1}:$B$${top + reasons.length}`
      return [r.reason, r.minutes, { formula: `B${n}/SUM(${range})*100`, result: r.share }, { formula: `SUM($B$${top + 1}:B${n})/SUM(${range})*100`, result: r.cum }]
    }),
  )
}

function forecastSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Прогноз месяца')
  const top = sheetTitle(ws, `Прогноз выпуска до 31.10: ${formatNumber(d.forecast)} из ${formatNumber(d.monthPlan)}`, d, 6, 'Накопительно по рабочим дням октября · коридор ±1,5 σ дневного выпуска')
  addTable(
    ws,
    top,
    [
      { title: 'Рабочий день', width: 13, numFmt: DATE },
      { title: 'Факт накопительно', width: 15, numFmt: INT },
      { title: 'Прогноз', width: 12, numFmt: INT },
      { title: 'Нижняя граница', width: 14, numFmt: INT },
      { title: 'Верхняя граница', width: 14, numFmt: INT },
      { title: 'План месяца', width: 12, numFmt: INT },
    ],
    d.forecastPoints.map((p) => [utcDate(`2026-10-${String(p.day).padStart(2, '0')}`), p.actual ?? null, p.forecast ?? null, p.band?.[0] ?? null, p.band?.[1] ?? null, d.monthPlan]),
    { freeze: true },
  )
}

function risksSheet(wb: ExcelJS.Workbook, d: ReportData) {
  const ws = wb.addWorksheet('Риски ИИ')
  const top = sheetTitle(ws, 'Ключевые риски — прогноз ИИ-диспетчера', d, 6, 'Прогнозы считает код двойника: тренд параметра к границе нормы, брак, узкое место, месячный план')
  const risks = d.predictions.filter((p) => p.level !== 'info')
  addTable(
    ws,
    top,
    [
      { title: 'Уровень', width: 12 },
      { title: 'Риск', width: 36 },
      { title: 'Оценка', width: 22 },
      { title: 'Признаки', width: 46 },
      { title: 'Рекомендация', width: 46 },
      { title: 'Эффект', width: 30 },
    ],
    risks.map((p) => [p.level === 'crit' ? 'критично' : 'внимание', p.title, `${p.big} ${p.unit} · ${p.bigLabel}`, p.signs.join('; '), p.recommendation, p.effect ?? '']),
  )
  risks.forEach((p, i) => paint(ws.getCell(top + 1 + i, 1), p.level === 'crit' ? ALARM : 'FF94600F', true))
}
