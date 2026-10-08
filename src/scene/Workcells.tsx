// Лёгкая анимация постов сборки и ОТК: гайковёрты над кузовами, подъёмники колёс, лампы-андоны,
// свет сканера ОТК, проходящий по кузову. Несколько простых мешей, всё двигается в useFrame.
// Работают, только когда станция действительно работает в симуляции: при остановке замирают, лампы красные.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group, type Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { useSim } from '@/store/sim'
import { BELT_Y, CAR_L, CAR_W, sectionX } from './layout'
import { C } from './palette'
import { type Activity, framePoses, stationActivity } from './poses'

const LOC_ASSEMBLY = 5
const LOC_QC = 7
const STATION_ASSEMBLY = 2
const STATION_QC = 3

/** Верх кузова над лентой, ед. */
const CAR_TOP = BELT_Y + 0.33
const ARM_Y = 1.0
const POST_Z = 0.62

const LAMP: Record<Activity, string> = { work: C.ok, idle: C.warn, down: C.alarm }

/** Декоративные меши не перехватывают клики — выбор кузовов и оборудования работает как раньше. */
const noRaycast = () => null

/** Материал лампы-андона: цвет по состоянию станции, авария — мигает. */
function useLampMaterial() {
  return useMemo(() => new MeshStandardMaterial({ color: C.ok, emissive: C.ok, emissiveIntensity: 0.8, roughness: 0.3 }), [])
}

function updateLamp(mat: MeshStandardMaterial, state: Activity, time: number, blinkOn = true) {
  mat.color.set(LAMP[state])
  mat.emissive.set(LAMP[state])
  const blink = state === 'down' ? (Math.sin(time * 9) > 0 ? 1.6 : 0.1) : state === 'work' && blinkOn ? 0.7 + 0.3 * Math.sin(time * 3) : 0.5
  mat.emissiveIntensity = blink
}

/** Собственное время анимации: идёт, пока симуляция проигрывается, и не зависит от скорости перемотки. */
function useAnimClock() {
  const t = useRef(0)
  useFrame((_, delta) => {
    if (useSim.getState().playing) t.current += Math.min(delta, 0.1)
  })
  return t
}

// — Сборка —

/** Посты затяжки по длине участка (x относительно центра корпуса). */
const POSTS = [-2.55, -0.85, 0.85, 2.55]
/** Подъёмники колёс за лентой. */
const LIFTS = [-1.7, 0, 1.7]

