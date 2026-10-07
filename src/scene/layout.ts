// Геометрия цеха в мировых единицах (1 ≈ 4 м). Линия идёт вдоль оси X; изометрическая камера
// смотрит с (+X, +Y, +Z), поэтому на экране поток идёт из левого верхнего угла в правый нижний.
import type { SectionId } from '@/data/plant'
import { LOC_WH_OUT } from '@/sim/engine'

export const BLOCK_STEP = 5.2
export const BLOCK_W = 4
export const BLOCK_D = 6.4
export const WALL_H = 1.3
export const SLAB_H = 0.12
export const BELT_Y = 0.3
export const CAR_Y = BELT_Y + 0.13

export const SECTION_ORDER: SectionId[] = ['wh-in', 'welding', 'painting', 'assembly', 'qc', 'wh-out']

export const blockX = (i: number) => (i - 2.5) * BLOCK_STEP
export const sectionX = (id: SectionId) => blockX(SECTION_ORDER.indexOf(id))

export const LINE_X0 = blockX(0) - BLOCK_W / 2
export const LINE_X1 = blockX(5) + BLOCK_W / 2

export interface Pose {
  x: number
  z: number
  /** Поворот вокруг Y: 0 — вдоль линии, π/2 — поперёк (очередь в буфере). */
  rot: number
}

/** Положение кузова по коду loc/p из снимка симуляции. */
export function carPose(loc: number, p: number): Pose {
  if (loc === LOC_WH_OUT) {
    // Площадка готовой продукции: сетка 3 × 4.
    const col = p % 3
    const row = Math.floor(p / 3)
    return { x: blockX(5) - 1 + col * 1, z: -1.8 + row * 1.1, rot: 0 }
  }
  if (loc < 0) return { x: blockX(0), z: 0, rot: 0 }
  const station = Math.floor(loc / 2)
  const block = station + 1
  if (loc % 2 === 1) {
    const left = blockX(block) - BLOCK_W / 2 + 0.45
    const right = blockX(block) + BLOCK_W / 2 - 0.45
    return { x: left + Math.min(1, Math.max(0, p)) * (right - left), z: 0, rot: 0 }
  }
  // Буфер перед станцией: в разрыве между корпусами, два ряда поперёк линии.
  const gapX = blockX(block) - BLOCK_STEP / 2
  const q = Math.max(0, Math.round(p))
  const col = q % 2
  const row = Math.floor(q / 2)
  return { x: gapX - 0.24 + col * 0.48, z: 0.62 + row * 0.92, rot: Math.PI / 2 }
}

/** Где стоит оборудование — для подсветки, подписей и наведения камеры. */
export const EQUIPMENT_POS: Record<string, [number, number, number]> = {
  'ABB-01': [blockX(1) - 0.9, 0, -1.05],
  'ABB-02': [blockX(1) + 0.9, 0, -1.05],
  'ABB-03': [blockX(1) - 0.9, 0, 1.05],
  'ABB-04': [blockX(1) + 0.9, 0, 1.05],
  'Камера-02': [blockX(2) - 0.75, 0, 0],
  'ПС-01': [blockX(2) + 1.05, 0, 0],
  'Конвейер-03': [blockX(3), 0, 0],
  'СЗ-01': [blockX(3) + 0.6, 0, -1.4],
  'СГ-01': [blockX(4) - 0.7, 0, 0],
  'КЛ-01': [blockX(4) + 0.9, 0, 0],
}
