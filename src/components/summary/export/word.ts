// Выгрузка «Сводки» в Word: тот же отчёт, что PDF, но редактируемый — книжный A4, графики картинками.
// Модуль грузится динамически по клику «Экспорт → Word» — docx не попадает в основной бандл.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import logoUrl from '@/assets/allur-logo.png'
import { formatNumber, plural } from '@/lib/format'
import { type ChartId, chartPng, download, dmy, fileBase, filtersText, paretoAll, periodText, type ReportData, SECTION_RU, SOURCE_NOTE } from './common'

const FONT = 'Arial'
const NAVY = '0B3B60'
const MUTED = '5B6B7F'
const BORDER = 'E3E8EF'
const OK = '1F7A50'
const ALARM = 'A3352C'
const WARN = '94600F'
const SERIES = { welding: '0B3B60', painting: '0088CC', assembly: '7CC4E8' } as const

/** A4 книжный, поля 1,8 см: ширина текста в твипах и в пикселях (для картинок). */
const PAGE_W = 11906
const MARGIN_X = 1021
const TEXT_W = PAGE_W - 2 * MARGIN_X
const TEXT_PX = Math.floor((TEXT_W / 1440) * 96)

type Block = Paragraph | Table

export async function exportWord(data: ReportData) {
  const [logo, charts] = await Promise.all([loadLogo(), loadCharts()])
  const doc = new Document({
    creator: 'Цифровой двойник СарыаркаАвтоПром',
    title: `Сводный отчёт по производству ${periodText(data)}`,
    styles: {
      default: { document: { run: { font: FONT, size: 20, color: '0F1B2A' }, paragraph: { spacing: { after: 80 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '0F1B2A' }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true } },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1000, bottom: 900, left: MARGIN_X, right: MARGIN_X, header: 500, footer: 450 } } },
        headers: { default: pageHeader(logo) },
        footers: { default: pageFooter(data) },
        children: body(data, charts),
      },
    ],
  })
  download(await Packer.toBlob(doc), `${fileBase(data)}.docx`)
}

async function loadLogo() {
  try {
    const res = await fetch(logoUrl)
    const buf = await res.arrayBuffer()
    const img = new Image()
    img.src = logoUrl
    await img.decode()
    return { data: buf, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

async function loadCharts() {
  const ids: ChartId[] = ['planFact', 'oee', 'defects', 'pareto', 'forecast']
  const pngs = await Promise.all(ids.map((id) => chartPng(id).catch(() => null)))
  return Object.fromEntries(ids.map((id, i) => [id, pngs[i]])) as Record<ChartId, Awaited<ReturnType<typeof chartPng>>>
}

function pageHeader(logo: Awaited<ReturnType<typeof loadLogo>>) {
  const h = 16
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 4 } },
        children: [
          ...(logo ? [new ImageRun({ type: 'png', data: logo.data, transformation: { width: Math.round((logo.width / logo.height) * h), height: h } }), new TextRun({ text: '   ' })] : []),
          new TextRun({ text: 'СарыаркаАвтоПром', bold: true, size: 18 }),
          new TextRun({ text: '  Цифровой двойник', size: 18, color: MUTED }),
          new TextRun({ children: [new Tab(), 'Сводный отчёт по производству'], size: 16, color: MUTED }),
        ],
      }),
    ],
  })
}

function pageFooter(data: ReportData) {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 4 } },
        children: [
          new TextRun({ text: `Qostanai Industry Hackathon 2026 · кейс АО «Группа компаний Аллюр» · сформировано ${data.generatedAt} (модельное время)`, size: 14, color: '94A3B8' }),
          new TextRun({ children: [new Tab(), 'стр. ', PageNumber.CURRENT, ' из ', PageNumber.TOTAL_PAGES], size: 14, color: '94A3B8' }),
        ],
      }),
    ],
  })
}

