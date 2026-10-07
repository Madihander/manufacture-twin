import { LayoutGridIcon, MousePointerClickIcon, RadioIcon, SparklesIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type PanelTab, useSim } from '@/store/sim'
import { AiPanel } from './AiPanel'
import { CarPanel } from './CarPanel'
import { EquipmentPanel } from './EquipmentPanel'
import { OverviewPanel } from './OverviewPanel'
import { SectionPanel } from './SectionPanel'

const TABS: { id: PanelTab; label: string; Icon: typeof RadioIcon }[] = [
  { id: 'overview', label: 'Обзор', Icon: RadioIcon },
  { id: 'section', label: 'Участок', Icon: LayoutGridIcon },
  { id: 'ai', label: 'ИИ', Icon: SparklesIcon },
]

export function RightPanel() {
  const tab = useSim((s) => s.tab)
  const setTab = useSim((s) => s.setTab)
  const selection = useSim((s) => s.selection)

  return (
    <aside className="flex w-[420px] flex-none flex-col border-l bg-card">
      <div className="px-5 pt-3.5">
        <div className="grid grid-cols-3 gap-1 rounded-[10px] border bg-muted p-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex h-8 items-center justify-center gap-[7px] rounded-[7px] text-[13px] font-medium transition-colors',
                tab === id ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,27,42,0.08)]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-[15px]" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'overview' && <OverviewPanel />}
      {tab === 'ai' && <AiPanel />}
      {tab === 'section' &&
        (selection?.kind === 'section' ? (
          <SectionPanel key={selection.id} id={selection.id} />
        ) : selection?.kind === 'equipment' ? (
          <EquipmentPanel key={selection.id} id={selection.id} />
        ) : selection?.kind === 'car' ? (
          <CarPanel key={selection.id} id={selection.id} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full border bg-muted text-brand">
              <MousePointerClickIcon className="size-6" strokeWidth={1.75} />
            </span>
            <span className="max-w-60 text-[15px] leading-normal text-pretty">Выберите участок на карте или в списке слева</span>
          </div>
        ))}
    </aside>
  )
}
