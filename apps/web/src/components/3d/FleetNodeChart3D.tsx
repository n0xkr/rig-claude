import { STATUS_VIAGEM_EM_FRONTEIRA, STATUS_VIAGEM_LABEL } from '@rigabras/shared';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, QuadraticBezierLine } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Viagem } from '@rigabras/shared';
import { HDRIEnvironment } from './HDRIEnvironment.js';
import { getGpuProfile } from '../../lib/gpu.js';
import { haptic } from '../../lib/haptics.js';
import {
  bezierAt,
  buildFleetGraph,
  MAX_TRUCKS,
  type FleetGraph,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from '../../lib/fleetGraph.js';

const KIND_COLOR: Record<NodeKind, string> = {
  ORIGEM: '#f59e0b',
  DESTINO: '#2563eb',
  HUB: '#10b981',
};
const KIND_LABEL: Record<NodeKind, string> = { ORIGEM: 'Origem', DESTINO: 'Destino', HUB: 'Hub' };
const PARTICLES_PER_EDGE = 6;
const EM_FRONTEIRA = new Set<string>(STATUS_VIAGEM_EM_FRONTEIRA);
const HOME_POS = new THREE.Vector3(0, 8.5, 13);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);

const statusLabel = (s: string) => (STATUS_VIAGEM_LABEL as Record<string, string>)[s] ?? s.replace(/_/g, ' ').toLowerCase();

interface Props {
  viagens: Viagem[];
  height?: number;
  onOpenViagem?: (id: string) => void;
}

/** Loop de animação com FPS limitado que só roda quando há algo animando E o canvas está visível. */
function Pacer({ active, fps }: { active: boolean; fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const step = 1000 / fps;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= step) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, fps, invalidate]);
  return null;
}

/** Voo suave da câmera até o nó selecionado (ou de volta ao início). */
function CameraRig({ focus }: { focus: THREE.Vector3 | null }) {
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);
  const goalTarget = useRef(HOME_TARGET.clone());
  const goalPos = useRef(HOME_POS.clone());
  const flying = useRef(false);

  useEffect(() => {
    if (focus) {
      goalTarget.current.copy(focus);
      goalPos.current.copy(focus).add(new THREE.Vector3(0, 3.2, 5.2));
    } else {
      goalTarget.current.copy(HOME_TARGET);
      goalPos.current.copy(HOME_POS);
    }
    flying.current = true;
    invalidate();
  }, [focus, invalidate]);

  useFrame(({ camera }, delta) => {
    if (!flying.current || !controls) return;
    const k = 1 - Math.exp(-4 * delta);
    camera.position.lerp(goalPos.current, k);
    controls.target.lerp(goalTarget.current, k);
    controls.update();
    if (camera.position.distanceTo(goalPos.current) < 0.02) flying.current = false;
    else invalidate();
  });
  return null;
}

function truckGeometry(): THREE.BufferGeometry {
  const cab = new THREE.BoxGeometry(0.16, 0.14, 0.14);
  cab.translate(0.2, 0.09, 0);
  const trailer = new THREE.BoxGeometry(0.36, 0.17, 0.15);
  trailer.translate(-0.06, 0.105, 0);
  const wheels = [-0.16, 0.0, 0.2].flatMap((x) =>
    [-0.08, 0.08].map((z) => {
      const w = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8);
      w.rotateX(Math.PI / 2);
      w.translate(x, 0.035, z);
      return w;
    }),
  );
  const merged = mergeGeometries([cab, trailer, ...wheels].map((g) => g.toNonIndexed()));
  return merged ?? cab;
}

