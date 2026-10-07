// Модели Kenney (CC0), перекрашенные под дизайн-систему скриптом scripts/prepare-models.py.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { type ThreeElements, useFrame } from '@react-three/fiber'
import type { BufferGeometry, Group, Material, Mesh, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHIFT_START_SEC } from '@/sim/model'
import { isDown } from '@/sim/telemetry'
import { useSim } from '@/store/sim'

export const MODEL = {
  robot: '/models/factory/robot-arm-a.glb',
  machine: '/models/factory/machine.glb',
  machineWindow: '/models/factory/machine-window.glb',
  machineFortified: '/models/factory/machine-fortified.glb',
  scanner: '/models/factory/scanner-high.glb',
  conveyor: '/models/factory/conveyor-long.glb',
  crane: '/models/factory/crane.glb',
  screen: '/models/factory/screen-hanging-wide.glb',
  warning: '/models/factory/warning-traffic.glb',
  boxLarge: '/models/crates/box-large.glb',
  boxSmall: '/models/crates/box-small.glb',
  boxWide: '/models/crates/box-wide.glb',
  sedan: '/models/cars/sedan.glb',
  hatchback: '/models/cars/hatchback-sports.glb',
  sedanSports: '/models/cars/sedan-sports.glb',
} as const

Object.values(MODEL).forEach((url) => useGLTF.preload(url))

function withShadows(root: Object3D) {
  root.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  return root
}

/** Статичная модель: клон сцены GLB с тенями. */
export function Model({ url, ...props }: { url: string } & ThreeElements['group']) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => withShadows(scene.clone(true)), [scene])
  return (
    <group {...props}>
      <primitive object={obj} />
    </group>
  )
}

/**
 * Робот-манипулятор Kenney: цепочка звеньев element-a…f. Пока участок работает, робот «варит»:
 * поворачивается основание и сгибаются плечо и локоть. При остановке — замирает в сложенной позе.
 */
export function Robot({ equipmentId: id, ...props }: { equipmentId: string } & Omit<ThreeElements['group'], 'id'>) {
  const { scene } = useGLTF(MODEL.robot)
  const obj = useMemo(() => withShadows(scene.clone(true)), [scene])
  const joints = useMemo(
    () => Object.fromEntries(['element-a', 'element-b', 'element-d', 'element-f'].map((n) => [n, obj.getObjectByName(n)])) as Record<string, Object3D | undefined>,
    [obj],
  )
  const phase = (id.charCodeAt(id.length - 1) % 4) * 1.3
  useFrame(() => {
    const t = useSim.getState().t
    const down = isDown(id, SHIFT_START_SEC + t)
    const j = joints
    const s1 = down ? 0 : Math.sin(t * 0.09 + phase)
    const s2 = down ? 0 : Math.sin(t * 0.13 + phase * 1.7)
    if (j['element-a']) j['element-a'].rotation.y = s1 * 0.9
    if (j['element-b']) j['element-b'].rotation.x = down ? 0.15 : 0.45 + s2 * 0.25
    if (j['element-d']) j['element-d'].rotation.x = down ? 1.2 : 0.8 + s1 * 0.3
    if (j['element-f']) j['element-f'].rotation.x = down ? 0.3 : 0.5 + s2 * 0.2
  })
  return (
    <group {...props}>
      <primitive object={obj} />
    </group>
  )
}

export interface CarMeshes {
  body: BufferGeometry
  wheels: BufferGeometry
  material: Material
}

/** Геометрия машины одной сеткой: кузов отдельно (его тонируем), колёса — отдельно. */
export function useCarMeshes(url: string): CarMeshes {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const bodies: BufferGeometry[] = []
    const wheels: BufferGeometry[] = []
    let material: Material | null = null
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld)
      material ??= m.material as Material
      if (o.name.startsWith('wheel')) wheels.push(g)
      else bodies.push(g)
    })
    return { body: mergeGeometries(bodies)!, wheels: mergeGeometries(wheels)!, material: material! }
  }, [scene])
}

/** Ссылка на группу — для подсветки выбранного. */
export type GroupRef = React.RefObject<Group | null>
