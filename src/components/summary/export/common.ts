// Общее для выгрузок «Сводки»: данные отчёта, имя файла, скачивание, растеризация графиков печатного отчёта.
import { formatDate } from '@/lib/format'
import type { Row } from '@/sim/summary'
import type { PrintReportProps } from '../PrintReport'

/** Всё, что попадает в отчёт: то же, что в PDF, плюс строки смен за период. */
export type ReportData = PrintReportProps & { rows: Row[] }

/** Графики печатного отчёта, помеченные data-chart, — из них берутся картинки для Word. */
export type ChartId = 'planFact' | 'oee' | 'defects' | 'pareto' | 'forecast'

export const SECTION_RU = { welding: 'Сварка', painting: 'Окраска', assembly: 'Сборка' } as const

export function fileBase(data: ReportData): string {
  return `Сводка СарыаркаАвтоПром ${formatDate(data.filters.from)}–${formatDate(data.filters.to)}`
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** «2026-10-15» → «15.10.2026». */
export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

/** Дата без часового пояса: Excel хранит дни, а локальная полночь в UTC+5 — это ещё вчера. */
export const utcDate = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))

export const periodText = (data: ReportData) => `${formatDate(data.filters.from)} — ${formatDate(data.filters.to)}`

export function filtersText(data: ReportData): string {
  const sections = data.filters.sections.map((s) => SECTION_RU[s]).join(', ')
  const shift = data.filters.shift === 'all' ? 'обе смены' : `смена ${data.filters.shift}`
  return `Участки: ${sections} · ${shift} · модель: ${data.modelName}`
}

/** Все причины простоя за период: минуты, доля и накопленная доля, %. График показывает только 6 главных. */
export function paretoAll(data: ReportData): { reason: string; minutes: number; share: number; cum: number }[] {
  const byReason = new Map<string, number>()
  for (const x of data.downtimes) byReason.set(x.reason, (byReason.get(x.reason) ?? 0) + x.minutes)
  const sorted = [...byReason.entries()].sort((a, b) => b[1] - a[1])
  const total = sorted.reduce((a, [, m]) => a + m, 0)
  let cum = 0
  return sorted.map(([reason, minutes]) => {
    cum += minutes
    return { reason, minutes, share: total ? (minutes / total) * 100 : 0, cum: total ? (cum / total) * 100 : 0 }
  })
}

export const SOURCE_NOTE = '01–02.10 смена 1 — данные кейса · 03–15.10 — смоделированы · 15.10 смена 2 — живая симуляция'

/** «5 123» / «84,6» → число; null, если значение не числовое. */
export function kpiNumber(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Картинка графика из печатного отчёта (он всегда смонтирован, графики фиксированного размера).
 * SVG Recharts → PNG через canvas с двойным разрешением.
 */
export async function chartPng(id: ChartId, scale = 2): Promise<{ data: ArrayBuffer; width: number; height: number } | null> {
  const svg = document.querySelector<SVGSVGElement>(`.print-report [data-chart="${id}"] svg.recharts-surface`)
  if (!svg) return null
  const width = Number(svg.getAttribute('width')) || svg.viewBox.baseVal.width
  const height = Number(svg.getAttribute('height')) || svg.viewBox.baseVal.height
  if (!width || !height) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  // Картинка SVG не видит шрифтов страницы — подписи берут системный моноширинный.
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = "text{font-family:Consolas,'DejaVu Sans Mono',Menlo,monospace}"
  clone.prepend(style)
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const g = canvas.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? { data: await blob.arrayBuffer(), width, height } : null
  } finally {
    URL.revokeObjectURL(url)
  }
}
