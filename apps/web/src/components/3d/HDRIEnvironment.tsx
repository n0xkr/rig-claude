import { useEffect } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface HDRIEnvironmentProps {
  /** Exposição do tone mapping ACES Filmic. */
  exposure?: number;
  /** Intensidade dos reflexos do ambiente nos materiais PBR. */
  intensity?: number;
  /** Resolução do cubemap (use `getGpuProfile().envResolution`). */
  resolution?: number;
}

/** Aplica ACESFilmic + exposição no renderer e agenda um re-render (demand). */
function ToneMapping({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [gl, exposure, invalidate]);
  return null;
}

/** Estúdio procedural: faixas azul/âmbar + softbox branca, assado uma única vez (frames=1). */
function ProceduralStudio({ resolution, intensity }: { resolution: number; intensity: number }) {
  return (
    <Environment resolution={resolution} frames={1} environmentIntensity={intensity}>
      <color attach="background" args={['#f8fafc']} />
      <Lightformer
        form="rect"
        intensity={2.2}
        color="#ffffff"
        position={[0, 6, 0]}
        rotation-x={Math.PI / 2}
        scale={[10, 10, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2.4}
        color="#60a5fa"
        position={[-6, 2, -3]}
        rotation-y={Math.PI / 2}
        scale={[8, 1.2, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.8}
        color="#fbbf24"
        position={[6, 1.5, 2]}
        rotation-y={-Math.PI / 2}
        scale={[8, 1.2, 1]}
      />
      <Lightformer form="ring" intensity={1.6} color="#7dd3fc" position={[0, 2, -8]} scale={6} />
    </Environment>
  );
}

/**
 * Iluminação de estúdio procedural para web/PWA (zero bytes de rede, funciona offline)
 * com tone mapping ACES Filmic e exposição controlada.
 */
export function HDRIEnvironment({
  exposure = 1.1,
  intensity = 1,
  resolution = 128,
}: HDRIEnvironmentProps) {
  return (
    <>
      <ToneMapping exposure={exposure} />
      <ProceduralStudio resolution={resolution} intensity={intensity} />
    </>
  );
}
