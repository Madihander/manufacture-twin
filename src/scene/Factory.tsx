import { useMemo, useRef, type ReactNode } from 'react'
import { Edges } from '@react-three/drei'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { EdgesGeometry, PlaneGeometry } from 'three'
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { focusObject } from '@/components/twin/focus'
import { EQUIPMENT_BY_ID, type SectionId } from '@/data/plant'
import { SHIFT_START_SEC } from '@/sim/model'
import type { Status } from '@/sim/metrics'
import { isDown } from '@/sim/telemetry'
import { useTwin } from '@/sim/useTwin'
import { type HeatMode, useSim } from '@/store/sim'
import { BELT_Y, BLOCK_D, blockW, blockX, bufferZone, CAR_L, EQUIPMENT_POS, LINE_X0, LINE_X1, SECTION_ORDER, sectionW, SLAB_H, WALL_H } from './layout'
import { STATIONS } from '@/sim/model'
import { C } from './palette'

const STATUS_SOFT: Record<Status, string> = { ok: C.okSoft, warn: C.warnSoft, alarm: C.alarmSoft }

function heatStatus(heat: HeatMode, id: SectionId, twin: ReturnType<typeof useTwin>): Status | null {
  const k = twin.sectionById[id]
  if (heat === 'off') return null
  if (heat === 'risk') {
    const p = twin.predictions.filter((x) => x.section === id && x.kind !== 'plan')
    return p.some((x) => x.level === 'crit') ? 'alarm' : p.length ? 'warn' : 'ok'
  }
  if (Number.isNaN(k.oee)) return null
  if (heat === 'oee') return k.oee * 100 >= twin.thresholds.oeeMin ? 'ok' : k.oee * 100 >= twin.thresholds.oeeMin - 10 ? 'warn' : 'alarm'
  return k.defectRate * 100 <= twin.thresholds.defectMax ? 'ok' : k.defectRate * 100 <= twin.thresholds.defectMax * 2 ? 'warn' : 'alarm'
}

export function Factory() {
  const twin = useTwin()
  const layers = useSim((s) => s.layers)
  const heat = useSim((s) => s.heat)
  const hover = useSim((s) => s.hoverSection)
  const selection = useSim((s) => s.selection)
  const selectedSection =
    selection?.kind === 'section' ? selection.id : selection?.kind === 'equipment' ? EQUIPMENT_BY_ID[selection.id]?.section : null

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color={C.ground} roughness={1} />
      </mesh>

      {layers.flow && (
        <group>
          <mesh position={[(LINE_X0 + LINE_X1) / 2, BELT_Y / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[LINE_X1 - LINE_X0, BELT_Y, 0.62]} />
            <meshStandardMaterial color={C.belt} roughness={0.9} />
          </mesh>
          <FlowArrows />
          {STATIONS.map((_, i) => (
            <BufferZone key={i} station={i} />
          ))}
        </group>
      )}

      {SECTION_ORDER.map((id, i) => {
        const k = twin.sectionById[id]
        const hs = heatStatus(heat, id, twin)
        return (
          <Block
            key={id}
            id={id}
            x={blockX(i)}
            w={blockW(i)}
            status={k.status}
            heat={hs}
            hovered={hover === id}
            selected={selectedSection === id}
          >
            {layers.equipment && <SectionEquipment id={id} kits={twin.snap.kits} />}
          </Block>
        )
      })}

      {selection?.kind === 'equipment' && EQUIPMENT_POS[selection.id] && <SelectionRing pos={EQUIPMENT_POS[selection.id]} />}
    </group>
  )
}

