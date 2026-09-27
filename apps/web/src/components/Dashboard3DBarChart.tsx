import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  /** Altura do canvas em pixels. */
  height?: number;
}

/**
 * Gráfico de barras 3D (Three.js puro, sem react-three-fiber — não é
 * dependência do projeto e adicionar só por isto seria peso extra) que
 * plota dados REAIS vindos dos hooks de KPI (ex: `useFrotaKpis().por_veiculo`),
 * nunca mock. Cada barra usa material emissivo em gradiente verde->amarelo
 * (identidade visual da logo Rigabras), piso espelhado para reflexo suave e
 * rotação lenta contínua — puramente decorativo, não interativo.
 */
export function Dashboard3DBarChart({ data, height = 360 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || data.length === 0) return;

    const width = mount.clientWidth;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0f1e, 0.045);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4.5, 9);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x334155, 0.8);
    scene.add(ambient);
    const greenLight = new THREE.PointLight(0x22c55e, 25, 20);
    greenLight.position.set(-4, 5, 3);
    scene.add(greenLight);
    const yellowLight = new THREE.PointLight(0xfacc15, 25, 20);
    yellowLight.position.set(4, 4, -2);
    scene.add(yellowLight);

    // Piso espelhado (reflexo suave via material com baixa rugosidade).
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.25, metalness: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);

    const group = new THREE.Group();
    scene.add(group);

    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const barWidth = 0.8;
    const gap = 0.5;
    const totalWidth = data.length * (barWidth + gap);

    data.forEach((d, i) => {
      const barHeight = Math.max((d.value / maxValue) * 4, 0.05);
      const t = maxValue > 0 ? d.value / maxValue : 0;
      const color = new THREE.Color().lerpColors(
        new THREE.Color(0x15803d),
        new THREE.Color(0xfacc15),
        t,
      );

      const geometry = new THREE.BoxGeometry(barWidth, barHeight, barWidth);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.4,
      });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.set(i * (barWidth + gap) - totalWidth / 2, barHeight / 2, 0);
      group.add(bar);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 }),
      );
      edges.position.copy(bar.position);
      group.add(edges);
    });

    let frameId: number;
    const clock = new THREE.Clock();
    function animate() {
      const elapsed = clock.getElapsedTime();
      group.rotation.y = Math.sin(elapsed * 0.15) * 0.35;
      camera.position.y = 4.5 + Math.sin(elapsed * 0.4) * 0.15;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mount.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
    };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 text-sm text-slate-500"
        style={{ height }}
      >
        Sem dados suficientes para o gráfico 3D.
      </div>
    );
  }

  return <div ref={mountRef} className="w-full overflow-hidden rounded-2xl" style={{ height }} />;
}
