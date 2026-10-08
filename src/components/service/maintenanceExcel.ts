// Выгрузка журнала заявок ТО в Excel. Грузится динамически по кнопке — exceljs не в основном бандле.
import ExcelJS from 'exceljs'
import { download } from '@/components/summary/export/common'
import { EQUIPMENT_BY_ID, SECTION_BY_ID } from '@/data/plant'
import { clockText } from '@/sim/clock'
import { type MaintenanceTicket, ticketSource, ticketWindow } from '@/store/maintenance'

const COLS: { title: string; width: number }[] = [
  { title: 'Номер', width: 11 },
  { title: 'Дата работ', width: 12 },
  { title: 'Окно работ', width: 13 },
  { title: 'Простой, мин', width: 12 },
  { title: 'Оборудование', width: 14 },
  { title: 'Наименование', width: 26 },
  { title: 'Участок', width: 22 },
  { title: 'Тип работ', width: 19 },
  { title: 'Приоритет', width: 11 },
  { title: 'Исполнитель', width: 15 },
  { title: 'Статус', width: 12 },
  { title: 'Источник', width: 22 },
  { title: 'Комментарий', width: 60 },
]

export async function exportMaintenance(tickets: MaintenanceTicket[]) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Цифровой двойник СарыаркаАвтоПром'
  const ws = wb.addWorksheet('Заявки ТО', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLS.map((c) => ({ header: c.title, width: c.width }))
  const head = ws.getRow(1)
  head.height = 24
  head.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3B60' } }
    cell.alignment = { vertical: 'middle' }
  })
  for (const t of tickets) {
    const eq = EQUIPMENT_BY_ID[t.equipmentId]
    const source = t.history ? `журнал простоев · ${ticketSource(t) === 'история' ? 'модель' : ticketSource(t)}` : `${t.fromAi ? 'ИИ-диспетчер' : 'двойник'} · ${t.createdT !== undefined ? clockText(t.createdT, false) : ''}`
    const row = ws.addRow([
      t.id,
      // Дата без часового пояса: Excel хранит дни.
      new Date(Date.UTC(t.date.getFullYear(), t.date.getMonth(), t.date.getDate())),
      ticketWindow(t),
      t.minutes ?? null,
      t.equipmentId,
      eq?.name ?? '',
      eq ? SECTION_BY_ID[eq.section].name : '',
      t.workType,
      t.priority,
      t.crew,
      t.status,
      source,
      t.comment,
    ])
    row.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10 }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE3E8EF' } } }
    })
    row.getCell(2).numFmt = 'dd.mm.yyyy'
    const statusColor = t.status === 'Выполнена' ? 'FF1F7A50' : t.status === 'Отменена' ? 'FF5B6B7F' : t.status === 'В работе' ? 'FF94600F' : 'FF0B3B60'
    row.getCell(11).font = { name: 'Arial', size: 10, bold: true, color: { argb: statusColor } }
    if (t.priority === 'Высокий') row.getCell(9).font = { name: 'Arial', size: 10, color: { argb: 'FFA3352C' } }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, tickets.length + 1), column: COLS.length } }
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Журнал заявок ТО СарыаркаАвтоПром.xlsx')
}
