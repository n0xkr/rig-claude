import * as THREE from 'three';
import type { Viagem } from '@rigabras/shared';

export type NodeKind = 'ORIGEM' | 'DESTINO' | 'HUB';

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  position: THREE.Vector3;
  viagens: Viagem[];
}

export interface GraphEdge {
  id: string;
  from: GraphNode;
  to: GraphNode;
  control: THREE.Vector3;
  viagens: Viagem[];
}

export interface FleetGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Viagens em deslocamento (aparecem como caminhões instanciados). */
  moving: { viagem: Viagem; edge: GraphEdge; phase: number }[];
}

/** Status em que o caminhão está efetivamente na estrada. */
export const MOVING_STATUS = ['EM_COLETA', 'EM_TRANSITO', 'NA_FRONTEIRA', 'EM_MONITORAMENTO'];

export const MAX_NODES = 40;
export const MAX_EDGES = 80;
export const MAX_TRUCKS = 300;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Ponto sobre a curva quadrática de Bézier (mesma usada para linhas, partículas e caminhões). */
export function bezierAt(
  out: THREE.Vector3,
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
) {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}

/**
 * Monta o grafo logístico a partir de viagens REAIS: nós = origens/destinos,
 * arestas = rotas (origem→destino) e caminhões = viagens em deslocamento.
 * Layout determinístico (espiral áurea) para o grafo não "pular" a cada refresh.
 */
export function buildFleetGraph(viagens: Viagem[]): FleetGraph {
  const ativas = viagens.filter((v) => v.status !== 'CANCELADA');
  const byKey = new Map<string, GraphNode>();
  const asOrigin = new Set<string>();
  const asDest = new Set<string>();

  const ensure = (label: string): GraphNode => {
    const key = norm(label);
    let n = byKey.get(key);
    if (!n) {
      n = {
        id: key,
        label: label.trim(),
        kind: 'ORIGEM',
        position: new THREE.Vector3(),
        viagens: [],
      };
      byKey.set(key, n);
    }
    return n;
  };

  for (const v of ativas) {
    asOrigin.add(norm(v.origem));
    asDest.add(norm(v.destino));
    ensure(v.origem).viagens.push(v);
    ensure(v.destino).viagens.push(v);
  }

  const nodes = [...byKey.values()]
    .sort((a, b) => b.viagens.length - a.viagens.length)
    .slice(0, MAX_NODES);
  const keep = new Set(nodes.map((n) => n.id));

  nodes.forEach((n, i) => {
    const o = asOrigin.has(n.id);
    const d = asDest.has(n.id);
    n.kind = o && d ? 'HUB' : o ? 'ORIGEM' : 'DESTINO';
    const radius = i === 0 ? 0 : 1.9 + 1.25 * Math.sqrt(i);
    const angle = i * 2.399963;
    n.position.set(Math.cos(angle) * radius, (hash(n.id) - 0.5) * 1.8, Math.sin(angle) * radius);
  });

  const edgeMap = new Map<string, GraphEdge>();
  for (const v of ativas) {
    const a = byKey.get(norm(v.origem));
    const b = byKey.get(norm(v.destino));
    if (!a || !b || a === b || !keep.has(a.id) || !keep.has(b.id)) continue;
    const id = `${a.id}>${b.id}`;
    let e = edgeMap.get(id);
    if (!e) {
      if (edgeMap.size >= MAX_EDGES) continue;
      const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
      mid.y += 0.4 + 0.18 * a.position.distanceTo(b.position);
      e = { id, from: a, to: b, control: mid, viagens: [] };
      edgeMap.set(id, e);
    }
    e.viagens.push(v);
  }

  const edges = [...edgeMap.values()];
  const moving: FleetGraph['moving'] = [];
  for (const e of edges) {
    for (const v of e.viagens) {
      if (MOVING_STATUS.includes(v.status) && moving.length < MAX_TRUCKS) {
        moving.push({ viagem: v, edge: e, phase: hash(v.id) });
      }
    }
  }
  return { nodes, edges, moving };
}
