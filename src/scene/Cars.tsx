import { useLayoutEffect, useMemo, useRef } from 'react'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { Color, type InstancedMesh, type Mesh, type MeshStandardMaterial, Object3D, Vector3 } from 'three'
import type { CarModelId } from '@/data/plant'
import { SNAPSHOT_STEP } from '@/sim/model'
import { useSim } from '@/store/sim'
import { BELT_Y, CAR_L, CAR_Y, carPose, type Pose } from './layout'
import { MODEL, useCarMeshes } from './models'
import { BODY_COLOR, C, RAW_BODY } from './palette'

const MAX = 120
const tmp = new Object3D()
const col = new Color()
const fade = new Color(C.ground)

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

/** Все кузова одной модели — два InstancedMesh (кузов с тонировкой и колёса). */
function CarModelInstances({ model }: { model: CarModelId }) {
  const { body, wheels, material } = useCarMeshes(CAR_URL[model])
  const bodyRef = useRef<InstancedMesh>(null)
  const wheelRef = useRef<InstancedMesh>(null)
  const ids = useRef<number[]>([])
  const scale = CAR_L / CAR_LENGTH[model]
  // Кузов: та же палитра, краска в ней почти белая — цвет задаёт instanceColor.
  const bodyMaterial = useMemo(() => {
    const m = (material as MeshStandardMaterial).clone()
    m.roughness = 0.45
    m.metalness = 0.15
    return m
  }, [material])

  // instanceColor должен существовать до первой компиляции шейдера, иначе тонировка не появится.
  useLayoutEffect(() => {
    const b = bodyRef.current
    if (!b) return
    for (let k = 0; k < MAX; k++) b.setColorAt(k, col.set('#ffffff'))
    bodyMaterial.needsUpdate = true
  }, [bodyMaterial])

  useFrame(() => {
    const b = bodyRef.current
    const w = wheelRef.current
    if (!b || !w) return
    const { run, t, modelFilter } = useSim.getState()
    const i = Math.min(run.snapshots.length - 1, Math.floor(t / SNAPSHOT_STEP))
    const sa = run.snapshots[i]
    const sb = run.snapshots[Math.min(run.snapshots.length - 1, i + 1)]
    const f = Math.min(1, (t - sa.t) / SNAPSHOT_STEP)
    const next = new Map<number, Pose>()
    for (let k = 0; k < sb.carIds.length; k++) next.set(sb.carIds[k], carPose(sb.carLoc[k], sb.carP[k]))

    let n = 0
    for (let k = 0; k < sa.carIds.length && n < MAX; k++) {
      const id = sa.carIds[k]
      const info = run.cars.get(id)!
      if (info.model !== model) continue
      const pa = carPose(sa.carLoc[k], sa.carP[k])
      const pb = next.get(id) ?? pa
      // Переход буфер ↔ станция не интерполируем по диагонали — переставляем в середине шага.
      const jump = Math.abs(pb.rot - pa.rot) > 0.1
      const x = jump ? (f < 0.5 ? pa.x : pb.x) : pa.x + (pb.x - pa.x) * f
      const z = jump ? (f < 0.5 ? pa.z : pb.z) : pa.z + (pb.z - pa.z) * f
      const rot = jump ? (f < 0.5 ? pa.rot : pb.rot) : pa.rot
      ids.current[n] = id

      // Модель Kenney смотрит вдоль +Z; поворачиваем носом по ходу линии (+X).
      tmp.position.set(x, BELT_Y, z)
      tmp.rotation.set(0, rot + Math.PI / 2, 0)
      tmp.scale.setScalar(scale)
      tmp.updateMatrix()
      b.setMatrixAt(n, tmp.matrix)
      w.setMatrixAt(n, tmp.matrix)

      // До выхода из окраски кузов «сырой», после — в цвете.
      const painted = sa.carLoc[k] >= 4 || (sa.carLoc[k] === 3 && sa.carP[k] > 0.6)
      col.set(painted ? BODY_COLOR[info.color] : RAW_BODY)
      if (modelFilter !== 'all' && info.model !== modelFilter) col.lerp(fade, 0.75)
      b.setColorAt(n, col)
      n++
    }
    ids.current.length = n
    b.count = n
    w.count = n
    b.instanceMatrix.needsUpdate = true
    w.instanceMatrix.needsUpdate = true
    if (b.instanceColor) b.instanceColor.needsUpdate = true
    // Кузова двигаются — сбрасываем ограничивающую сферу, иначе клики перестанут попадать.
    b.boundingSphere = null
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    const id = ids.current[e.instanceId]
    if (id !== undefined) useSim.getState().select({ kind: 'car', id })
  }

  return (
    <>
      <instancedMesh
        ref={bodyRef}
        args={[body, bodyMaterial, MAX]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      <instancedMesh ref={wheelRef} args={[wheels, material, MAX]} castShadow frustumCulled={false} />
    </>
  )
}
