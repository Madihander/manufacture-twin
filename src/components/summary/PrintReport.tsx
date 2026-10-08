// Печатная версия «Сводки»: альбомный A4, фиксированная компоновка. На экране скрыта,
// показывается только при печати (window.print → «Сохранить как PDF»). Стили печати — в index.css.
import type { ReactNode } from 'react'
import logo from '@/assets/allur-logo.png'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Prediction } from '@/sim/predict'
import type { downtimeRecords, Filters } from '@/sim/summary'
import type { ChartId } from './export/common'
import { type ChartSize, DefectChart, ForecastChart, OeeChart, ParetoChart, PlanFactChart, SECTION_NAME, SERIES } from './charts'

export interface ReportKpi {
  label: string
  value: string
  unit: string
  note: string
  ok: boolean | null
}

export interface PrintReportProps {
  filters: Filters
  modelName: string
  generatedAt: string
  kpis: ReportKpi[]
  planFact: Record<string, number | string>[]
  plan: number
  oeeData: Record<string, number | string>[]
  oeeTarget: number
  defectData: { name: string; rate: number; defects: number; produced: number }[]
  defectMax: number
  pareto: { reason: string; minutes: number; cum: number }[]
  models: { name: string; fact: number; plan: number }[]
  forecastPoints: { day: number; actual?: number; forecast?: number; band?: [number, number] }[]
  monthPlan: number
  forecast: number
  predictions: Prediction[]
  effect: { share: number; margin: number; perDay: number; monthMinutes: number; cars: number; money: number }
  downtimes: ReturnType<typeof downtimeRecords>
}

/** Ширина графика в половине страницы и в полной; высоты — под сетку страницы. */
const HALF: ChartSize = { width: 490, height: 405 }
const QUARTER: ChartSize = { width: 490, height: 255 }