function Block({
  id,
  x,
  w,
  status,
  heat,
  hovered,
  selected,
  children,
}: {
  id: SectionId
  x: number
  w: number
  status: Status
  heat: Status | null
  hovered: boolean
  selected: boolean
  children?: ReactNode
}) {
  const setHover = useSim((s) => s.setHoverSection)
  const active = hovered || selected
  const alarm = status === 'alarm'
  const edge = active ? C.brand : alarm ? C.alarm : C.edge
  const slab = heat ? STATUS_SOFT[heat] : active ? C.slabHover : alarm ? C.slabAlarm : C.slab

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    setHover(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    focusObject({ section: id })
  }

  return (
    <group position={[x, 0, 0]}>
      <group onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <mesh position-y={SLAB_H / 2} receiveShadow>
          <boxGeometry args={[w, SLAB_H, BLOCK_D]} />
          <meshStandardMaterial color={slab} roughness={0.95} />
          <Edges color={edge} lineWidth={active || alarm ? 2 : 1} />
        </mesh>
        {/* Дальние стены плотнее, ближние почти прозрачные — внутренности видны. */}
        <Wall position={[0, WALL_H / 2, -BLOCK_D / 2]} size={[w, WALL_H, 0.04]} opacity={0.42} edge={edge} />
        <Wall position={[-w / 2, WALL_H / 2, 0]} size={[0.04, WALL_H, BLOCK_D]} opacity={0.42} edge={edge} />
        <Wall position={[0, WALL_H / 2, BLOCK_D / 2]} size={[w, WALL_H, 0.04]} opacity={0.1} edge={edge} />
        <Wall position={[w / 2, WALL_H / 2, 0]} size={[0.04, WALL_H, BLOCK_D]} opacity={0.1} edge={edge} />
      </group>
      {alarm && <AlarmPulse w={w} />}
      {children}
    </group>
  )
}

function Wall({ position, size, opacity, edge }: { position: [number, number, number]; size: [number, number, number]; opacity: number; edge: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={C.wall} transparent opacity={opacity} depthWrite={false} roughness={0.6} />
      <Edges color={edge} />
    </mesh>
  )
}

/** Пульсирующая красная рамка вокруг корпуса в аварии. */
function AlarmPulse({ w: blockWidth }: { w: number }) {
  const mat = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 5))
  })
  const w = blockWidth + 0.36
  const d = BLOCK_D + 0.36
  const t = 0.09
  const bars: [number, number, number, number][] = [
    [0, -d / 2, w, t],
    [0, d / 2, w, t],
    [-w / 2, 0, t, d],
    [w / 2, 0, t, d],
  ]
  return (
    <group position-y={0.015}>
      {bars.map(([x, z, bw, bd], i) => (
        <mesh key={i} position={[x, 0, z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[bw, bd]} />
          {i === 0 ? (
            <meshBasicMaterial ref={mat} color={C.alarm} transparent depthWrite={false} />
          ) : (
            <SharedAlarmMaterial source={mat} />
          )}
        </mesh>
      ))}
    </group>
  )
}

/** Остальные стороны рамки используют тот же материал, что и первая. */
function SharedAlarmMaterial({ source }: { source: React.RefObject<MeshBasicMaterial | null> }) {
  const ref = useRef<MeshBasicMaterial>(null)
  useFrame(() => {
    if (ref.current && source.current) ref.current.opacity = source.current.opacity
  })
  return <meshBasicMaterial ref={ref} color={C.alarm} transparent depthWrite={false} />
}

function SelectionRing({ pos }: { pos: [number, number, number] }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.08 * Math.sin(clock.elapsedTime * 4))
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[pos[0], SLAB_H + 0.015, pos[2]]}>
      <ringGeometry args={[0.55, 0.68, 40]} />
      <meshBasicMaterial color={C.brand} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

/** Размеченная площадка буфера перед участком: сюда встают кузова, если участок не успевает. */
function BufferZone({ station }: { station: number }) {
  const z = bufferZone(station)
  const depth = (z.rows - 1) * z.rowStep + CAR_L + 0.2
  const cz = z.z0 - CAR_L / 2 - 0.1 + depth / 2
  const outline = useMemo(() => new EdgesGeometry(new PlaneGeometry(0.92, depth)), [depth])
  return (
    <group position={[z.x, 0.006, cz]} rotation-x={-Math.PI / 2}>
      <mesh>
        <planeGeometry args={[0.92, depth]} />
        <meshBasicMaterial color={C.brandSoft} />
      </mesh>
      <lineSegments geometry={outline} onUpdate={(l) => l.computeLineDistances()}>
        <lineDashedMaterial color={C.brand} dashSize={0.08} gapSize={0.06} />
      </lineSegments>
    </group>
  )
}

