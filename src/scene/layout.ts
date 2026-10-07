// Геометрия цеха в мировых единицах (1 ≈ 4 м). Линия идёт вдоль оси X; изометрическая камера
// смотрит с (+X, +Y, +Z), поэтому на экране поток идёт из левого верхнего угла в правый нижний.
import type { SectionId } from '@/data/plant'
import { LOC_WH_OUT } from '@/sim/engine'
import { STATIONS } from '@/sim/model'

export const BLOCK_D = 6.4
export const WALL_H = 1.3
export const SLAB_H = 0.12
export const BELT_Y = 0.3
export const CAR_Y = BELT_Y + 0.09
/** Разрыв между корпусами — там же буферные площадки. */
export const GAP = 1.5

/** Габариты кузова: пропорции седана ≈ 4,5 × 1,8 × 1,5 м. */
export const CAR_L = 0.6
export const CAR_W = 0.26

/** Поля у входа и выхода участка, внутри которых стоят места. */
const MARGIN = 0.4

export const SECTION_ORDER: SectionId[] = ['wh-in', 'welding', 'painting', 'assembly', 'qc', 'wh-out']

/**
 * Длина корпуса зависит от числа мест: кузова на участке не должны перекрываться
 * (шаг места ≥ длины кузова). Сварка — 4 места, окраска — 6, сборка — 9, ОТК — 3.
 */
const WIDTHS: Record<SectionId, number> = {
  'wh-in': 3.2,
  welding: 3.6,
  painting: 4.8,
  assembly: 7.0,
  qc: 3.2,
  'wh-out': 3.6,
}

const CENTERS: number[] = (() => {
  const total = SECTION_ORDER.reduce((a, id) => a + WIDTHS[id], 0) + GAP * (SECTION_ORDER.length - 1)
  let x = -total / 2
  return SECTION_ORDER.map((id) => {
    const c = x + WIDTHS[id] / 2
    x += WIDTHS[id] + GAP
    return c
  })
})()

export const blockX = (i: number) => CENTERS[i]
export const blockW = (i: number) => WIDTHS[SECTION_ORDER[i]]
export const sectionX = (id: SectionId) => blockX(SECTION_ORDER.indexOf(id))
export const sectionW = (id: SectionId) => WIDTHS[id]

export const LINE_X0 = blockX(0) - blockW(0) / 2
export const LINE_X1 = blockX(5) + blockW(5) / 2
export const LINE_LENGTH = LINE_X1 - LINE_X0

export interface Pose {
  x: number
  z: number
  /** Поворот вокруг Y: 0 — вдоль линии, π/2 — поперёк (стоянка в буфере). */
  rot: number
}

/** Центр буферной площадки перед станцией и число рядов в ней. */
export function bufferZone(station: number) {
  const block = station + 1
  const x = blockX(block) - blockW(block) / 2 - GAP / 2
  const rows = Math.ceil(STATIONS[station].bufferCap / 2)
  return { x, rows, z0: 0.62, rowStep: 0.72 }
}

/** Положение кузова по коду loc/p из снимка симуляции. */
export function carPose(loc: number, p: number): Pose {
  if (loc === LOC_WH_OUT) {
    // Площадка готовой продукции: 3 ряда по 4 машины поперёк корпуса, лента посередине свободна.
    const col = p % 4
    const row = Math.floor(p / 4)
    return { x: blockX(5) - 1.2 + col * 0.8, z: [-2.3, -1.3, 1.4][row] ?? 2.4, rot: Math.PI / 2 }
  }
  if (loc < 0) return { x: blockX(0), z: 0, rot: 0 }
  const station = Math.floor(loc / 2)
  const block = station + 1
  if (loc % 2 === 1) {
    const left = blockX(block) - blockW(block) / 2 + MARGIN
    const right = blockX(block) + blockW(block) / 2 - MARGIN
    return { x: left + Math.min(1, Math.max(0, p)) * (right - left), z: 0, rot: 0 }
  }
  // Буфер: размеченная площадка в разрыве перед участком, ровные ряды по две машины.
  const zone = bufferZone(station)
  const q = Math.max(0, Math.round(p))
  const col = q % 2
  const row = Math.floor(q / 2)
  return { x: zone.x - 0.2 + col * 0.4, z: zone.z0 + row * zone.rowStep, rot: Math.PI / 2 }
}

/** Где стоит оборудование — для подсветки, подписей и наведения камеры. */
export const EQUIPMENT_POS: Record<string, [number, number, number]> = {
  'ABB-01': [blockX(1) - 0.85, 0, -1.0],
  'ABB-02': [blockX(1) + 0.85, 0, -1.0],
  'ABB-03': [blockX(1) - 0.85, 0, 1.0],
  'ABB-04': [blockX(1) + 0.85, 0, 1.0],
  'Камера-02': [blockX(2) - 1.0, 0, 0],
  'ПС-01': [blockX(2) + 1.3, 0, 0],
  'Конвейер-03': [blockX(3), 0, 0],
  'СЗ-01': [blockX(3) + 1.2, 0, -1.4],
  'СГ-01': [blockX(4) - 0.6, 0, 0],
  'КЛ-01': [blockX(4) + 0.75, 0, 0],
}
