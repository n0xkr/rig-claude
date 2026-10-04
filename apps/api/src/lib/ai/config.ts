import { listaDeModelos, RESERVA_RAPIDO, RESERVA_TEXTO, RESERVA_VISAO } from './modelos.js';
import type { EsforcoRaciocinio } from './tipos.js';

/**
 * Configuração da camada de IA: políticas por família de tarefa (rota de
 * modelo, prazo, temperatura, cota, cache, PII) e limites globais. O serviço
 * recebe isto pronto — os testes montam com `criarConfigIa({...})` sem
 * depender do `.env`; a instância padrão (index.ts) monta a partir do env.
 */

export const FAMILIAS_IA = ['ocr', 'importacao', 'solicitacoes', 'insights', 'chatbot', 'risco', 'geral'] as const;
export type FamiliaIa = (typeof FAMILIAS_IA)[number];

export interface PoliticaFamilia {
  /** Rota de texto padrão (com imagens a rota é sempre "visao"). */
  rotaTexto: 'texto' | 'rapido';
  timeoutMs: number;
  temperatura: number;
  raciocinio: EsforcoRaciocinio;
  /** Dado pessoal sensível: sem cache persistente; cache em memória só se pedido explicitamente. */
  sensivel: boolean;
  /** TTL padrão do cache em memória (0 = desligado). */
  cacheTtlMs: number;
  /** Mascarar PII nas strings dos blocos por padrão. */
  mascararPii: boolean;
  porMinuto: number;
  porDia: number;
  /** Chamadas simultâneas desta família (o semáforo global também vale). */
  concorrencia: number;
  maxTokensPadrao: number;
}

const MIN = 60_000;

export const POLITICAS_PADRAO: Readonly<Record<FamiliaIa, PoliticaFamilia>> = {
  // OCR de CNH/CRLV: visão, determinístico, sensível (sem cache por padrão), sem mascarar (é o dado a extrair).
  ocr: {
    rotaTexto: 'texto',
    timeoutMs: 45_000,
    temperatura: 0,
    raciocinio: 'low',
    sensivel: true,
    cacheTtlMs: 0,
    mascararPii: false,
    porMinuto: 10,
    porDia: 200,
    concorrencia: 2,
    maxTokensPadrao: 1200,
  },
  // Importação: muitas chamadas curtas de classificação/mapeamento num burst.
  importacao: {
    rotaTexto: 'rapido',
    timeoutMs: 30_000,
    temperatura: 0,
    raciocinio: 'low',
    sensivel: false,
    cacheTtlMs: 30 * MIN,
    mascararPii: true,
    porMinuto: 120,
    porDia: 3000,
    concorrencia: 4,
    maxTokensPadrao: 1200,
  },
  solicitacoes: {
    rotaTexto: 'rapido',
    timeoutMs: 30_000,
    temperatura: 0,
    raciocinio: 'low',
    sensivel: false,
    cacheTtlMs: 30 * MIN,
    mascararPii: true,
    porMinuto: 120,
    porDia: 3000,
    concorrencia: 4,
    maxTokensPadrao: 1200,
  },
  insights: {
    rotaTexto: 'texto',
    timeoutMs: 40_000,
    temperatura: 0.1,
    raciocinio: 'medium',
    sensivel: false,
    cacheTtlMs: 5 * MIN,
    mascararPii: true,
    porMinuto: 10,
    porDia: 200,
    concorrencia: 2,
    maxTokensPadrao: 1200,
  },
  chatbot: {
    rotaTexto: 'texto',
    timeoutMs: 40_000,
    temperatura: 0.1,
    raciocinio: 'low',
    sensivel: false,
    cacheTtlMs: 0,
    mascararPii: true,
    porMinuto: 15,
    porDia: 300,
    concorrencia: 3,
    maxTokensPadrao: 700,
  },
  risco: {
    rotaTexto: 'texto',
    timeoutMs: 30_000,
    temperatura: 0.1,
    raciocinio: 'low',
    sensivel: false,
    cacheTtlMs: 10 * MIN,
    mascararPii: true,
    porMinuto: 20,
    porDia: 400,
    concorrencia: 3,
    maxTokensPadrao: 800,
  },
  geral: {
    rotaTexto: 'texto',
    timeoutMs: 30_000,
    temperatura: 0.1,
    raciocinio: 'low',
    sensivel: false,
    cacheTtlMs: 0,
    mascararPii: false,
    porMinuto: 60,
    porDia: 1500,
    concorrencia: 4,
    maxTokensPadrao: 1500,
  },
};

