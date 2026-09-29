import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface HDRIEnvironmentProps {
  /**
   * URL de um mapa `.hdr` (RGBE) ou `.exr` ultra-compacto (ex: 1k). Opcional:
   * sem ele (ou se o download falhar) usa-se um estúdio procedural com
   * Lightformers — zero bytes de rede, ideal para PWA offline.
   */
  hdrUrl?: string;
  /** Exposição do tone mapping ACES Filmic. */
  exposure?: number;
  /** Intensidade dos reflexos do ambiente nos materiais PBR. */
  intensity?: number;
  /** Resolução do cubemap (use `getGpuProfile().envResolution`). */
  resolution?: number;
  /** Cor de fundo de fallback (aplicada se `opaque`). */
  fallbackColor?: string;
  opaque?: boolean;
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

/** Estúdio procedural: faixas ciano/âmbar + softbox branca, assado uma única vez (frames=1). */
function ProceduralStudio({ resolution, intensity }: { resolution: number; intensity: number }) {
  return (
    <Environment resolution={resolution} frames={1} environmentIntensity={intensity}>
      <color attach="background" args={['#090d16']} />
      <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer form="rect" intensity={4} color="#00f2fe" position={[-6, 2, -3]} rotation-y={Math.PI / 2} scale={[8, 1.2, 1]} />
      <Lightformer form="rect" intensity={3.2} color="#ff9f43" position={[6, 1.5, 2]} rotation-y={-Math.PI / 2} scale={[8, 1.2, 1]} />
      <Lightformer form="ring" intensity={1.6} color="#7dd3fc" position={[0, 2, -8]} scale={6} />
    </Environment>
  );
}

class HdriBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Iluminação HDRI otimizada para web/PWA: carrega `.hdr`/`.exr` via
 * RGBELoader/EXRLoader (drei) quando `hdrUrl` é informado, cai para o estúdio
 * procedural em caso de erro/carregamento, e controla exposição (ACES Filmic).
 */
export function HDRIEnvironment({
  hdrUrl,
  exposure = 1.1,
  intensity = 1,
  resolution = 128,
  fallbackColor = '#090d16',
  opaque = false,
}: HDRIEnvironmentProps) {
  const procedural = <ProceduralStudio resolution={resolution} intensity={intensity} />;
  return (
    <>
      <ToneMapping exposure={exposure} />
      {opaque && <color attach="background" args={[fallbackColor]} />}
      {hdrUrl ? (
        <HdriBoundary fallback={procedural}>
          <Suspense fallback={procedural}>
            <Environment files={hdrUrl} environmentIntensity={intensity} />
          </Suspense>
        </HdriBoundary>
      ) : (
        procedural
      )}
    </>
  );
}