function body(d: ReportData, charts: Awaited<ReturnType<typeof loadCharts>>): Block[] {
  const out: Block[] = []
  const risks = d.predictions.filter((p) => p.level !== 'info').slice(0, 5)
  const totalDowntime = d.downtimes.reduce((a, x) => a + x.minutes, 0)
  const sectionsLegend = (line = false) =>
    legend([...d.filters.sections.map((s) => ({ color: SERIES[s], label: SECTION_RU[s], line })), ...(line ? [] : [{ color: '94A3B8', label: 'План', line: true }])])

  out.push(
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Сводный отчёт по производству', size: 40, color: NAVY })] }),
    new Paragraph({ children: [new TextRun({ text: 'Период ', color: MUTED }), new TextRun({ text: periodText(d), bold: true }), new TextRun({ text: ` · ${filtersText(d)}`, color: MUTED })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: SOURCE_NOTE, size: 16, color: MUTED })] }),
  )

  out.push(h1('1. Ключевые показатели'))
  out.push(
    table(
      [
        { title: 'Показатель', w: 30 },
        { title: 'Значение', w: 24, right: true },
        { title: 'Комментарий', w: 30 },
        { title: 'Статус', w: 16 },
      ],
      d.kpis.map((k) => [
        k.label,
        [run(k.value, { bold: true, size: 22, color: NAVY }), run(` ${k.unit}`, { color: MUTED, size: 16 })],
        k.note,
        k.ok === null ? run('—', { color: MUTED }) : run(k.ok ? '● в норме' : '● вне нормы', { color: k.ok ? OK : ALARM, bold: true }),
      ]),
    ),
  )

  out.push(h1('2. Ключевые риски — прогноз ИИ-диспетчера'))
  if (!risks.length) out.push(p('Рисков не обнаружено.', { color: MUTED }))
  for (const r of risks) {
    out.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 120, after: 40 },
        border: { left: { style: BorderStyle.SINGLE, size: 24, color: r.level === 'crit' ? 'C8453B' : 'E09A1F', space: 8 } },
        children: [run(r.title, { bold: true }), run(`   ${r.big} ${r.unit} · ${r.bigLabel}`, { color: NAVY })],
      }),
      new Paragraph({ indent: { left: 200 }, spacing: { after: 20 }, children: [run('Признаки: ', { color: MUTED }), run(r.signs.join('; '), { color: MUTED })] }),
      new Paragraph({
        indent: { left: 200 },
        children: [run('Рекомендация: ', { bold: true }), run(r.recommendation), ...(r.effect ? [run(` · Эффект: ${r.effect}`, { color: NAVY })] : [])],
      }),
    )
  }

  out.push(h1('3. Выпуск и эффективность линий'))
  out.push(h2('План / факт по линиям'), caption(`Авто за смену, среднее по ${d.filters.detail === 'day' ? 'рабочему дню' : 'смене'} · план ${d.plan}`), sectionsLegend())
  out.push(...image(charts.planFact))
  out.push(h2('OEE по участкам'), caption(`%, по рабочим дням · цель ${d.oeeTarget} % · точки ниже цели — красные`), sectionsLegend(true))
  out.push(...image(charts.oee))

  out.push(h1('4. Качество'))
  out.push(h2('Брак по участкам, %'), caption(`За период · порог ${formatNumber(d.defectMax, 0)} % · выше порога — красным`))
  out.push(...image(charts.defects, 0.8))
  out.push(
    table(
      [
        { title: 'Участок', w: 28 },
        { title: 'Выпущено, шт', w: 18, right: true },
        { title: 'Брак, шт', w: 18, right: true },
        { title: 'Брак, %', w: 18, right: true },
        { title: 'Статус', w: 18 },
      ],
      d.defectData.map((x) => {
        const bad = x.rate > d.defectMax
        return [x.name, formatNumber(x.produced), formatNumber(x.defects), run(formatNumber(x.rate, 1), { color: bad ? ALARM : undefined, bold: bad }), run(bad ? '● выше порога' : '● в норме', { color: bad ? ALARM : OK })]
      }),
    ),
  )

  out.push(h1('5. Простои'))
  out.push(h2('Парето простоев'), caption(`Минуты по причинам и накопленная доля${paretoAll(d).length > 6 ? ` · на графике 6 главных из ${paretoAll(d).length}` : ''} · всего ${d.downtimes.length} ${plural(d.downtimes.length, ['событие', 'события', 'событий'])}, ${formatNumber(totalDowntime)} мин`))
  if (d.pareto.length) {
    out.push(...image(charts.pareto, 0.8))
    out.push(
      table(
        [
          { title: 'Причина', w: 46 },
          { title: 'Минуты', w: 18, right: true },
          { title: 'Доля, %', w: 18, right: true },
          { title: 'Накоплено, %', w: 18, right: true },
        ],
        paretoAll(d).map((x) => [x.reason, formatNumber(x.minutes), formatNumber(x.share, 1), formatNumber(x.cum, 1)]),
      ),
    )
  } else out.push(p('Простоев за период нет.', { color: MUTED }))
  out.push(p('Полный журнал простоев — в приложении в конце отчёта.', { color: MUTED, size: 16 }))

  out.push(h1('6. Выпуск по моделям и прогноз месяца'))
  out.push(h2('Выпуск по моделям'), caption('Факт с начала месяца против плана месяца'))
  out.push(
    table(
      [
        { title: 'Модель', w: 34 },
        { title: 'План месяца', w: 22, right: true },
        { title: 'Факт', w: 22, right: true },
        { title: 'Выполнение', w: 22, right: true },
      ],
      d.models.map((m) => [m.name, formatNumber(m.plan), formatNumber(m.fact), `${formatNumber((m.fact / m.plan) * 100, 1)} %`]),
    ),
  )
  out.push(
    new Paragraph({
      spacing: { before: 80 },
      shading: { type: ShadingType.CLEAR, fill: 'FDF3E2', color: 'auto' },
      children: [run('Сумма плана по моделям 4 800 < цели 5 500: 700 авто не распределены по моделям.', { color: WARN, size: 18 })],
    }),
  )
  out.push(h2('Прогноз выпуска до конца месяца'), caption('Накопительно по рабочим дням октября'))
  out.push(
    legend([
      { color: NAVY, label: 'факт', line: true },
      { color: '0088CC', label: 'прогноз', line: true },
      { color: 'CCE7F5', label: 'коридор неопределённости' },
    ]),
  )
  out.push(...image(charts.forecast, 0.9))
  const short = d.forecast < d.monthPlan
  out.push(
    new Paragraph({
      children: [
        run('Прогноз ИИ на 31.10: '),
        run(`${formatNumber(d.forecast)} из ${formatNumber(d.monthPlan)}`, { bold: true }),
        run(short ? ` · недобор ${formatNumber(d.monthPlan - d.forecast)}` : ` · перевыполнение ${formatNumber(d.forecast - d.monthPlan)}`, { color: short ? ALARM : OK, bold: true }),
      ],
    }),
  )

  const e = d.effect
  out.push(h1('7. Эффект для бизнеса'))
  out.push(
    table(
      [
        { title: 'Дополнительный выпуск', w: 50 },
        { title: 'Дополнительная маржа', w: 50 },
      ],
      [
        [
          [run('Дополнительный выпуск', { color: NAVY, size: 17 }), new TextRun({ text: `+${e.cars}`, break: 1, size: 40, color: NAVY }), run('  авто в месяц', { color: MUTED })],
          [
            run('Дополнительная маржа', { color: NAVY, size: 17 }),
            new TextRun({ text: `≈ ${formatNumber(e.money, e.money < 10 ? 1 : 0)}`, break: 1, size: 40, color: NAVY }),
            run('  млн ₸ в месяц', { color: MUTED }),
          ],
        ],
      ],
      'E6F3FA',
    ),
  )
  const steps = [
    `Незапланированные простои по журналу октября: ${formatNumber(e.perDay, 0)} мин в рабочий день → ${formatNumber(e.monthMinutes, 0)} мин за 22 рабочих дня.`,
    'Двойник предупреждает об отказе заранее (в этой смене — рост натяжения цепи Конвейер-03 за 30 мин до обрыва), ремонт переносится в технологический перерыв.',
    `Доля предотвращённых аварий — ${e.share} % (консервативная оценка: не у всех отказов есть заметные предвестники).`,
    `Минуты → автомобили: такт линии 4 мин. Автомобили → деньги: × маржа ${formatNumber(e.margin)} ₸ на автомобиль (допущение — подставьте фактическую).`,
  ]
  steps.forEach((s, i) => out.push(new Paragraph({ indent: { left: 360, hanging: 240 }, children: [run(`${i + 1}. `, { color: MUTED }), run(s, { size: 18 })] })))

  out.push(new Paragraph({ children: [new PageBreak()] }))
  out.push(h1('Приложение. Журнал простоев'))
  const sorted = [...d.downtimes].sort((a, b) => b.date.localeCompare(a.date) || b.shift - a.shift)
  out.push(
    sorted.length
      ? table(
          [
            { title: 'Дата', w: 12 },
            { title: 'См.', w: 6 },
            { title: 'Участок', w: 11 },
            { title: 'Оборудование', w: 15 },
            { title: 'Причина', w: 26 },
            { title: 'Мин', w: 8, right: true },
            { title: 'Тип', w: 12 },
            { title: 'Статус', w: 10 },
          ],
          sorted.map((x) => [
            dmy(x.date),
            String(x.shift),
            SECTION_RU[x.section],
            x.equipmentId,
            x.reason + (x.real ? ' (кейс)' : ''),
            run(String(x.minutes), { color: x.minutes > 45 ? ALARM : undefined }),
            x.planned ? 'плановый' : 'аварийный',
            x.status,
          ]),
          undefined,
          16,
        )
      : p('Простоев за период нет.', { color: MUTED }),
  )
  return out
}

