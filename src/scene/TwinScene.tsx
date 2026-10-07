import { OrthographicCamera, SoftShadows } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useSim } from '@/store/sim'
import { CameraRig } from './CameraRig'
import { Cars } from './Cars'
import { Factory } from './Factory'
import { Labels } from './Labels'

/** 3D-сцена цеха: изометрическая ортокамера, мягкий свет, корпуса, оборудование и кузова. */
export default function TwinScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => useSim.getState().setHoverSection(null)}
      className="!absolute inset-0"
    >
      <OrthographicCamera makeDefault position={[40, 40, 40]} near={0.1} far={400} zoom={30} />
      <SoftShadows size={18} samples={12} focus={0.6} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#ffffff', '#dfe6ee', 0.6]} />
      <directionalLight
        position={[-14, 26, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
      />
      <Factory />
      <Cars />
      <Labels />
      <CameraRig />
    </Canvas>
  )
}