/** Шевроны направления потока на ленте. */
function FlowArrows() {
  const group = useRef<Group>(null)
  const count = 28
  useFrame(() => {
    if (!group.current) return
    const t = useSim.getState().t
    const span = LINE_X1 - LINE_X0
    group.current.children.forEach((c, i) => {
      c.position.x = LINE_X0 + ((i / count) * span + t * 0.004) % span
    })
  })
  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[0, BELT_Y + 0.003, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.09, 3]} />
          <meshBasicMaterial color={C.rail} />
        </mesh>
      ))}
    </group>
  )
}

/** Обёртка оборудования: клик выбирает его, курсор-«рука». */
function Equip({ id, children }: { id: string; children: ReactNode }) {
  const pos = EQUIPMENT_POS[id]
  return (
    <group
      position={[pos[0] - blockXOf(id), 0, pos[2]]}
      onClick={(e) => {
        e.stopPropagation()
        focusObject({ equipmentId: id })
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {children}
    </group>
  )
}

function blockXOf(equipmentId: string): number {
  return blockX(SECTION_ORDER.indexOf(EQUIPMENT_BY_ID[equipmentId].section))
}

function SectionEquipment({ id, kits }: { id: SectionId; kits: number }) {
  switch (id) {
    case 'wh-in':
      return <Racks kits={kits} />
    case 'welding':
      return (
        <>
          {(['ABB-01', 'ABB-02', 'ABB-03', 'ABB-04'] as const).map((r) => (
            <Equip key={r} id={r}>
              <Robot id={r} flip={EQUIPMENT_POS[r][2] > 0} />
            </Equip>
          ))}
        </>
      )
    case 'painting':
      return (
        <>
          <Equip id="Камера-02">
            <Tunnel length={2.1} color="#dbeef8" />
          </Equip>
          <Equip id="ПС-01">
            <Tunnel length={1.7} color="#eef1f4" oven />
          </Equip>
        </>
      )
    case 'assembly':
      return (
        <>
          <Equip id="Конвейер-03">
            <mesh position-y={BELT_Y + 0.01} receiveShadow>
              <boxGeometry args={[sectionW('assembly') - 0.3, 0.04, 0.74]} />
              <meshStandardMaterial color={C.beltDark} roughness={0.8} />
            </mesh>
            {[-2.8, -2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1, 2.8].map((x) => (
              <mesh key={x} position={[x, 0.65, -0.55]} castShadow>
                <boxGeometry args={[0.06, 1.1, 0.06]} />
                <meshStandardMaterial color={C.steel} />
              </mesh>
            ))}
          </Equip>
          <Equip id="СЗ-01">
            <mesh position-y={0.4} castShadow>
              <boxGeometry args={[0.6, 0.65, 0.45]} />
              <meshStandardMaterial color={C.steel} />
            </mesh>
            <mesh position={[0, 0.78, 0]} castShadow>
              <boxGeometry args={[0.5, 0.08, 0.35]} />
              <meshStandardMaterial color={C.brand} />
            </mesh>
          </Equip>
        </>
      )
    case 'qc':
      return (
        <>
          <Equip id="СГ-01">
            <Arch />
          </Equip>
          <Equip id="КЛ-01">
            <Tunnel length={1.0} color="#f7f2df" light />
          </Equip>
        </>
      )
    default:
      return null
  }
}

function Racks({ kits }: { kits: number }) {
  const fill = Math.min(1, kits / 180)
  const cells: { x: number; z: number; h: number }[] = []
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c
      const h = idx / 12 < fill ? 0.35 + ((idx * 7) % 5) * 0.08 : 0.06
      cells.push({ x: -1.0 + c * 1.0, z: -2.4 + r * 1.2 + (r >= 2 ? 0.6 : 0), h })
    }
  return (
    <group>
      {cells.map((c, i) => (
        <mesh key={i} position={[c.x, SLAB_H + c.h / 2, c.z]} castShadow>
          <boxGeometry args={[0.75, c.h, 0.85]} />
          <meshStandardMaterial color={C.crate} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** Робот-манипулятор: основание, плечо, предплечье, сварочные клещи. Двигается, пока участок работает. */
function Robot({ id, flip }: { id: string; flip: boolean }) {
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const head = useRef<Mesh>(null)
  const phase = (id.charCodeAt(id.length - 1) % 4) * 1.3
  useFrame(() => {
    const t = useSim.getState().t
    const down = isDown(id, SHIFT_START_SEC + t)
    const a = down ? 0 : Math.sin(t * 0.09 + phase)
    if (shoulder.current) shoulder.current.rotation.y = (flip ? Math.PI : 0) + a * 0.6
    if (elbow.current) elbow.current.rotation.z = -0.9 + (down ? 0.6 : Math.sin(t * 0.13 + phase) * 0.35)
    if (head.current) (head.current.material as MeshStandardMaterial).color.set(down ? C.alarm : C.brand)
  })
  return (
    <group position-y={SLAB_H}>
      <mesh position-y={0.09} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.18, 16]} />
        <meshStandardMaterial color={C.steelDark} />
      </mesh>
      <group ref={shoulder} position-y={0.18}>
        <mesh position-y={0.32} castShadow>
          <boxGeometry args={[0.16, 0.64, 0.16]} />
          <meshStandardMaterial color="#f2f4f7" />
        </mesh>
        <group ref={elbow} position-y={0.62} rotation-z={-0.9}>
          <mesh position-x={0.3} castShadow>
            <boxGeometry args={[0.6, 0.12, 0.12]} />
            <meshStandardMaterial color="#f2f4f7" />
          </mesh>
          <mesh ref={head} position-x={0.64} castShadow>
            <boxGeometry args={[0.14, 0.2, 0.14]} />
            <meshStandardMaterial color={C.brand} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** Туннель над лентой: окрасочная камера, печь, световой туннель ОТК. */
function Tunnel({ length, color, oven, light }: { length: number; color: string; oven?: boolean; light?: boolean }) {
  const h = 0.95
  const w = 1.15
  return (
    <group position-y={SLAB_H}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, h / 2, (s * w) / 2]} castShadow>
          <boxGeometry args={[length, h, 0.06]} />
          <meshStandardMaterial color={color} transparent opacity={0.85} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[length, 0.08, w + 0.06]} />
        <meshStandardMaterial color={oven ? '#cfd6de' : color} />
      </mesh>
      {oven &&
        [-0.45, 0, 0.45].map((x) => (
          <mesh key={x} position={[x, h + 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.24, 10]} />
            <meshStandardMaterial color={C.steelDark} />
          </mesh>
        ))}
      {light && (
        <mesh position={[0, h - 0.06, 0]}>
          <boxGeometry args={[length * 0.9, 0.03, w * 0.8]} />
          <meshBasicMaterial color="#fff6c8" />
        </mesh>
      )}
    </group>
  )
}

/** Рамка стенда геометрии. */
function Arch() {
  return (
    <group position-y={SLAB_H}>
      {[-0.6, 0.6].map((z) => (
        <mesh key={z} position={[0, 0.5, z]} castShadow>
          <boxGeometry args={[0.1, 1, 0.1]} />
          <meshStandardMaterial color={C.navy} />
        </mesh>
      ))}
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[0.1, 0.1, 1.3]} />
        <meshStandardMaterial color={C.navy} />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <boxGeometry args={[0.16, 0.06, 0.3]} />
        <meshStandardMaterial color={C.brand} />
      </mesh>
    </group>
  )
}