// — строительные блоки —

function run(text: string, o: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text, bold: o.bold, color: o.color, size: o.size })
}

function p(text: string, o: { color?: string; size?: number } = {}) {
  return new Paragraph({ children: [run(text, o)] })
}

const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] })
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
const caption = (text: string) => new Paragraph({ keepNext: true, children: [run(text, { color: MUTED, size: 17 })] })

function legend(items: { color: string; label: string; line?: boolean }[]) {
  return new Paragraph({
    keepNext: true,
    children: items.flatMap((it, i) => [run(`${i ? '     ' : ''}${it.line ? '━' : '■'} `, { color: it.color, size: 18 }), run(it.label, { color: MUTED, size: 16 })]),
  })
}

/** Картинка графика по ширине текста (fraction — доля ширины). Если графика нет — короткая пометка. */
function image(png: Awaited<ReturnType<typeof chartPng>>, fraction = 1): Paragraph[] {
  if (!png) return [p('График недоступен — откройте PDF-отчёт.', { color: MUTED, size: 16 })]
  const width = Math.round(TEXT_PX * fraction)
  const height = Math.round((png.height / png.width) * width)
  return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new ImageRun({ type: 'png', data: png.data, transformation: { width, height } })] })]
}

type CellContent = string | TextRun | TextRun[]

/** Таблица на всю ширину: шапка тёмно-синяя, строки с тонкими разделителями. w — доли ширины в %. */
function table(cols: { title: string; w: number; right?: boolean }[], rows: CellContent[][], fill?: string, size = 18): Table {
  const widths = cols.map((c) => Math.round((TEXT_W * c.w) / 100))
  const line = { style: BorderStyle.SINGLE, size: 4, color: BORDER }
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const margins = { top: 50, bottom: 50, left: 100, right: 100 }
  const head = new TableRow({
    tableHeader: true,
    children: cols.map(
      (c, i) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
          margins,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ spacing: { after: 0 }, alignment: c.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(c.title, { bold: true, color: 'FFFFFF', size: 17 })] })],
        }),
    ),
  })
  const body = rows.map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: r.map((v, i) => {
          const runs = typeof v === 'string' ? [run(v, { size })] : Array.isArray(v) ? v : [v]
          return new TableCell({
            width: { size: widths[i], type: WidthType.DXA },
            shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
            margins,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ spacing: { after: 0 }, alignment: cols[i].right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: runs })],
          })
        }),
      }),
  )
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: line, bottom: line, left: none, right: none, insideHorizontal: line, insideVertical: none },
    rows: fill ? body : [head, ...body],
  })
}