/** Всё в координатах корпуса «Сборка» — компонент ставится внутрь его группы. */
export function AssemblyRig() {
  const lamp = useLampMaterial()
  const clock = useAnimClock()
  const tools = useRef<(Group | null)[]>([])
  const lifts = useRef<(Group | null)[]>([])
  const blockX = sectionX('assembly')

  useFrame(() => {
    const { run, t } = useSim.getState()
    const state = stationActivity(run, t, STATION_ASSEMBLY)
    const time = clock.current
    updateLamp(lamp, state, time)
    const cars = framePoses(run, t).filter((c) => c.loc === LOC_ASSEMBLY)

    POSTS.forEach((px, i) => {
      const g = tools.current[i]
      if (!g) return
      // Гайковёрт работает, если под постом стоит кузов и линия идёт.
      const car = cars.some((c) => Math.abs(c.x - blockX - px) < CAR_L * 0.45)
      const active = state === 'work' && car
      const head = g.children[1] as Mesh | undefined
      // Цикл затяжки ≈ 2,4 с: опускается, крутится у кузова, поднимается.
      const ph = (time / 2.4 + i * 0.27) % 1
      const down = active ? (ph < 0.25 ? ph / 0.25 : ph < 0.7 ? 1 : 1 - (ph - 0.7) / 0.3) : 0
      g.position.y = ARM_Y - 0.12 - down * (ARM_Y - 0.12 - CAR_TOP - 0.1)
      if (head && active && ph >= 0.25 && ph < 0.7) head.rotation.y += 0.6
    })

    LIFTS.forEach((_, i) => {
      const g = lifts.current[i]
      if (!g) return
      // Подъём колеса к кузову и возврат пустым; при остановке — внизу.
      const ph = (time / 5 + i * 0.33) % 1
      const h = state === 'work' ? (ph < 0.35 ? ph / 0.35 : ph < 0.5 ? 1 : ph < 0.85 ? 1 - (ph - 0.5) / 0.35 : 0) : 0
      const lift = 0.04 + h * 0.2
      const table = g.children[0]
      const wheel = g.children[1]
      const [a, b] = [g.children[2], g.children[3]]
      table.position.y = 0.12 + lift
      wheel.position.y = 0.12 + lift + 0.06
      wheel.visible = state !== 'work' || ph < 0.42 || ph > 0.9
      // Ножницы: длина плеча постоянна, угол — по высоте стола.
      const ang = Math.asin(Math.min(0.98, lift / 0.26))
      a.position.y = b.position.y = 0.12 + lift / 2
      a.rotation.z = ang
      b.rotation.z = -ang
    })
  })

  return (
    <group>
      {POSTS.map((px, i) => (
        <group key={px} position={[px, 0, 0]}>
          {/* Стойка, консоль над лентой, лампа-андон. */}
          <mesh position={[0, ARM_Y / 2 + 0.06, POST_Z]} castShadow raycast={noRaycast}>
            <boxGeometry args={[0.07, ARM_Y + 0.12, 0.07]} />
            <meshStandardMaterial color={C.steelDark} roughness={0.6} />
          </mesh>
          <mesh position={[0, ARM_Y + 0.08, POST_Z / 2]} castShadow raycast={noRaycast}>
            <boxGeometry args={[0.06, 0.06, POST_Z + 0.08]} />
            <meshStandardMaterial color={C.warn} roughness={0.55} />
          </mesh>
          <mesh position={[0, ARM_Y + 0.18, POST_Z]} material={lamp} raycast={noRaycast}>
            <cylinderGeometry args={[0.045, 0.045, 0.1, 12]} />
          </mesh>
          {/* Гайковёрт на тросе: корпус и вращающаяся головка. */}
          <group ref={(g) => void (tools.current[i] = g)} position={[0, ARM_Y - 0.12, 0]}>
            <mesh castShadow raycast={noRaycast}>
              <cylinderGeometry args={[0.05, 0.05, 0.2, 12]} />
              <meshStandardMaterial color={C.navy} roughness={0.5} />
            </mesh>
            <mesh position-y={-0.125} raycast={noRaycast}>
              <boxGeometry args={[0.045, 0.06, 0.045]} />
              <meshStandardMaterial color={C.steel} metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
          <Cable post={i} tools={tools} />
        </group>
      ))}
      {LIFTS.map((lx, i) => (
        <group key={lx} ref={(g) => void (lifts.current[i] = g)} position={[lx, 0, -0.56]}>
          <mesh castShadow raycast={noRaycast}>
            <boxGeometry args={[0.32, 0.03, 0.22]} />
            <meshStandardMaterial color={C.warn} roughness={0.6} />
          </mesh>
          <mesh rotation-x={Math.PI / 2} castShadow raycast={noRaycast}>
            <cylinderGeometry args={[0.085, 0.085, 0.06, 16]} />
            <meshStandardMaterial color="#2b3440" roughness={0.8} />
          </mesh>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[0.28, 0.018, 0.02]} />
            <meshStandardMaterial color={C.steelDark} />
          </mesh>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[0.28, 0.018, 0.02]} />
            <meshStandardMaterial color={C.steelDark} />
          </mesh>
          <mesh position-y={0.135} raycast={noRaycast}>
            <boxGeometry args={[0.34, 0.03, 0.24]} />
            <meshStandardMaterial color={C.steelDark} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Трос от консоли до гайковёрта — тянется за ним по высоте. */
function Cable({ post, tools }: { post: number; tools: React.RefObject<(Group | null)[]> }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const tool = tools.current[post]
    const m = ref.current
    if (!tool || !m) return
    const top = ARM_Y + 0.05
    const len = Math.max(0.01, top - (tool.position.y + 0.08))
    m.scale.y = len
    m.position.y = top - len / 2
  })
  return (
    <mesh ref={ref} raycast={noRaycast}>
      <cylinderGeometry args={[0.008, 0.008, 1, 6]} />
      <meshStandardMaterial color="#2b3440" />
    </mesh>
  )
}

// — ОТК —

const QC_MAX = 3

/** Светящаяся рамка сканера проходит вдоль каждого кузова на ОТК; лампы сканеров мигают при проверке. */
export function QcScanner() {
  const clock = useAnimClock()
  const gates = useRef<(Group | null)[]>([])
  const lamp = useLampMaterial()
  const beamMat = useMemo(() => new MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.38, depthWrite: false }), [])
  const blockX = sectionX('qc')

  useFrame(() => {
    const { run, t } = useSim.getState()
    const state = stationActivity(run, t, STATION_QC)
    const time = clock.current
    updateLamp(lamp, state, time)
    // Свет скана «дышит», чтобы читался даже на светлом полу.
    beamMat.opacity = 0.3 + 0.15 * Math.sin(time * 6)
    const cars = framePoses(run, t).filter((c) => c.loc === LOC_QC)
    for (let k = 0; k < QC_MAX; k++) {
      const g = gates.current[k]
      if (!g) continue
      const car = cars[k]
      g.visible = !!car && state !== 'down'
      if (!car) continue
      // Проход от носа к корме и обратно, у каждого кузова — своя фаза.
      const s = Math.sin(time * 1.6 + car.id * 1.7)
      g.position.set(car.x - blockX + s * CAR_L * 0.42, 0, car.z)
    }
  })

  const h = CAR_TOP - BELT_Y + 0.12
  const half = CAR_W / 2 + 0.07
  return (
    <group>
      {Array.from({ length: QC_MAX }, (_, k) => (
        <group key={k} ref={(g) => void (gates.current[k] = g)} visible={false}>
          {/* Световая плоскость поперёк кузова и рамка с излучателем. */}
          <mesh position={[0, BELT_Y + h / 2, 0]} rotation-y={Math.PI / 2} material={beamMat} raycast={noRaycast}>
            <planeGeometry args={[half * 2, h]} />
          </mesh>
          <mesh position={[0, BELT_Y + h + 0.02, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.05, 0.035, half * 2 + 0.06]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.9} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, BELT_Y + (h + 0.02) / 2, side * (half + 0.03)]} raycast={noRaycast}>
              <boxGeometry args={[0.03, h + 0.04, 0.03]} />
              <meshStandardMaterial color={C.steelDark} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Лампы-андоны на сканерах СГ-01 и КЛ-01. */}
      {[-0.6, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.98, -0.5]} material={lamp} raycast={noRaycast}>
          <sphereGeometry args={[0.05, 12, 10]} />
        </mesh>
      ))}
    </group>
  )
}