/** Caminhões (uma única draw call via InstancedMesh) e partículas de fluxo (outra). */
function Traffic({ graph, animate }: { graph: FleetGraph; animate: boolean }) {
  const trucks = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(truckGeometry, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Vector3(), []);

  const particleList = useMemo(
    () =>
      graph.edges.flatMap((edge) =>
        Array.from({ length: PARTICLES_PER_EDGE }, (_, i) => ({
          edge,
          offset: i / PARTICLES_PER_EDGE,
          speed: 0.12 + Math.min(edge.viagens.length, 6) * 0.03,
        })),
      ),
    [graph],
  );

  useEffect(() => {
    const m = trucks.current;
    if (!m) return;
    const c = new THREE.Color();
    graph.moving.forEach((t, i) => {
      m.setColorAt(i, c.set(EM_FRONTEIRA.has(t.viagem.status) ? '#f59e0b' : '#334155'));
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [graph]);

  useFrame(({ clock }) => {
    const time = animate ? clock.elapsedTime : 0;
    const tm = trucks.current;
    if (tm) {
      graph.moving.forEach((t, i) => {
        const halted = EM_FRONTEIRA.has(t.viagem.status);
        const u = halted ? 0.5 : (time * 0.06 + t.phase) % 1;
        bezierAt(p, t.edge.from.position, t.edge.control, t.edge.to.position, u);
        bezierAt(
          q,
          t.edge.from.position,
          t.edge.control,
          t.edge.to.position,
          Math.min(u + 0.01, 1),
        );
        dummy.position.copy(p);
        dummy.position.y += 0.05;
        dummy.lookAt(q.x, q.y + 0.05, q.z);
        dummy.rotateY(-Math.PI / 2);
        dummy.updateMatrix();
        tm.setMatrixAt(i, dummy.matrix);
      });
      tm.count = graph.moving.length;
      tm.instanceMatrix.needsUpdate = true;
    }
    const pm = particles.current;
    if (pm) {
      particleList.forEach((pt, i) => {
        const u = (time * pt.speed + pt.offset) % 1;
        bezierAt(p, pt.edge.from.position, pt.edge.control, pt.edge.to.position, u);
        dummy.position.copy(p);
        dummy.scale.setScalar(0.7 + 0.5 * Math.sin(u * Math.PI));
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      });
      dummy.scale.setScalar(1);
      pm.count = particleList.length;
      pm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={trucks} args={[geo, undefined, MAX_TRUCKS]} frustumCulled={false}>
        <meshStandardMaterial metalness={0.5} roughness={0.35} envMapIntensity={1} />
      </instancedMesh>
      <instancedMesh
        ref={particles}
        args={[undefined, undefined, Math.max(particleList.length, 1)]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#3b82f6" toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function Edge({ edge, dim }: { edge: GraphEdge; dim: boolean }) {
  return (
    <QuadraticBezierLine
      start={edge.from.position}
      end={edge.to.position}
      mid={edge.control}
      color={edge.viagens.some((v) => EM_FRONTEIRA.has(v.status)) ? '#f59e0b' : '#2563eb'}
      lineWidth={dim ? 0.6 : 1.8}
      transparent
      opacity={dim ? 0.15 : 0.7}
      toneMapped={false}
    />
  );
}

function NodeHologram({
  node,
  selected,
  onSelect,
  onOpenViagem,
}: {
  node: GraphNode;
  selected: boolean;
  onSelect: (n: GraphNode) => void;
  onOpenViagem?: (id: string) => void;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = KIND_COLOR[node.kind];
  const invalidate = useThree((s) => s.invalidate);
  const scale = 0.2 + Math.min(node.viagens.length, 12) * 0.03;

  useFrame((_, d) => {
    if (ring.current) ring.current.rotation.z += d * 0.8;
  });

  const peso = node.viagens.reduce((acc, v) => acc + (v.peso_kg ?? 0), 0);

  return (
    <group position={node.position}>
      <mesh
        scale={selected || hover ? scale * 1.25 : scale}
        onClick={(e) => {
          e.stopPropagation();
          haptic('tap');
          onSelect(node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
          invalidate();
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
          invalidate();
        }}
      >
        <icosahedronGeometry args={[1, 2]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.6 : 0.25}
          metalness={0.4}
          roughness={0.2}
          clearcoat={1}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh ref={ring} rotation-x={Math.PI / 2} scale={scale * 2.1}>
        <torusGeometry args={[1, 0.018, 8, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {(hover || selected) && (
        <Html
          position={[0, scale * 2.2, 0]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: selected ? 'auto' : 'none' }}
        >
          <div
            className="w-56 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm"
            style={{ borderTopColor: color, borderTopWidth: 2 }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">{node.label}</span>
              <span style={{ color }}>{KIND_LABEL[node.kind]}</span>
            </div>
            <div className="mt-1 text-slate-500">
              {node.viagens.length} viagem(ns) ·{' '}
              {(peso / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t
            </div>
            {selected && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {node.viagens.slice(0, 8).map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-2 py-1 text-left hover:bg-slate-100 transition-all duration-200"
                      onClick={() => {
                        haptic('success');
                        onOpenViagem?.(v.id);
                      }}
                    >
                      <span className="font-mono">{v.placa_cavalo}</span>
                      <span className="text-slate-500">{statusLabel(v.status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
        Não foi possível iniciar o visualizador 3D neste dispositivo (WebGL indisponível).
      </div>
    ) : (
      this.props.children
    );
  }
}

/**
 * Grafo 3D interativo: nós (origens/destinos/hubs reais das viagens) como
 * nós clicáveis, rotas como feixes com partículas fluindo no
 * sentido do frete e caminhões instanciados. Render sob demanda: fora da tela,
 * aba oculta, sem viagens em trânsito ou com "reduzir movimento" o loop para.
 */
export default function FleetNodeChart3D({ viagens, height = 460, onOpenViagem }: Props) {
  const gpu = useMemo(getGpuProfile, []);
  const graph = useMemo(() => buildFleetGraph(viagens), [viagens]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [visible, setVisible] = useState(true);
  const [tabHidden, setTabHidden] = useState(document.hidden);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), {
      threshold: 0.05,
    });
    io.observe(el);
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const animating = visible && !tabHidden && !gpu.prefersReducedMotion && graph.edges.length > 0;
  const focus = selected ? selected.position : null;

  return (
    <div ref={wrapRef} style={{ height }} className="relative w-full" data-testid="fleet-3d">
      {graph.nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Cadastre viagens para ver a malha logística em 3D.
        </div>
      ) : (
        <CanvasBoundary>
          <Canvas
            frameloop="demand"
            dpr={gpu.dpr}
            camera={{ position: HOME_POS.toArray(), fov: 45, near: 0.1, far: 120 }}
            gl={{
              antialias: gpu.antialias,
              alpha: true,
              powerPreference: gpu.lowPower ? 'low-power' : 'high-performance',
            }}
            onPointerMissed={() => setSelected(null)}
          >
            <HDRIEnvironment resolution={gpu.envResolution} exposure={1.15} intensity={0.9} />
            <ambientLight intensity={0.6} />
            <fog attach="fog" args={['#f8fafc', 18, 46]} />
            <gridHelper args={[60, 60, '#cbd5e1', '#e2e8f0']} position={[0, -1.6, 0]} />
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              minDistance={3}
              maxDistance={30}
              maxPolarAngle={Math.PI * 0.49}
              enablePan={!gpu.isMobile}
            />
            <CameraRig focus={focus} />
            <Pacer active={animating} fps={gpu.isMobile || gpu.lowPower ? 30 : 60} />
            {graph.edges.map((e) => (
              <Edge
                key={e.id}
                edge={e}
                dim={!!selected && e.from.id !== selected.id && e.to.id !== selected.id}
              />
            ))}
            {graph.nodes.map((n) => (
              <NodeHologram
                key={n.id}
                node={n}
                selected={selected?.id === n.id}
                onSelect={setSelected}
                onOpenViagem={onOpenViagem}
              />
            ))}
            <Traffic graph={graph} animate={animating} />
          </Canvas>
        </CanvasBoundary>
      )}
    </div>
  );
}
