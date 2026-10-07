/**
 * Extração robusta de JSON da resposta de um modelo — a mesma para texto e
 * visão: tolera cercas de código (```json), texto antes/depois, bloco
 * `<think>` de modelos de raciocínio e vírgula sobrando antes de `}`/`]`.
 */

export type ResultadoExtracaoJson =
  | { ok: true; valor: unknown }
  | { ok: false; erro: 'vazio' | 'sem_json' | 'json_invalido' };

function tentar(texto: string): { ok: true; valor: unknown } | null {
  try {
    return { ok: true, valor: JSON.parse(texto) };
  } catch {
    // Vírgula sobrando ("[1,2,]") é o defeito mais comum de modelos menores.
    const semVirgula = texto.replace(/,\s*([}\]])/g, '$1');
    if (semVirgula === texto) return null;
    try {
      return { ok: true, valor: JSON.parse(semVirgula) };
    } catch {
      return null;
    }
  }
}

/** Índice do fechamento correspondente ao `{`/`[` em `inicio` (respeita strings e escapes); -1 se não fecha. */
function acharFechamento(s: string, inicio: number): number {
  const pilha: string[] = [];
  let emString = false;
  let escape = false;
  for (let i = inicio; i < s.length; i++) {
    const c = s[i]!;
    if (emString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === '{') pilha.push('}');
    else if (c === '[') pilha.push(']');
    else if (c === '}' || c === ']') {
      if (pilha.pop() !== c) return -1;
      if (pilha.length === 0) return i;
    }
  }
  return -1;
}

export function extrairJson(texto: string | null | undefined): ResultadoExtracaoJson {
  if (!texto) return { ok: false, erro: 'vazio' };
  const s = texto
    .replace(/^﻿/, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
  if (!s) return { ok: false, erro: 'vazio' };

  const direto = tentar(s);
  if (direto) return direto;

  // Cercas de código: ```json ... ``` (a primeira que parsear).
  for (const m of s.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) {
    const dentro = m[1]?.trim();
    if (!dentro) continue;
    const r = tentar(dentro);
    if (r) return r;
  }

  // Primeiro objeto/lista balanceado que parsear (objetos têm prioridade).
  let tentativas = 0;
  for (const abre of ['{', '[']) {
    for (let i = s.indexOf(abre); i !== -1 && tentativas < 50; i = s.indexOf(abre, i + 1)) {
      tentativas++;
      const fim = acharFechamento(s, i);
      if (fim === -1) continue;
      const r = tentar(s.slice(i, fim + 1));
      if (r) return r;
    }
  }
  return { ok: false, erro: /[{[]/.test(s) ? 'json_invalido' : 'sem_json' };
}

/** Chaves de 1º nível de um objeto (para log sem valores). */
export function chavesDe(valor: unknown, max = 15): string[] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [];
  return Object.keys(valor as Record<string, unknown>)
    .slice(0, max)
    .map((k) => k.slice(0, 40));
}

/** Campos de 1º nível com valor preenchido (não nulo, não vazio) — para auditoria sem valores. */
export function camposPreenchidos(valor: unknown): string[] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [];
  return Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k]) => k);
}
