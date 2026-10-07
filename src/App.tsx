import { MaintenanceDialog } from '@/components/service/MaintenanceDialog'
import { SettingsSheet } from '@/components/service/SettingsSheet'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceShowcase } from '@/dev/ServiceShowcase'

export default function App() {
  return (
    <TooltipProvider>
      <ServiceShowcase />
      <SettingsSheet />
      <MaintenanceDialog />
      <Toaster position="top-right" />
    </TooltipProvider>
  )
}
