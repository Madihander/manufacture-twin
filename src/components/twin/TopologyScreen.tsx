import { lazy, Suspense, useRef } from 'react'
import { LoadingScreen } from '@/components/service/LoadingScreen'
import { FlowStrip } from './FlowStrip'
import { RightPanel } from './panel/RightPanel'
import { SceneOverlay } from './SceneOverlay'
import { SectionList } from './SectionList'

// three.js тяжёлый — грузим сцену отдельным чанком, интерфейс появляется сразу.
const TwinScene = lazy(() => import('@/scene/TwinScene'))

export function TopologyScreen() {
  const stage = useRef<HTMLDivElement>(null)
  const fullscreen = () => {
    const el = stage.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen()
  }
  return (
    <div className="flex min-h-0 flex-1">
      <SectionList />
      <div className="flex min-w-0 flex-1 flex-col bg-[#eef2f6]">
        <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_50%_45%,#f7f9fb_0%,#eef2f6_70%)]">
          <Suspense fallback={<LoadingScreen embedded progress={40} label="Загрузка модели цеха…" />}>
            <TwinScene />
          </Suspense>
          <SceneOverlay onFullscreen={fullscreen} />
        </div>
        <FlowStrip />
      </div>
      <RightPanel />
    </div>
  )
}