export function PrintReport(p: PrintReportProps) {
  const period = `${formatDate(p.filters.from)} — ${formatDate(p.filters.to)}`
  const sections = p.filters.sections.map((s) => SECTION_NAME[s]).join(', ')
  const shift = p.filters.shift === 'all' ? 'обе смены' : `смена ${p.filters.shift}`
  const risks = p.predictions.filter((x) => x.level !== 'info').slice(0, 5)
  const sortedDowntimes = [...p.downtimes].sort((a, b) => b.date.localeCompare(a.date) || b.shift - a.shift)
  const totalDowntime = p.downtimes.reduce((a, d) => a + d.minutes, 0)

  return (
    <div className="print-report">
      {/* Страница 1 — итог и ключевые графики */}
      <Page n={1} title="Сводный отчёт по производству" generatedAt={p.generatedAt}>
        <div className="flex items-end justify-between gap-6 border-b border-[#e3e8ef] pb-3">
          <div className="flex flex-col gap-1">
            <span className="text-[24px] leading-tight font-normal tracking-[-0.01em]">Сводный отчёт по производству</span>
            <span className="text-[11px] text-[#5b6b7f]">
              Период <b className="font-mono font-medium text-[#0f1b2a]">{period}</b> · участки: {sections} · {shift} · модель: {p.modelName}
            </span>
          </div>
          <span className="rounded-[4px] border border-[#e3e8ef] bg-[#f5f7fa] px-2 py-1 text-[9px] whitespace-nowrap text-[#5b6b7f]">
            01–02.10 смена 1 — данные кейса · 03–15.10 — смоделированы · 15.10 смена 2 — симуляция
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2.5">
          {p.kpis.map((k) => (
            <div key={k.label} className="flex flex-col gap-1 rounded-[8px] border border-[#e3e8ef] px-3 py-2.5">
              <span className="text-[10px] text-[#5b6b7f]">{k.label}</span>
              <span className="flex items-baseline gap-1">
                <span className="text-[26px] leading-none font-light text-[#0b3b60]">{k.value}</span>
                <span className="text-[11px] text-[#5b6b7f]">{k.unit}</span>
              </span>
              <span className={cn('flex items-center gap-1.5 text-[9.5px]', k.ok === null ? 'text-[#5b6b7f]' : k.ok ? 'text-[#1f7a50]' : 'text-[#a3352c]')}>
                {k.ok !== null && <span className={cn('size-1.5 rounded-full', k.ok ? 'bg-[#2e9e6b]' : 'bg-[#c8453b]')} />}
                {k.note}
              </span>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Card chart="planFact" title="План / факт по линиям" subtitle={`Авто за смену, среднее по ${p.filters.detail === 'day' ? 'рабочему дню' : 'смене'} · план ${p.plan}`} legend={<SectionsLegend sections={p.filters.sections} plan />}>
            <PlanFactChart data={p.planFact} sections={p.filters.sections} plan={p.plan} size={HALF} />
          </Card>
          <Card chart="oee" title="OEE по участкам" subtitle={`%, по рабочим дням · цель ${p.oeeTarget} %`} legend={<SectionsLegend sections={p.filters.sections} line />}>
            <OeeChart data={p.oeeData} sections={p.filters.sections} target={p.oeeTarget} size={HALF} />
          </Card>
        </div>
      </Page>

      {/* Страница 2 — качество, простои, модели, прогноз */}
      <Page n={2} title="Качество, простои и прогноз" generatedAt={p.generatedAt}>
        <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-3">
          <Card chart="defects" title="Брак по участкам, %" subtitle={`За период · порог ${formatNumber(p.defectMax, 0)} % · выше порога — красным`}>
            <DefectChart data={p.defectData} threshold={p.defectMax} size={QUARTER} />
          </Card>
          <Card chart="pareto" title="Парето простоев" subtitle="Минуты по причинам и накопленная доля">
            {p.pareto.length ? <ParetoChart data={p.pareto} size={QUARTER} /> : <Empty text="Простоев за период нет" />}
          </Card>
          <Card title="Выпуск по моделям" subtitle="Факт с начала месяца против плана месяца">
            <div className="flex flex-1 flex-col justify-center gap-3">
              {p.models.map((m) => (
                <div key={m.name} className="grid grid-cols-[110px_minmax(0,1fr)_96px] items-center gap-3 text-[11px]">
                  <span>{m.name}</span>
                  <div className="h-3.5 rounded-[3px] bg-[#e3e8ef]" style={{ width: `${(m.plan / Math.max(...p.models.map((x) => x.plan))) * 100}%` }}>
                    <div className="h-full rounded-[3px] bg-[#0088cc]" style={{ width: `${Math.min(100, (m.fact / m.plan) * 100)}%` }} />
                  </div>
                  <span className="text-right font-mono text-[10px]">
                    {formatNumber(m.fact)} / {formatNumber(m.plan)}
                  </span>
                </div>
              ))}
              <span className="rounded-[4px] bg-[#fdf3e2] px-2 py-1.5 text-[10px] text-[#94600f]">
                Сумма плана по моделям 4 800 &lt; цели 5 500: 700 авто не распределены по моделям
              </span>
            </div>
          </Card>
          <Card chart="forecast" title="Прогноз выпуска до конца месяца" subtitle={`Накопительно · прогноз ${formatNumber(p.forecast)} из ${formatNumber(p.monthPlan)}`}>
            <ForecastChart data={p.forecastPoints} target={p.monthPlan} size={QUARTER} />
          </Card>
        </div>
      </Page>

      {/* Страница 3 — риски ИИ и эффект */}
      <Page n={3} title="Риски и эффект для бизнеса" generatedAt={p.generatedAt}>
        <div className="grid flex-1 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4">
          <div className="flex flex-col gap-2">
            <SectionTitle>Ключевые риски — прогноз ИИ-диспетчера</SectionTitle>
            {risks.length === 0 && <Empty text="Рисков не обнаружено" />}
            {risks.map((r) => (
              <div key={r.id} className="flex overflow-hidden rounded-[8px] border border-[#e3e8ef]">
                <div className={cn('w-1 flex-none', r.level === 'crit' ? 'bg-[#c8453b]' : 'bg-[#e09a1f]')} />
                <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11.5px] font-medium">{r.title}</span>
                    <span className="font-mono text-[11px] whitespace-nowrap text-[#0b3b60]">
                      {r.big} {r.unit} · {r.bigLabel}
                    </span>
                  </div>
                  <span className="text-[9.5px] text-[#5b6b7f]">Признаки: {r.signs.join('; ')}</span>
                  <span className="text-[10px]">
                    <b className="font-medium">Рекомендация:</b> {r.recommendation}
                    {r.effect && <span className="text-[#0b3b60]"> · Эффект: {r.effect}</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <SectionTitle>Эффект для бизнеса</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-[8px] bg-[#e6f3fa] px-3 py-2.5">
                <span className="text-[10px] text-[#0b3b60]">Дополнительный выпуск</span>
                <span className="text-[26px] leading-none font-light text-[#0b3b60]">+{p.effect.cars}</span>
                <span className="text-[9.5px] text-[#5b6b7f]">авто в месяц</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[8px] bg-[#e6f3fa] px-3 py-2.5">
                <span className="text-[10px] text-[#0b3b60]">Дополнительная маржа</span>
                <span className="text-[26px] leading-none font-light text-[#0b3b60]">≈ {formatNumber(p.effect.money, p.effect.money < 10 ? 1 : 0)}</span>
                <span className="text-[9.5px] text-[#5b6b7f]">млн ₸ в месяц</span>
              </div>
            </div>
            <ol className="flex list-decimal flex-col gap-1 pl-4 text-[10px] leading-snug text-[#5b6b7f]">
              <li>
                Незапланированные простои: <b className="font-mono font-medium text-[#0f1b2a]">{formatNumber(p.effect.perDay, 0)} мин</b> в рабочий день →{' '}
                <b className="font-mono font-medium text-[#0f1b2a]">{formatNumber(p.effect.monthMinutes, 0)} мин</b> за 22 рабочих дня.
              </li>
              <li>
                Двойник предупреждает об отказе заранее (в этой смене — Конвейер-03 за 30 мин до обрыва цепи), ремонт переносится в перерыв.
              </li>
              <li>
                Доля предотвращённых аварий — <b className="font-mono font-medium text-[#0f1b2a]">{p.effect.share} %</b> (консервативная оценка).
              </li>
              <li>
                Минуты → автомобили: такт 4 мин; автомобили → деньги: маржа <b className="font-mono font-medium text-[#0f1b2a]">{formatNumber(p.effect.margin)} ₸</b> (допущение).
              </li>
            </ol>
            <div className="mt-auto rounded-[8px] border border-[#e3e8ef] bg-[#f5f7fa] px-3 py-2 text-[9.5px] leading-snug text-[#5b6b7f]">
              Простоев за период: <b className="font-mono text-[#0f1b2a]">{p.downtimes.length}</b> событий, <b className="font-mono text-[#0f1b2a]">{formatNumber(totalDowntime)}</b> мин.
              Полный журнал — в приложении на следующих страницах.
            </div>
          </div>
        </div>
      </Page>

      {/* Приложение — журнал простоев, перетекает на нужное число страниц */}
      <section className="print-appendix">
        <PageHeader title="Приложение · Журнал простоев" />
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-[#f5f7fa] text-left text-[9.5px] text-[#5b6b7f]">
              {['Дата', 'Смена', 'Участок', 'Оборудование', 'Причина', 'Длительность', 'Тип', 'Статус'].map((h) => (
                <th key={h} className="border-b border-[#e3e8ef] px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedDowntimes.map((d, i) => (
              <tr key={i} className="border-b border-[#eef2f6]">
                <td className="px-2 py-1 font-mono">{`${d.date.slice(8, 10)}.${d.date.slice(5, 7)}.2026`}</td>
                <td className="px-2 py-1 font-mono">{d.shift}</td>
                <td className="px-2 py-1">{SECTION_NAME[d.section]}</td>
                <td className="px-2 py-1 font-mono">{d.equipmentId}</td>
                <td className="px-2 py-1">
                  {d.reason}
                  {d.real && <span className="ml-1 text-[#0077b6]">(кейс)</span>}
                </td>
                <td className={cn('px-2 py-1 font-mono', d.minutes > 45 && 'text-[#a3352c]')}>{d.minutes} мин</td>
                <td className="px-2 py-1">{d.planned ? 'плановый' : 'аварийный'}</td>
                <td className="px-2 py-1">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PageFooter generatedAt={p.generatedAt} />
      </section>
    </div>
  )
}

function Page({ n, title, generatedAt, children }: { n: number; title: string; generatedAt: string; children: ReactNode }) {
  return (
    <section className="print-page">
      <PageHeader title={title} page={n} />
      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
      <PageFooter generatedAt={generatedAt} />
    </section>
  )
}

function PageHeader({ title, page }: { title: string; page?: number }) {
  return (
    <header className="mb-3 flex items-center justify-between border-b-2 border-[#0b3b60] pb-2">
      <div className="flex items-center gap-3">
        <img src={logo} alt="Allur" className="h-[18px]" />
        <span className="h-4 w-px bg-[#e3e8ef]" />
        <span className="text-[11px] font-semibold">СарыаркаАвтоПром</span>
        <span className="text-[11px] text-[#5b6b7f]">Цифровой двойник</span>
      </div>
      <span className="text-[10px] text-[#5b6b7f]">
        {title}
        {page && <span className="ml-2 font-mono">· стр. {page}</span>}
      </span>
    </header>
  )
}

function PageFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="mt-2 flex justify-between border-t border-[#e3e8ef] pt-1.5 text-[8.5px] text-[#94a3b8]">
      <span>Qostanai Industry Hackathon 2026 · кейс АО «Группа компаний Аллюр» · демо-модель на тестовых данных кейса</span>
      <span>Сформировано {generatedAt} (модельное время)</span>
    </footer>
  )
}

/** chart — метка графика: по ней экспорт в Word находит SVG и делает картинку. */
function Card({ chart, title, subtitle, legend, children }: { chart?: ChartId; title: string; subtitle: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div data-chart={chart} className="flex min-h-0 flex-col gap-1.5 rounded-[8px] border border-[#e3e8ef] px-3.5 pt-2.5 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[12px] font-medium">{title}</span>
          <span className="text-[9.5px] text-[#5b6b7f]">{subtitle}</span>
        </div>
        {legend}
      </div>
      {children}
    </div>
  )
}

function SectionsLegend({ sections, plan, line }: { sections: (keyof typeof SERIES)[]; plan?: boolean; line?: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2.5 text-[9.5px] text-[#5b6b7f]">
      {sections.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={line ? 'h-0.5 w-3' : 'size-2 rounded-[2px]'} style={{ background: SERIES[s] }} />
          {SECTION_NAME[s]}
        </span>
      ))}
      {plan && (
        <span className="inline-flex items-center gap-1">
          <span className="w-3 border-t-[1.5px] border-dashed border-[#94a3b8]" />
          План
        </span>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-medium">{children}</span>
}

function Empty({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center text-[11px] text-[#5b6b7f]">{text}</div>
}
