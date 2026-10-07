import { useMemo, useRef, type ReactNode } from 'react'
import { Edges } from '@react-three/drei'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { EdgesGeometry, PlaneGeometry } from 'three'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { focusObject } from '@/components/twin/focus'
import { EQUIPMENT_BY_ID, type SectionId } from '@/data/plant'
import type { Status } from '@/sim/metrics'
import { useTwin } from '@/sim/useTwin'
import { type HeatMode, useSim } from '@/store/sim'
import { BELT_Y, BLOCK_D, blockW, blockX, bufferZone, CAR_L, EQUIPMENT_POS, LINE_X0, LINE_X1, SECTION_ORDER, sectionW, SLAB_H, WALL_H } from './layout'
import { STATIONS } from '@/sim/model'
import { Model, MODEL, Robot } from './models'
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
          <ConveyorLine />
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
      return <Crates kits={kits} />
    case 'welding':
      return (
        <>
          {(['ABB-01', 'ABB-02', 'ABB-03', 'ABB-04'] as const).map((r) => (
            <Equip key={r} id={r}>
              <Robot equipmentId={r} position-y={SLAB_H} rotation-y={EQUIPMENT_POS[r][2] > 0 ? Math.PI : 0} scale={0.56} />
            </Equip>
          ))}
        </>
      )
    case 'painting':
      // Камера и печь стоят над лентой — кузова проходят сквозь них.
      return (
        <>
          <Equip id="Камера-02">
            <Model url={MODEL.machineWindow} position-y={SLAB_H} scale={[1.75, 0.75, 0.82]} />
          </Equip>
          <Equip id="ПС-01">
            <Model url={MODEL.machineFortified} position-y={SLAB_H} scale={[1.4, 0.72, 0.78]} />
          </Equip>
        </>
      )
    case 'assembly':
      return (
        <>
          <Equip id="Конвейер-03">
            <mesh position-y={BELT_Y + 0.006} receiveShadow>
              <boxGeometry args={[sectionW('assembly') - 0.3, 0.02, 0.5]} />
              <meshStandardMaterial color={C.beltDark} roughness={0.8} />
            </mesh>
            <Model url={MODEL.crane} position={[-1.6, SLAB_H, -1.15]} scale={0.42} />
            <Model url={MODEL.crane} position={[1.4, SLAB_H, -1.15]} scale={0.42} />
          </Equip>
          <Equip id="СЗ-01">
            <Model url={MODEL.machine} position-y={SLAB_H} scale={0.5} />
          </Equip>
        </>
      )
    case 'qc':
      return (
        <>
          <Equip id="СГ-01">
            <Model url={MODEL.scanner} position-y={SLAB_H} scale={0.72} />
          </Equip>
          <Equip id="КЛ-01">
            <Model url={MODEL.scanner} position-y={SLAB_H} scale={0.72} />
          </Equip>
        </>
      )
    case 'wh-out':
      return <Model url={MODEL.warning} position={[1.2, SLAB_H, 2.6]} scale={0.5} />
    default:
      return null
  }
}

/** Склад комплектов: штабеля коробок, их число зависит от запаса. */
function Crates({ kits }: { kits: number }) {
  const fill = Math.min(1, kits / 180)
  const cells: { x: number; z: number; levels: number; url: string }[] = []
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c
      const levels = idx / 12 < fill ? 1 + ((idx * 7) % 3) : 0
      cells.push({ x: -1.0 + c * 1.0, z: -2.4 + r * 1.2 + (r >= 2 ? 0.6 : 0), levels, url: idx % 4 === 1 ? MODEL.boxWide : MODEL.boxLarge })
    }
  return (
    <group>
      {cells.flatMap((c, i) =>
        Array.from({ length: c.levels }, (_, l) => <Model key={`${i}-${l}`} url={c.url} position={[c.x, SLAB_H + l * 0.39, c.z]} scale={0.7} />),
      )}
    </group>
  )
}

/** Лента: плитки конвейера Kenney вдоль всей линии. */
function ConveyorLine() {
  const tile = 1.0
  const n = Math.ceil((LINE_X1 - LINE_X0) / tile)
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <Model key={i} url={MODEL.conveyor} position={[LINE_X0 + tile / 2 + i * tile, 0, 0]} scale={[tile / 2, BELT_Y / 0.4, 0.62]} />
      ))}
    </group>
  )
}