const ALIASES_FAMILIA: Record<string, FamiliaIa> = {
  ocr: 'ocr',
  motoristas: 'ocr',
  portaria: 'ocr',
  documentos: 'ocr',
  importacao: 'importacao',
  importacoes: 'importacao',
  solicitacoes: 'solicitacoes',
  iasolicitacoes: 'solicitacoes',
  insights: 'insights',
  acompanhamento: 'insights',
  chatbot: 'chatbot',
  chat: 'chatbot',
  risco: 'risco',
  geral: 'geral',
  legado: 'geral',
};

/** Família de uma tarefa "familia.subtarefa" (desconhecida → "geral"). */
export function familiaDaTarefa(tarefa: string): FamiliaIa {
  const prefixo = tarefa.split('.')[0]?.trim().toLowerCase() ?? '';
  return ALIASES_FAMILIA[prefixo] ?? 'geral';
}

export interface ConfigIa {
  /** Kill switch global (IA_HABILITADA). */
  habilitada: boolean;
  familiasDesligadas: ReadonlySet<FamiliaIa>;
  /** Tarefas exatas ou famílias desligadas por nome (IA_TAREFAS_DESABILITADAS). */
  tarefasDesligadas: ReadonlySet<string>;
  modelos: { texto: string[]; rapido: string[]; visao: string[] };
  politicas: Record<FamiliaIa, PoliticaFamilia>;
  /** Retentativas para 5xx/rede/timeout por modelo. */
  retentativas: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  concorrenciaGlobal: number;
  limiteDiaGlobal: number;
  tokensDiaGlobal: number;
  disjuntorFalhas: number;
  disjuntorPausaMs: number;
  cacheMaxEntradas: number;
  /** Teto absoluto de max_tokens (resposta + raciocínio). */
  maxTokensTeto: number;
}

export interface ConfigIaParcial
  extends Partial<Omit<ConfigIa, 'politicas' | 'modelos' | 'familiasDesligadas' | 'tarefasDesligadas'>> {
  politicas?: Partial<Record<FamiliaIa, Partial<PoliticaFamilia>>>;
  modelos?: Partial<ConfigIa['modelos']>;
  familiasDesligadas?: Iterable<FamiliaIa>;
  tarefasDesligadas?: Iterable<string>;
}

/** Configuração com defaults seguros, sobrescrita pelo que vier em `parcial`. */
export function criarConfigIa(parcial: ConfigIaParcial = {}): ConfigIa {
  const politicas = {} as Record<FamiliaIa, PoliticaFamilia>;
  for (const f of FAMILIAS_IA) politicas[f] = { ...POLITICAS_PADRAO[f], ...(parcial.politicas?.[f] ?? {}) };
  return {
    habilitada: parcial.habilitada ?? true,
    familiasDesligadas: new Set(parcial.familiasDesligadas ?? []),
    tarefasDesligadas: new Set([...(parcial.tarefasDesligadas ?? [])].map((t) => t.trim().toLowerCase())),
    modelos: {
      texto: parcial.modelos?.texto ?? [...RESERVA_TEXTO],
      rapido: parcial.modelos?.rapido ?? [...RESERVA_RAPIDO],
      visao: parcial.modelos?.visao ?? [...RESERVA_VISAO],
    },
    politicas,
    retentativas: parcial.retentativas ?? 2,
    backoffBaseMs: parcial.backoffBaseMs ?? 500,
    backoffMaxMs: parcial.backoffMaxMs ?? 8000,
    concorrenciaGlobal: parcial.concorrenciaGlobal ?? 4,
    limiteDiaGlobal: parcial.limiteDiaGlobal ?? 5000,
    tokensDiaGlobal: parcial.tokensDiaGlobal ?? 5_000_000,
    disjuntorFalhas: parcial.disjuntorFalhas ?? 5,
    disjuntorPausaMs: parcial.disjuntorPausaMs ?? 60_000,
    cacheMaxEntradas: parcial.cacheMaxEntradas ?? 500,
    maxTokensTeto: parcial.maxTokensTeto ?? 16_384,
  };
}

