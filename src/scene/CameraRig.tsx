import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type OrthographicCamera, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { EQUIPMENT_BY_ID } from '@/data/plant'
import { useSim } from '@/store/sim'
import { carWorldPosition } from './Cars'
import { EQUIPMENT_POS, sectionX } from './layout'

/** Изометрия: камера смотрит с (+X, +Y, +Z). Вращение — только в небольшом секторе вокруг этого ракурса. */
const AZIMUTH = Math.PI / 4
const POLAR = Math.acos(1 / Math.sqrt(3))

/** Центр общего вида: чуть «выше» по экрану, чтобы цех не залезал под заголовок слева сверху. */
const FIT_TARGET = new Vector3(-1.2, 0, -1.2)

/** Масштаб, при котором весь цех помещается в окно. */
function fitZoom(width: number, height: number) {
  return Math.min(width / 30, height / 23)
}

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const goal = useRef<{ target: Vector3; zoom: number } | null>(null)
  const follow = useRef(false)
  const tmp = useRef(new Vector3())
  const command = useSim((s) => s.camera)

  // Стартовый вид — весь цех.
  useEffect(() => {
    const cam = camera as OrthographicCamera
    cam.zoom = fitZoom(size.width, size.height)
    cam.position.add(FIT_TARGET)
    cam.updateProjectionMatrix()
    controls.current?.target.copy(FIT_TARGET)
    controls.current?.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!command) return
    const cam = camera as OrthographicCamera
    const base = fitZoom(size.width, size.height)
    const { selection } = useSim.getState()
    follow.current = false
    if (command.type === 'fit') {
      goal.current = { target: FIT_TARGET.clone(), zoom: base }
    } else if (command.type === 'zoom') {
      goal.current = { target: controls.current?.target.clone() ?? new Vector3(), zoom: Math.min(base * 6, Math.max(base * 0.6, cam.zoom * command.factor)) }
    } else if (selection?.kind === 'section') {
      goal.current = { target: new Vector3(sectionX(selection.id), 0.5, 0), zoom: base * 2.3 }
    } else if (selection?.kind === 'equipment') {
      const p = EQUIPMENT_POS[selection.id] ?? [sectionX(EQUIPMENT_BY_ID[selection.id].section), 0, 0]
      goal.current = { target: new Vector3(p[0], 0.5, p[2]), zoom: base * 3.6 }
    } else if (selection?.kind === 'car') {
      follow.current = true
      goal.current = { target: new Vector3(), zoom: base * 3 }
    }
  }, [command, camera, size.width, size.height])

  useFrame(() => {
    const c = controls.current
    const g = goal.current
    if (!c || !g) return
    const cam = camera as OrthographicCamera
    if (follow.current) {
      const { selection, t } = useSim.getState()
      if (selection?.kind !== 'car' || !carWorldPosition(selection.id, t, tmp.current)) {
        follow.current = false
      } else {
        g.target.copy(tmp.current)
      }
    }
    const k = 0.12
    const delta = tmp.current.copy(g.target).sub(c.target).multiplyScalar(k)
    c.target.add(delta)
    cam.position.add(delta)
    cam.zoom += (g.zoom - cam.zoom) * k
    cam.updateProjectionMatrix()
    c.update()
    if (!follow.current && delta.lengthSq() < 1e-6 && Math.abs(g.zoom - cam.zoom) < 0.05) goal.current = null
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate
      enablePan
      enableZoom
      screenSpacePanning
      enableDamping
      dampingFactor={0.12}
      minAzimuthAngle={AZIMUTH - 0.55}
      maxAzimuthAngle={AZIMUTH + 0.55}
      minPolarAngle={POLAR - 0.3}
      maxPolarAngle={POLAR + 0.22}
      minZoom={8}
      maxZoom={220}
      onStart={() => {
        // Пользователь взял управление — прерываем автоперелёт, но не слежение за кузовом.
        if (!follow.current) goal.current = null
      }}
    />
  )
}
