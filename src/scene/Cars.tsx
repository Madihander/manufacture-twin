import { useLayoutEffect, useMemo, useRef } from 'react'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { Color, type InstancedMesh, type Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import type { CarModelId } from '@/data/plant'
import { displayCar, SNAPSHOT_STEP } from '@/sim/model'
import { useSim } from '@/store/sim'
import { BELT_Y, CAR_L, CAR_Y, carPose } from './layout'
import { MODEL, useCarMeshes } from './models'
import { framePoses } from './poses'
import { BODY_COLOR, C, RAW_BODY } from './palette'

const MAX = 120
const tmp = new Object3D()
const col = new Color()

/** Модель Kenney для каждой модели авто: Cobalt — седан, Onix — хэтчбек, JAC J7 — лифтбек. */
const CAR_URL: Record<CarModelId, string> = { cobalt: MODEL.sedan, onix: MODEL.hatchback, j7: MODEL.sedanSports }
/** Длина моделей Kenney по оси Z, ед. — приводим к длине кузова в сцене. */
const CAR_LENGTH: Record<CarModelId, number> = { cobalt: 2.54, onix: 2.86, j7: 2.6 }

/** Позиция кузова по id на момент t (интерполяция между снимками). Нужна и камере для слежения. */
export function carWorldPosition(id: number, t: number, out: Vector3): boolean {
  const { run } = useSim.getState()
  const i = Math.min(run.snapshots.length - 1, Math.floor(t / SNAPSHOT_STEP))
  const a = run.snapshots[i]
  const b = run.snapshots[Math.min(run.snapshots.length - 1, i + 1)]
  const ka = a.carIds.indexOf(id)
  if (ka < 0) return false
  const pa = carPose(a.carLoc[ka], a.carP[ka])
  const kb = b.carIds.indexOf(id)
  const pb = kb >= 0 ? carPose(b.carLoc[kb], b.carP[kb]) : pa
  const f = (t - a.t) / SNAPSHOT_STEP
  out.set(pa.x + (pb.x - pa.x) * f, CAR_Y, pa.z + (pb.z - pa.z) * f)
  return true
}

export function Cars() {
  const visible = useSim((s) => s.layers.cars)
  const ring = useRef<Mesh>(null)
  useFrame(() => {
    const { selection, t } = useSim.getState()
    if (!ring.current) return
    if (selection?.kind === 'car' && carWorldPosition(selection.id, t, ring.current.position)) {
      ring.current.visible = true
      ring.current.position.y = BELT_Y + 0.02
    } else ring.current.visible = false
  })
  return (
    <group visible={visible}>
      <CarModelInstances model="cobalt" />
      <CarModelInstances model="onix" />
      <CarModelInstances model="j7" />
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.42, 0.52, 40]} />
        <meshBasicMaterial color={C.brand} transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  )
}

/**
 * Все кузова одной модели: окрашенные (текстура Kenney + цвет кузова), «сырые» до окраски
 * (однотонный металл без текстуры) и колёса.
 */
function CarModelInstances({ model }: { model: CarModelId }) {
  const { body, wheels, material } = useCarMeshes(CAR_URL[model])
  const paintedRef = useRef<InstancedMesh>(null)
  const rawRef = useRef<InstancedMesh>(null)
  const wheelRef = useRef<InstancedMesh>(null)
  // Для клика: индекс экземпляра → id кузова, отдельно для окрашенных и «сырых».
  const ids = useRef<{ painted: number[]; raw: number[] }>({ painted: [], raw: [] })
  const scale = CAR_L / CAR_LENGTH[model]
  // Окрашенный кузов: та же палитра, краска в ней почти белая — цвет задаёт instanceColor.
  const paintedMaterial = useMemo(() => {
    const m = (material as MeshStandardMaterial).clone()
    m.roughness = 0.45
    m.metalness = 0.15
    return m
  }, [material])
  // До окраски — голый металл без деталей и цвета.
  const rawMaterial = useMemo(() => new MeshStandardMaterial({ color: RAW_BODY, roughness: 0.55, metalness: 0.35 }), [])

  // instanceColor должен существовать до первой компиляции шейдера, иначе тонировка не появится.
  useLayoutEffect(() => {
    for (const mesh of [paintedRef.current, rawRef.current]) {
      if (!mesh) continue
      for (let k = 0; k < MAX; k++) mesh.setColorAt(k, col.set('#ffffff'))
    }
    paintedMaterial.needsUpdate = true
    rawMaterial.needsUpdate = true
  }, [paintedMaterial, rawMaterial])

  useFrame(() => {
    const p = paintedRef.current
    const r = rawRef.current
    const w = wheelRef.current
    if (!p || !r || !w) return
    const { run, t, modelFilter } = useSim.getState()
    const frame = framePoses(run, t)
    let np = 0
    let nr = 0
    let nw = 0
    for (const c of frame) {
      if (nw >= MAX) break
      // При фильтре по модели вся линия показывается выбранной моделью в её двух расцветках.
      const shown = displayCar(run.cars.get(c.id)!, modelFilter)
      if (shown.model !== model) continue
      // Модель Kenney смотрит вдоль +Z; поворачиваем носом по ходу линии (+X).
      tmp.position.set(c.x, c.y, c.z)
      tmp.rotation.set(0, c.rot + Math.PI / 2, 0)
      tmp.scale.setScalar(scale)
      tmp.updateMatrix()
      w.setMatrixAt(nw++, tmp.matrix)
      if (c.painted) {
        col.set(BODY_COLOR[shown.color])
        p.setMatrixAt(np, tmp.matrix)
        p.setColorAt(np, col)
        ids.current.painted[np++] = c.id
      } else {
        col.set('#ffffff')
        r.setMatrixAt(nr, tmp.matrix)
        r.setColorAt(nr, col)
        ids.current.raw[nr++] = c.id
      }
    }
    ids.current.painted.length = np
    ids.current.raw.length = nr
    p.count = np
    r.count = nr
    w.count = nw
    for (const m of [p, r, w]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      // Кузова двигаются — сбрасываем ограничивающую сферу, иначе клики перестанут попадать.
      m.boundingSphere = null
    }
  })

  const clickHandler = (kind: 'painted' | 'raw') => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    const id = ids.current[kind][e.instanceId]
    if (id !== undefined) useSim.getState().select({ kind: 'car', id })
  }
  const hover = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => (document.body.style.cursor = ''),
  }

  return (
    <>
      <instancedMesh ref={paintedRef} args={[body, paintedMaterial, MAX]} castShadow receiveShadow frustumCulled={false} onClick={clickHandler('painted')} {...hover} />
      <instancedMesh ref={rawRef} args={[body, rawMaterial, MAX]} castShadow receiveShadow frustumCulled={false} onClick={clickHandler('raw')} {...hover} />
      <instancedMesh ref={wheelRef} args={[wheels, material, MAX]} castShadow frustumCulled={false} />
    </>
  )
}
