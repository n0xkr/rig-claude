import { normalizarPlaca } from './validadores.js';

/**
 * Utilitários de grounding: conferem se o texto gerado pela IA cita só
 * números e placas que existem no snapshot enviado. Usados no hook `validar`
 * de `gerarTexto`/`gerarJson` (chatbot, insights, risco): resposta com número
 * inventado vira `RESPOSTA_INVALIDA` e o chamador cai no template de regras.
 */

const RE_DATA = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b/g;
const RE_HORA = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{1,2}h\d{2}\b/gi;
/** Número não colado a letra/ponto/vírgula à esquerda (não pega dígitos de placa "JDE5H01"). */
const RE_NUMERO = /(?<![\p{L}\d.,])-?\d[\d.,]*/gu;

function parseNumeroBr(token: string): number | null {
  const t = token.replace(/[.,]+$/, '');
  if (!t || t === '-') return null;
  let normal: string;
  if (t.includes(',') && t.includes('.')) {
    // O último separador é o decimal ("1.234,5" pt-BR ou "1,234.5" en).
    normal = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    normal = (t.match(/,/g)?.length ?? 0) > 1 ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, ''); // "3.400" = três mil e quatrocentos
  } else {
    normal = t;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Números citados num texto pt-BR: "1.234,5" → 1234.5, "25%" → 25, "12d" → 12,
 * "R$ 3.400,00" → 3400. Datas e horas são ignoradas por padrão.
 */
export function extrairNumeros(texto: string, opcoes: { incluirDatas?: boolean } = {}): number[] {
  let s = texto;
  if (!opcoes.incluirDatas) s = s.replace(RE_DATA, ' ').replace(RE_HORA, ' ');
  const out: number[] = [];
  for (const m of s.matchAll(RE_NUMERO)) {
    const n = parseNumeroBr(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

// Sem flag "i": placas são escritas em maiúsculas, e "de 123 km" não pode virar placa.
const RE_PLACA = /\b(?:[A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/g;

/** Placas citadas (Mercosul BR/AR e antiga BR), normalizadas e sem repetição. */
export function extrairPlacas(texto: string): string[] {
  const out = new Set<string>();
  for (const m of texto.matchAll(RE_PLACA)) {
    const p = normalizarPlaca(m[0]);
    // Exige ao menos um dígito e uma letra (evita palavras comuns).
    if (/\d/.test(p) && /[A-Z]/.test(p)) out.add(p);
  }
  return [...out];
}

/** Todos os valores numéricos de um snapshot (achatado), inclusive strings numéricas. */
export function numerosDe(valor: unknown, profundidade = 0, acc: Set<number> = new Set()): number[] {
  if (profundidade > 10 || valor === null || valor === undefined) return [...acc];
  if (typeof valor === 'number') {
    if (Number.isFinite(valor)) acc.add(valor);
  } else if (typeof valor === 'string') {
    const t = valor.trim();
    if (/^-?[\d.,]+%?$/.test(t)) {
      const n = parseNumeroBr(t.replace('%', ''));
      if (n !== null) acc.add(n);
    }
  } else if (Array.isArray(valor)) {
    acc.add(valor.length);
    for (const v of valor) numerosDe(v, profundidade + 1, acc);
  } else if (typeof valor === 'object') {
    for (const v of Object.values(valor as Record<string, unknown>)) numerosDe(v, profundidade + 1, acc);
  }
  return [...acc];
}

export interface OpcoesConferencia {
  /** Tolerância relativa (padrão 0.01 = 1%). */
  toleranciaRelativa?: number;
  /** Tolerância absoluta (padrão 0.5 — aceita arredondamento para inteiro). */
  toleranciaAbsoluta?: number;
  /** Números com |n| até este valor são ignorados (contagens/numeração). Padrão 10. */
  ignorarAte?: number;
  /** Ignora anos (1990..2100). Padrão true. */
  ignorarAnos?: boolean;
}

/**
 * Confere se cada número citado no texto existe (com tolerância) entre os
 * permitidos — inclusive frações exibidas como percentual (0.25 ↔ 25%).
 */
export function conferirCitacoes(
  texto: string,
  permitidos: readonly number[],
  opcoes: OpcoesConferencia = {},
): { ok: boolean; naoConferem: number[] } {
  const tolRel = opcoes.toleranciaRelativa ?? 0.01;
  const tolAbs = opcoes.toleranciaAbsoluta ?? 0.5;
  const ignorarAte = opcoes.ignorarAte ?? 10;
  const ignorarAnos = opcoes.ignorarAnos ?? true;
  const confere = (n: number, p: number) => Math.abs(n - p) <= Math.max(tolAbs, tolRel * Math.abs(p));
  const naoConferem: number[] = [];
  for (const n of extrairNumeros(texto)) {
    if (Math.abs(n) <= ignorarAte) continue;
    if (ignorarAnos && Number.isInteger(n) && n >= 1990 && n <= 2100) continue;
    const ok = permitidos.some((p) => confere(n, p) || (Math.abs(p) <= 1 && confere(n, p * 100)));
    if (!ok && !naoConferem.includes(n)) naoConferem.push(n);
  }
  return { ok: naoConferem.length === 0, naoConferem };
}

/** Placas citadas no texto que não estão entre as permitidas. */
export function conferirPlacas(texto: string, permitidas: Iterable<string>): string[] {
  const ok = new Set([...permitidas].map(normalizarPlaca));
  return extrairPlacas(texto).filter((p) => !ok.has(p));
}
