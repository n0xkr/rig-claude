import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getGpuProfile } from '../lib/gpu.js';

export interface Bar3DDatum {
  label: string;
  value: number;
}

interface Props {
  data: Bar3DDatum[];
  /** Altura do canvas em pixels. */
  height?: number;
  /** Formata o valor exibido no tooltip e sobre a barra. */
  formatValue?: (value: number) => string;
  /** Descrição acessível (ex.: "Km rodado por veículo"). */
  ariaLabel?: string;
}

const BAR_WIDTH = 0.8;
const GAP = 0.5;
const MAX_BAR_HEIGHT = 4;
const HOME = { pos: new THREE.Vector3(0, 4.5, 9), target: new THREE.Vector3(0, 1, 0) };

/** Sprite de texto (canvas 2D) para rótulos; o chamador descarta textura e material. */
function makeLabel(text: string, bold = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = `${bold ? '700' : '500'} 34px system-ui, sans-serif`;
    ctx.fillStyle = bold ? '#0f172a' : '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32, 248);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

/**
 * Gráfico de barras 3D (Three.js) com dados REAIS de KPI (ex.: `useFrotaKpis().por_veiculo`).
 * Interativo: girar/zoom (mouse/toque), tooltip ao passar/tocar numa barra, rótulos
 * com nome e valor, "Reiniciar vista". Rotação automática só sem "reduzir movimento";
 * o loop para com a aba oculta ou o gráfico fora da tela.
 */
export function Dashboard3DBarChart({
  data,
  height = 360,
  formatValue = (v) => v.toLocaleString('pt-BR'),
  ariaLabel = 'Gráfico de barras 3D',
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // Identidade por conteúdo: o WebGL só é recriado quando os dados realmente mudam.
  const signature = useMemo(() => JSON.stringify(data), [data]);
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;

  useEffect(() => {
    const mount = mountRef.current;
    const bars = JSON.parse(signature) as Bar3DDatum[];
    if (!mount || bars.length === 0) return;

    const gpu = getGpuProfile();
    if (!gpu.hasWebgl) {
      setFailed(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: gpu.antialias,
        alpha: true,
        powerPreference: gpu.lowPower ? 'low-power' : 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);

    const width = Math.max(mount.clientWidth, 1);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.02);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const totalWidth = bars.length * (BAR_WIDTH + GAP);
    // Enquadra todas as barras (largura cresce com a quantidade).
    const distance = Math.max(8, totalWidth * 0.8);
    const home = {
      pos: new THREE.Vector3(0, 4.5 + distance * 0.12, distance),
      target: HOME.target,
    };
    camera.position.copy(home.pos);

    renderer.setPixelRatio(gpu.dpr[1]);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(home.target);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = !gpu.prefersReducedMotion;
    controls.autoRotateSpeed = 0.6;
    controls.update();
    resetRef.current = () => {
      camera.position.copy(home.pos);
      controls.target.copy(home.target);
      controls.update();
    };

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 8, 6);
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);
    scene.add(new THREE.GridHelper(60, 60, 0xe2e8f0, 0xe2e8f0));

    const group = new THREE.Group();
    scene.add(group);

    const maxValue = Math.max(...bars.map((d) => d.value), 1);
    const low = new THREE.Color(0x93c5fd);
    const high = new THREE.Color(0x2563eb);
    const meshes: THREE.Mesh[] = [];
    const geometry = new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_WIDTH);
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.08,
    });

    bars.forEach((d, i) => {
      const barHeight = Math.max((d.value / maxValue) * MAX_BAR_HEIGHT, 0.05);
      const color = new THREE.Color().lerpColors(low, high, d.value / maxValue);
      const x = i * (BAR_WIDTH + GAP) - totalWidth / 2 + (BAR_WIDTH + GAP) / 2;

      const bar = new THREE.Mesh(
        geometry, // altura unitária compartilhada, escalada por barra (1 geometria só)
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.12,
          roughness: 0.35,
          metalness: 0.4,
        }),
      );
      bar.scale.y = barHeight;
      bar.position.set(x, barHeight / 2, 0);
      bar.userData = { index: i };
      group.add(bar);
      meshes.push(bar);

      const outline = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      outline.scale.copy(bar.scale);
      outline.position.copy(bar.position);
      group.add(outline);

      const name = makeLabel(d.label, true);
      name.position.set(x, 0.22, BAR_WIDTH + 0.65);
      group.add(name);
      const value = makeLabel(formatRef.current(d.value));
      value.position.set(x, barHeight + 0.45, 0);
      group.add(value);
    });

    // Tooltip por raycast (mouse e toque).
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      const idx = hit ? (hit.object.userData.index as number) : -1;
      const d = idx >= 0 ? bars[idx] : undefined;
      setTip(
        d
          ? {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              text: `${d.label}: ${formatRef.current(d.value)}`,
            }
          : null,
      );
    };
    const onLeave = () => setTip(null);
    renderer.domElement.addEventListener('pointermove', onPointer);
    renderer.domElement.addEventListener('pointerdown', onPointer);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    // Loop só enquanto visível (aba ativa + dentro da viewport).
    let onScreen = true;
    let frameId = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(loop);
    };
    const sync = () => {
      const run = onScreen && !document.hidden;
      if (run && !frameId) frameId = requestAnimationFrame(loop);
      if (!run && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    io.observe(mount);
    document.addEventListener('visibilitychange', sync);
    sync();

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(mount.clientWidth, 1);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    });
    resizeObserver.observe(mount);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      renderer.domElement.removeEventListener('pointermove', onPointer);
      renderer.domElement.removeEventListener('pointerdown', onPointer);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry !== geometry) obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        } else if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
      geometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [signature, height]);

  if (data.length === 0 || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500"
        style={{ height }}
      >
        {failed
          ? 'Visualizador 3D indisponível neste dispositivo — use os valores listados abaixo.'
          : 'Sem dados suficientes para o gráfico 3D.'}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mountRef}
        role="img"
        aria-label={`${ariaLabel}: ${data.map((d) => `${d.label} ${formatValue(d.value)}`).join('; ')}`}
        className="w-full touch-pan-y overflow-hidden rounded-xl"
        style={{ height }}
      />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-sm"
          style={{ left: tip.x, top: Math.max(tip.y - 10, 0) }}
        >
          {tip.text}
        </div>
      )}
      <button
        type="button"
        onClick={() => resetRef.current()}
        className="absolute right-2 top-2 rounded-lg border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-medium hover:bg-white"
      >
        Reiniciar vista
      </button>
    </div>
  );
}
