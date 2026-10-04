import { createHash } from 'node:crypto';

/**
 * Cache LRU com TTL em memória (Map preserva a ordem de inserção: reinserir no
 * acesso = "mais recente"). As chaves são sha256 de um JSON canônico, então o
 * cache nunca guarda o texto do prompt como chave. Os VALORES ficam só em
 * memória do processo; o adaptador persistente é opcional e nunca é usado em
 * tarefas sensíveis (OCR).
 */
export class CacheLru<V> {
  private readonly mapa = new Map<string, { valor: V; expiraEm: number }>();

  constructor(
    private readonly maxEntradas = 500,
    private readonly agora: () => number = Date.now,
  ) {}

  get(chave: string): V | undefined {
    const e = this.mapa.get(chave);
    if (!e) return undefined;
    if (e.expiraEm <= this.agora()) {
      this.mapa.delete(chave);
      return undefined;
    }
    this.mapa.delete(chave);
    this.mapa.set(chave, e);
    return e.valor;
  }

  set(chave: string, valor: V, ttlMs: number): void {
    if (!(ttlMs > 0) || this.maxEntradas <= 0) return;
    this.mapa.delete(chave);
    this.mapa.set(chave, { valor, expiraEm: this.agora() + ttlMs });
    while (this.mapa.size > this.maxEntradas) {
      const maisAntiga = this.mapa.keys().next().value;
      if (maisAntiga === undefined) break;
      this.mapa.delete(maisAntiga);
    }
  }

  delete(chave: string): void {
    this.mapa.delete(chave);
  }

  clear(): void {
    this.mapa.clear();
  }

  get tamanho(): number {
    return this.mapa.size;
  }
}

/** JSON com chaves de objeto ordenadas (mesma entrada → mesma string). */
export function jsonCanonico(valor: unknown): string {
  const normalizar = (v: unknown, profundidade: number): unknown => {
    if (profundidade > 20 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => normalizar(x, profundidade + 1));
    if (v instanceof Date) return v.toISOString();
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = normalizar((v as Record<string, unknown>)[k], profundidade + 1);
    }
    return out;
  };
  return JSON.stringify(normalizar(valor, 0)) ?? 'null';
}

export function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

/** Chave de cache: sha256 do JSON canônico das partes (tarefa, versão, modelo, payload...). */
export function chaveCache(...partes: unknown[]): string {
  return sha256(jsonCanonico(partes));
}

/** Adaptador persistente opcional (ex.: tabela `ia_cache`); falhas nunca derrubam a chamada. */
export interface AdaptadorCachePersistente {
  obter(chave: string): Promise<unknown | undefined>;
  gravar(chave: string, valor: unknown, ttlMs: number, tarefa: string): Promise<void>;
}
