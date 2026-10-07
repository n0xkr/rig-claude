import { z } from 'zod';
import { limparTexto } from './sanitizacao.js';

/**
 * Schemas de decisão padronizados: a IA escolhe SÓ entre as opções reais
 * (z.enum dinâmico), a confiança é normalizada para 0..1 (aceita 0..100,
 * "85%", "0,8", "alta") e o motivo é limitado a 160 caracteres. Mais a
 * calibração "confiança do modelo × evidência determinística", que decide
 * entre aplicar sozinho, só sugerir ou descartar.
 */

const PALAVRAS_CONFIANCA: Record<string, number> = {
  'muito alta': 0.95,
  alta: 0.85,
  high: 0.85,
  media: 0.6,
  média: 0.6,
  medium: 0.6,
  baixa: 0.3,
  low: 0.3,
  'muito baixa': 0.1,
};

/** Normaliza confiança para 0..1; undefined se não der para interpretar. */
export function normalizarConfianca(v: unknown): number | undefined {
  let n: number | undefined;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s in PALAVRAS_CONFIANCA) return PALAVRAS_CONFIANCA[s];
    const m = s.replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(%)?$/);
    if (m) n = Number(m[1]) / (m[2] ? 100 : 1);
  }
  if (n === undefined || !Number.isFinite(n) || n < 0) return undefined;
  if (n > 1 && n <= 100) n = n / 100;
  return n > 1 ? undefined : n;
}

/** Confiança 0..1; valor ausente/inválido vira 0.5 (nunca derruba a validação). */
export const confiancaSchema = z
  .preprocess((v) => normalizarConfianca(v), z.number().min(0).max(1))
  .catch(0.5);

/** Motivo curto, limpo e com no máximo 160 caracteres (opcional). */
export const motivoSchema = z
  .preprocess((v) => (typeof v === 'string' ? limparTexto(v).trim().slice(0, 160) || undefined : undefined), z.string().optional())
  .catch(undefined);

/**
 * z.enum a partir das opções reais, tolerante a espaços e caixa
 * ("viagens " / "VIAGENS" → "viagens"). Lista vazia → nada é aceito.
 */
export function enumDeOpcoes<V extends string>(opcoes: readonly V[]): z.ZodType<V, z.ZodTypeDef, unknown> {
  const porNorm = new Map(opcoes.map((o) => [o.trim().toLowerCase(), o]));
  const normalizar = (v: unknown) => {
    if (typeof v !== 'string') return v;
    const exato = opcoes.find((o) => o === v);
    return exato ?? porNorm.get(v.trim().toLowerCase()) ?? v;
  };
  if (opcoes.length === 0) return z.never() as unknown as z.ZodType<V, z.ZodTypeDef, unknown>;
  return z.preprocess(normalizar, z.enum(opcoes as unknown as [V, ...V[]])) as z.ZodType<V, z.ZodTypeDef, unknown>;
}

export interface DecisaoBruta<V extends string> {
  valor: V | null;
  confianca: number;
  motivo?: string | undefined;
}

/**
 * Sub-schema `{ valor, confianca, motivo }`. Com `permitirNulo` (padrão), um
 * valor fora das opções vira `null` em vez de reprovar a resposta inteira —
 * útil em lotes, onde um item ruim não pode derrubar os demais.
 */
export function decisaoSchema<V extends string>(
  opcoes: readonly V[],
  config: { permitirNulo?: boolean } = {},
): z.ZodType<DecisaoBruta<V>, z.ZodTypeDef, unknown> {
  const valor = enumDeOpcoes(opcoes);
  const campoValor = (config.permitirNulo ?? true) ? valor.nullable().catch(null) : valor;
  return z.object({
    valor: campoValor,
    confianca: confiancaSchema,
    motivo: motivoSchema,
  }) as unknown as z.ZodType<DecisaoBruta<V>, z.ZodTypeDef, unknown>;
}

export type AcaoCalibrada = 'aplicar' | 'sugerir' | 'descartar';

export interface OpcoesCalibracao {
  /** Confiança declarada pelo modelo (0..1). */
  confiancaIa: number;
  /**
   * Evidência determinística 0..1 (ex.: CPF com DV válido = 1, inválido = 0,
   * cabeçalho coincide com o dicionário = cobertura). Ausente = só a IA.
   */
  evidencia?: number | null;
  /** Peso da IA na média com a evidência (padrão 0.5). */
  pesoIa?: number;
  /** Teto da confiança quando só a IA opina (padrão 0.8: sozinha ela nunca aplica). */
  tetoSomenteIa?: number;
  /** A partir daqui aplica automaticamente (padrão 0.85). */
  limiarAplicar?: number;
  /** A partir daqui vira sugestão para o humano (padrão 0.5). */
  limiarSugerir?: number;
}

const limitar01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Combina a confiança do modelo com a evidência determinística. Sem evidência,
 * a confiança fica limitada a `tetoSomenteIa` (abaixo do limiar de aplicação):
 * a IA sozinha só SUGERE.
 */
export function calibrarConfianca(o: OpcoesCalibracao): { confianca: number; acao: AcaoCalibrada } {
  const ia = limitar01(o.confiancaIa);
  const peso = limitar01(o.pesoIa ?? 0.5);
  const confianca =
    o.evidencia === undefined || o.evidencia === null
      ? Math.min(ia, limitar01(o.tetoSomenteIa ?? 0.8))
      : peso * ia + (1 - peso) * limitar01(o.evidencia);
  const c = Math.round(confianca * 1000) / 1000;
  const acao: AcaoCalibrada =
    c >= (o.limiarAplicar ?? 0.85) ? 'aplicar' : c >= (o.limiarSugerir ?? 0.5) ? 'sugerir' : 'descartar';
  return { confianca: c, acao };
}
