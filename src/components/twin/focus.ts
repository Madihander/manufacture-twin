import { EQUIPMENT_BY_ID, type SectionId } from '@/data/plant'
import { useSim } from '@/store/sim'

/** Показать объект на карте: участок или оборудование. Переключает экран на «Топологию». */
export function focusObject(target: { section?: SectionId; equipmentId?: string }) {
  const s = useSim.getState()
  s.setScreen('topology')
  if (target.equipmentId && EQUIPMENT_BY_ID[target.equipmentId]) s.select({ kind: 'equipment', id: target.equipmentId })
  else if (target.section) s.select({ kind: 'section', id: target.section })
}

/** Объект инцидента: «Окраска-1» → участок, «ABB-01» → оборудование. */
export function focusIncidentObject(objectId: string, section: SectionId) {
  focusObject(EQUIPMENT_BY_ID[objectId] ? { equipmentId: objectId } : { section })
}