/** Variáveis de ambiente usadas pela camada (subconjunto do `Env`). */
export interface VariaveisIa {
  GROQ_MODEL: string;
  GROQ_FAST_MODEL: string;
  GROQ_VISION_MODEL: string;
  GROQ_TEXT_FALLBACK_MODELS: string;
  GROQ_VISION_FALLBACK_MODELS: string;
  IA_HABILITADA: boolean;
  IA_OCR_HABILITADO: boolean;
  IA_IMPORTACAO_HABILITADO: boolean;
  IA_SOLICITACOES_HABILITADO: boolean;
  IA_INSIGHTS_HABILITADO: boolean;
  IA_CHATBOT_HABILITADO: boolean;
  IA_RISCO_HABILITADO: boolean;
  IA_TAREFAS_DESABILITADAS: string;
  IA_TIMEOUT_MS?: number | undefined;
  IA_RETENTATIVAS: number;
  IA_CONCORRENCIA: number;
  IA_LIMITE_MINUTO_USUARIO?: number | undefined;
  IA_LIMITE_DIA_USUARIO?: number | undefined;
  IA_LIMITES: string;
  IA_LIMITE_DIA_GLOBAL: number;
  IA_TOKENS_DIA_GLOBAL: number;
  IA_DISJUNTOR_FALHAS: number;
  IA_DISJUNTOR_PAUSA_MS: number;
  IA_CACHE_MAX_ENTRADAS: number;
}

/**
 * `IA_LIMITES="ocr=10/200;chatbot=15/300"` → limites por família
 * (por minuto / por dia; 0 = sem limite). Entradas inválidas são ignoradas.
 */
export function lerLimitesPorFamilia(texto: string): Partial<Record<FamiliaIa, { porMinuto: number; porDia: number }>> {
  const out: Partial<Record<FamiliaIa, { porMinuto: number; porDia: number }>> = {};
  for (const parte of texto.split(/[;,]/)) {
    const m = parte.trim().match(/^([a-z]+)\s*=\s*(\d+)\s*\/\s*(\d+)$/i);
    if (!m) continue;
    const familia = ALIASES_FAMILIA[m[1]!.toLowerCase()];
    if (familia) out[familia] = { porMinuto: Number(m[2]), porDia: Number(m[3]) };
  }
  return out;
}

export function configIaDeVariaveis(v: VariaveisIa): ConfigIa {
  const flags: Array<[FamiliaIa, boolean]> = [
    ['ocr', v.IA_OCR_HABILITADO],
    ['importacao', v.IA_IMPORTACAO_HABILITADO],
    ['solicitacoes', v.IA_SOLICITACOES_HABILITADO],
    ['insights', v.IA_INSIGHTS_HABILITADO],
    ['chatbot', v.IA_CHATBOT_HABILITADO],
    ['risco', v.IA_RISCO_HABILITADO],
  ];
  const limites = lerLimitesPorFamilia(v.IA_LIMITES);
  const politicas: Partial<Record<FamiliaIa, Partial<PoliticaFamilia>>> = {};
  for (const f of FAMILIAS_IA) {
    politicas[f] = {
      ...(v.IA_TIMEOUT_MS ? { timeoutMs: v.IA_TIMEOUT_MS } : {}),
      ...(v.IA_LIMITE_MINUTO_USUARIO !== undefined ? { porMinuto: v.IA_LIMITE_MINUTO_USUARIO } : {}),
      ...(v.IA_LIMITE_DIA_USUARIO !== undefined ? { porDia: v.IA_LIMITE_DIA_USUARIO } : {}),
      ...(limites[f] ?? {}),
    };
  }
  return criarConfigIa({
    habilitada: v.IA_HABILITADA,
    familiasDesligadas: flags.filter(([, ligado]) => !ligado).map(([f]) => f),
    tarefasDesligadas: v.IA_TAREFAS_DESABILITADAS.split(',').filter((t) => t.trim()),
    modelos: {
      texto: listaDeModelos(v.GROQ_MODEL, v.GROQ_TEXT_FALLBACK_MODELS, RESERVA_TEXTO),
      rapido: listaDeModelos(v.GROQ_FAST_MODEL, v.GROQ_MODEL, v.GROQ_TEXT_FALLBACK_MODELS, RESERVA_RAPIDO),
      visao: listaDeModelos(v.GROQ_VISION_MODEL, v.GROQ_VISION_FALLBACK_MODELS, RESERVA_VISAO),
    },
    politicas,
    retentativas: v.IA_RETENTATIVAS,
    concorrenciaGlobal: v.IA_CONCORRENCIA,
    limiteDiaGlobal: v.IA_LIMITE_DIA_GLOBAL,
    tokensDiaGlobal: v.IA_TOKENS_DIA_GLOBAL,
    disjuntorFalhas: v.IA_DISJUNTOR_FALHAS,
    disjuntorPausaMs: v.IA_DISJUNTOR_PAUSA_MS,
    cacheMaxEntradas: v.IA_CACHE_MAX_ENTRADAS,
  });
}
