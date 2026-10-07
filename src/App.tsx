import { HammerIcon } from 'lucide-react'
import { MaintenanceDialog } from '@/components/service/MaintenanceDialog'
import { SettingsSheet } from '@/components/service/SettingsSheet'
import { EmptyState } from '@/components/service/States'
import { SummaryScreen } from '@/components/summary/SummaryScreen'
import { AppHeader } from '@/components/twin/AppHeader'
import { IncidentWatcher } from '@/components/twin/IncidentWatcher'
import { SimBar } from '@/components/twin/SimBar'
import { TopologyScreen } from '@/components/twin/TopologyScreen'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceShowcase } from '@/dev/ServiceShowcase'
import { useSimClock } from '@/sim/clock'
import { useSim } from '@/store/sim'

export default function App() {
  useSimClock()
  const screen = useSim((s) => s.screen)
  // Витрина служебных окон из макета: /?showcase
  if (new URLSearchParams(location.search).has('showcase')) {
    return (
      <TooltipProvider>
        <ServiceShowcase />
        <SettingsSheet />
        <MaintenanceDialog />
        <Toaster position="top-right" />
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen min-h-[860px] min-w-[1440px] flex-col">
        <AppHeader />
        {screen === 'topology' ? (
          <TopologyScreen />
        ) : screen === 'summary' ? (
          <SummaryScreen />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={HammerIcon} text="Экран «Сценарии» — следующий этап" />
          </div>
        )}
        <SimBar />
      </div>
      <SettingsSheet />
      <MaintenanceDialog />
      <IncidentWatcher />
      <Toaster position="top-right" offset={{ top: 80, right: 440 }} />
    </TooltipProvider>
  )
}
