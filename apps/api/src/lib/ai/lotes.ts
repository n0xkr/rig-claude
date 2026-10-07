/**
 * Utilitários de lote para chamadas de IA: dividir por orçamento de
 * caracteres, paralelismo limitado e itens identificados por id curto (a IA
 * responde por "i1", "i2"... e nunca consegue criar uma chave que não foi
 * enviada).
 */

export function chunk<T>(itens: readonly T[], tamanho: number): T[][] {
  const t = Math.max(1, Math.floor(tamanho));
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += t) out.push(itens.slice(i, i + t));
  return out;
}

/** `Promise.all` com no máximo `limite` tarefas em andamento; preserva a ordem dos resultados. */
export async function mapWithConcurrency<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i]!, i);
    }
  };
  const n = Math.max(1, Math.min(Math.floor(limite) || 1, itens.length));
  await Promise.all(Array.from({ length: n }, trabalhador));
  return resultados;
}

const tamanhoJson = (v: unknown) => {
  try {
    return (JSON.stringify(v) ?? '').length + 1;
  } catch {
    return Infinity;
  }
};

/**
 * Empacota itens em lotes que cabem em `maxChars` (JSON) e `maxItens`. Um
 * item que sozinho passa de `maxChars` vai para `omitidos` — o chamador
 * decide o que fazer com ele (nada é cortado em silêncio).
 */
export function dividirEmLotes<T>(
  itens: readonly T[],
  opcoes: { maxChars: number; maxItens?: number; medir?: (item: T) => number },
): { lotes: T[][]; omitidos: T[] } {
  const medir = opcoes.medir ?? tamanhoJson;
  const maxItens = Math.max(1, Math.floor(opcoes.maxItens ?? Infinity));
  const lotes: T[][] = [];
  const omitidos: T[] = [];
  let atual: T[] = [];
  let usado = 0;
  for (const item of itens) {
    const t = medir(item);
    if (t > opcoes.maxChars) {
      omitidos.push(item);
      continue;
    }
    if (atual.length > 0 && (usado + t > opcoes.maxChars || atual.length >= maxItens)) {
      lotes.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(item);
    usado += t;
  }
  if (atual.length > 0) lotes.push(atual);
  return { lotes, omitidos };
}

export interface ItensComId<T> {
  ids: string[];
  /** O que vai ao modelo: `[{ id: "i1", dados }, ...]`. */
  payload: Array<{ id: string; dados: T }>;
  porId: Map<string, T>;
}

/** Atribui ids curtos e estáveis ("i1", "i2", ...) aos itens. */
export function comIds<T>(itens: readonly T[], prefixo = 'i'): ItensComId<T> {
  const p = prefixo.replace(/[^A-Za-z]/g, '') || 'i';
  const ids = itens.map((_, i) => `${p}${i + 1}`);
  return {
    ids,
    payload: itens.map((dados, i) => ({ id: ids[i]!, dados })),
    porId: new Map(itens.map((item, i) => [ids[i]!, item])),
  };
}

/**
 * Lê a resposta do modelo por id — aceita `{ "i1": ..., "i2": ... }` ou
 * `[{ "id": "i1", ... }]` — descartando qualquer chave que não foi enviada.
 */
export function lerPorId<V>(
  resposta: Readonly<Record<string, V>> | ReadonlyArray<V> | null | undefined,
  idsEnviados: Iterable<string>,
): Map<string, V> {
  const enviados = new Set(idsEnviados);
  const out = new Map<string, V>();
  if (!resposta) return out;
  if (Array.isArray(resposta)) {
    for (const item of resposta as ReadonlyArray<V>) {
      const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined;
      if (typeof id === 'string' && enviados.has(id) && !out.has(id)) out.set(id, item);
    }
    return out;
  }
  for (const [id, v] of Object.entries(resposta as Readonly<Record<string, V>>)) {
    const chave = id.trim();
    if (enviados.has(chave)) out.set(chave, v);
  }
  return out;
}
