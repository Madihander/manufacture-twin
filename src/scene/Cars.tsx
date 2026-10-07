import { useMemo, useRef } from 'react'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { Color, type InstancedMesh, type Mesh, Object3D, Vector3 } from 'three'
import { SNAPSHOT_STEP } from '@/sim/model'
import { useSim } from '@/store/sim'
import { CAR_L, CAR_W, CAR_Y, carPose, type Pose } from './layout'
import { BODY_COLOR, C, RAW_BODY } from './palette'

const MAX = 160
const tmp = new Object3D()
const col = new Color()
const fade = new Color(C.ground)

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
  const body = useRef<InstancedMesh>(null)
  const roof = useRef<InstancedMesh>(null)
  const ring = useRef<Mesh>(null)
  const ids = useRef<number[]>([])
  const visible = useSim((s) => s.layers.cars)
  const pos = useMemo(() => new Vector3(), [])

  useFrame(() => {
    if (!body.current || !roof.current) return
    const { run, t, modelFilter, selection } = useSim.getState()
    const i = Math.min(run.snapshots.length - 1, Math.floor(t / SNAPSHOT_STEP))
    const a = run.snapshots[i]
    const b = run.snapshots[Math.min(run.snapshots.length - 1, i + 1)]
    const f = Math.min(1, (t - a.t) / SNAPSHOT_STEP)
    const next = new Map<number, Pose>()
    for (let k = 0; k < b.carIds.length; k++) next.set(b.carIds[k], carPose(b.carLoc[k], b.carP[k]))

    const n = Math.min(MAX, a.carIds.length)
    ids.current.length = n
    for (let k = 0; k < n; k++) {
      const id = a.carIds[k]
      const pa = carPose(a.carLoc[k], a.carP[k])
      const pb = next.get(id) ?? pa
      // Переход между участками (буфер ↔ станция) не интерполируем по диагонали — сразу ставим.
      const jump = Math.abs(pb.rot - pa.rot) > 0.1
      const x = jump ? (f < 0.5 ? pa.x : pb.x) : pa.x + (pb.x - pa.x) * f
      const z = jump ? (f < 0.5 ? pa.z : pb.z) : pa.z + (pb.z - pa.z) * f
      const rot = jump ? (f < 0.5 ? pa.rot : pb.rot) : pa.rot
      ids.current[k] = id

      tmp.position.set(x, CAR_Y, z)
      tmp.rotation.set(0, rot, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      body.current.setMatrixAt(k, tmp.matrix)
      tmp.position.y = CAR_Y + 0.12
      tmp.updateMatrix()
      roof.current.setMatrixAt(k, tmp.matrix)

      const info = run.cars.get(id)!
      // До выхода из окраски кузов «сырой», после — в цвете.
      const painted = a.carLoc[k] >= 4 || (a.carLoc[k] === 3 && a.carP[k] > 0.6)
      col.set(painted ? BODY_COLOR[info.color] : RAW_BODY)
      if (modelFilter !== 'all' && info.model !== modelFilter) col.lerp(fade, 0.75)
      body.current.setColorAt(k, col)
      roof.current.setColorAt(k, col.clone().multiplyScalar(0.82))

      if (selection?.kind === 'car' && selection.id === id && ring.current) {
        ring.current.visible = true
        ring.current.position.set(x, 0.14, z)
      }
    }
    if (selection?.kind !== 'car' && ring.current) ring.current.visible = false
    if (selection?.kind === 'car' && ring.current && !carWorldPosition(selection.id, t, pos)) ring.current.visible = false

    body.current.count = n
    roof.current.count = n
    // Кузова двигаются — сбрасываем ограничивающую сферу, иначе клики перестанут попадать.
    body.current.boundingSphere = null
    body.current.instanceMatrix.needsUpdate = true
    roof.current.instanceMatrix.needsUpdate = true
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
    if (roof.current.instanceColor) roof.current.instanceColor.needsUpdate = true
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    const id = ids.current[e.instanceId]
    if (id !== undefined) useSim.getState().select({ kind: 'car', id })
  }

  return (
    <group visible={visible}>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, MAX]}
        castShadow
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[CAR_L, 0.13, CAR_W]} />
        <meshStandardMaterial roughness={0.45} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, MAX]} castShadow frustumCulled={false}>
        <boxGeometry args={[CAR_L * 0.5, 0.11, CAR_W * 0.86]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.42, 0.52, 40]} />
        <meshBasicMaterial color={C.brand} transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  )
}
