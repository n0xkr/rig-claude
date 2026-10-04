import type { z } from 'zod';
import { env, isGroqConfigured } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { configIaDeVariaveis } from './config.js';
import { erroIaDeFalha } from './erros.js';
import { criarCachePersistente, criarPersistenciaUso } from './persistencia.js';
import { criarProvedorGroq } from './provedorGroq.js';
import { criarServicoIa, type ServicoIa, type SnapshotServicoIa, type StatusIa } from './servico.js';
import type {
  BlocoDadosIa,
  ContextoIa,
  DecisaoIa,
  LoggerIa,
  OpcoesBaseIa,
  OpcoesClassificarLote,
  OpcoesEscolherOpcao,
  OpcoesGerarJson,
  OpcoesGerarTexto,
  OpcoesVisaoJson,
  OrigemIa,
  ResultadoIa,
  ResultadoLoteIa,
} from './tipos.js';

/**
 * Ponto de entrada da camada de IA. Importe daqui:
 *
 *   import { ia, gerarJson, visaoJson, erroDeDominioIa } from '../../lib/ai/index.js';
 *
 *   const r = await gerarJson({ tarefa: 'importacao.colunas', sistema: SYS, dados: {...}, schema });
 *   if (!r.ok) return fallbackDeterministico();   // NAO_CONFIGURADA, TIMEOUT, LIMITE_TAXA...
 *   use(r.dados);                                  // já validado por Zod
 *
 * Sob vitest a IA real fica desligada (NAO_CONFIGURADA) salvo
 * IA_TESTES_HABILITADA=true; nos testes use `ia.setProvider(criarProvedorFalso(...))`.
 */

const sobVitest = Boolean(process.env.VITEST) && !env.IA_TESTES_HABILITADA;

const loggerIa: LoggerIa = {
  info: (obj, msg) => logger.info(obj, msg),
  warn: (obj, msg) => logger.warn(obj, msg),
  error: (obj, msg) => logger.error(obj, msg),
};

/** Instância padrão do AIService (uma por processo). */
export const ia: ServicoIa = criarServicoIa({
  config: configIaDeVariaveis(env),
  provedor:
    isGroqConfigured && env.GROQ_API_KEY && !sobVitest ? criarProvedorGroq({ apiKey: env.GROQ_API_KEY }) : null,
  motivoSemProvedor: !isGroqConfigured
    ? 'GROQ_API_KEY ausente'
    : 'IA real desligada sob vitest (IA_TESTES_HABILITADA=true para usar a Groq nos testes)',
  logger: loggerIa,
  cachePersistente: env.IA_CACHE_PERSISTENTE ? criarCachePersistente() : null,
  persistirUso: env.IA_PERSISTIR_USO ? criarPersistenciaUso() : null,
});

// ---------------------------------------------------------------------------
// Atalhos da instância padrão (API que NUNCA lança)
// ---------------------------------------------------------------------------

export const gerarJson = <T>(op: OpcoesGerarJson<T>): Promise<ResultadoIa<T>> => ia.gerarJson(op);
export const visaoJson = <T>(op: OpcoesVisaoJson<T>): Promise<ResultadoIa<T>> => ia.visaoJson(op);
export const gerarTexto = (op: OpcoesGerarTexto): Promise<ResultadoIa<string>> => ia.gerarTexto(op);
export const escolherOpcao = <V extends string>(op: OpcoesEscolherOpcao<V>): Promise<ResultadoIa<DecisaoIa<V> | null>> =>
  ia.escolherOpcao(op);
export const classificarLote = <V extends string>(op: OpcoesClassificarLote<V>): Promise<ResultadoLoteIa<V>> =>
  ia.classificarLote(op);
/** A IA pode ser usada (nesta tarefa)? Para a UI mostrar/esconder o botão ou o rótulo "IA + regras". */
export const isIaDisponivel = (tarefa?: string): boolean => ia.disponivel(tarefa);
export const statusIa = (): StatusIa => ia.status();
/** Contadores agregados (tokens, custo, latência, falhas por motivo/modelo, limites, disjuntores). */
export const getAiUsageSnapshot = (): SnapshotServicoIa => ia.usoSnapshot();
export const criarContextoIa: ServicoIa['criarContexto'] = (o) => ia.criarContexto(o);

/** `meta.origem` padronizado para todas as features. */
export function origemDe(o: { usouIa: boolean; usouRegras: boolean }): OrigemIa {
  if (o.usouIa && o.usouRegras) return 'IA+REGRAS';
  return o.usouIa ? 'IA' : 'REGRAS';
}

// ---------------------------------------------------------------------------
// API que LANÇA (AiError → DomainError com status HTTP), nomes em inglês
// ---------------------------------------------------------------------------

export interface CompleteBaseOptions {
  /** Igual a `tarefa` ("familia.subtarefa"). */
  feature: string;
  system: string;
  instruction?: string;
  data?: unknown;
  blocks?: BlocoDadosIa[];
  userId?: string | null;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  promptVersion?: string;
  signal?: AbortSignal;
  context?: ContextoIa;
  sensitive?: boolean;
  maskPii?: boolean;
  route?: 'texto' | 'rapido';
  model?: string;
}

export interface CompleteStructuredOptions<T> extends CompleteBaseOptions {
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  validate?: (dados: T) => string[];
}

export interface CompleteVisionOptions<T> extends CompleteStructuredOptions<T> {
  /** Data URLs (`data:image/jpeg;base64,...`). */
  images: string[];
}

export interface CompleteTextOptions extends CompleteBaseOptions {
  validate?: (texto: string) => string[];
}

function paraOpcoesBase(o: CompleteBaseOptions): OpcoesBaseIa {
  return {
    tarefa: o.feature,
    sistema: o.system,
    ...(o.instruction !== undefined ? { instrucao: o.instruction } : {}),
    ...(o.data !== undefined ? { dados: o.data } : {}),
    ...(o.blocks ? { blocos: o.blocks } : {}),
    ...(o.userId !== undefined ? { usuarioId: o.userId } : {}),
    ...(o.maxTokens !== undefined ? { maxTokens: o.maxTokens } : {}),
    ...(o.temperature !== undefined ? { temperatura: o.temperature } : {}),
    ...(o.timeoutMs !== undefined ? { timeoutMs: o.timeoutMs } : {}),
    ...(o.cacheTtlMs !== undefined ? { cacheTtlMs: o.cacheTtlMs } : {}),
    ...(o.promptVersion !== undefined ? { versaoPrompt: o.promptVersion } : {}),
    ...(o.signal ? { signal: o.signal } : {}),
    ...(o.context ? { contexto: o.context } : {}),
    ...(o.sensitive !== undefined ? { sensivel: o.sensitive } : {}),
    ...(o.maskPii !== undefined ? { mascararPii: o.maskPii } : {}),
    ...(o.route ? { rota: o.route } : {}),
    ...(o.model ? { modelo: o.model } : {}),
  };
}

/** Objeto validado por Zod ou lança AiError (AiNotConfiguredError, AiRateLimitError, AiTimeoutError...). */
export async function completeStructured<T>(o: CompleteStructuredOptions<T>): Promise<T> {
  const r = await ia.gerarJson({ ...paraOpcoesBase(o), schema: o.schema, ...(o.validate ? { validar: o.validate } : {}) });
  if (r.ok) return r.dados;
  throw erroIaDeFalha(r);
}

export async function completeVision<T>(o: CompleteVisionOptions<T>): Promise<T> {
  const r = await ia.visaoJson({
    ...paraOpcoesBase(o),
    schema: o.schema,
    imagens: o.images,
    ...(o.validate ? { validar: o.validate } : {}),
  });
  if (r.ok) return r.dados;
  throw erroIaDeFalha(r);
}

export async function completeText(o: CompleteTextOptions): Promise<string> {
  const r = await ia.gerarTexto({ ...paraOpcoesBase(o), ...(o.validate ? { validar: o.validate } : {}) });
  if (r.ok) return r.dados;
  throw erroIaDeFalha(r);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './tipos.js';
export {
  AiDisabledError,
  AiError,
  AiInvalidResponseError,
  AiNotConfiguredError,
  AiPayloadTooLargeError,
  AiRateLimitError,
  AiTimeoutError,
  AiUnavailableError,
  ErroProvedorIa,
  MENSAGEM_IA,
  STATUS_HTTP_IA,
  erroDeDominioIa,
  erroIaDeFalha,
} from './erros.js';
export {
  CLAUSULA_DADOS_NAO_CONFIAVEIS,
  CLAUSULA_IMAGENS,
  blocoDados,
  contemInstrucao,
  escaparDelimitadores,
  limparTexto,
  montarPrompt,
  pareceInstrucao,
} from './sanitizacao.js';
export {
  classificarColunaSensivel,
  ehColunaSensivel,
  mascararPII,
  mascararPIIComContagem,
  perfilAmostra,
  perfilValor,
  redigirParaLog,
} from './pii.js';
export { chavesDe, camposPreenchidos, extrairJson, type ResultadoExtracaoJson } from './json.js';
export { chunk, comIds, dividirEmLotes, lerPorId, mapWithConcurrency, type ItensComId } from './lotes.js';
export {
  calibrarConfianca,
  confiancaSchema,
  decisaoSchema,
  enumDeOpcoes,
  motivoSchema,
  normalizarConfianca,
  type AcaoCalibrada,
  type DecisaoBruta,
  type OpcoesCalibracao,
} from './decisao.js';
export {
  cnhValida,
  cnpjValido,
  cpfValido,
  normalizarPlaca,
  paisDaPlaca,
  placaBrasileiraValida,
  type InfoPlaca,
  type PaisPlaca,
} from './validadores.js';
export { conferirCitacoes, conferirPlacas, extrairNumeros, extrairPlacas, numerosDe, type OpcoesConferencia } from './grounding.js';
export { CacheLru, chaveCache, jsonCanonico, sha256, type AdaptadorCachePersistente } from './cache.js';
export {
  CATALOGO_MODELOS,
  RESERVA_RAPIDO,
  RESERVA_TEXTO,
  RESERVA_VISAO,
  capacidadesModelo,
  custoEstimadoUsd,
  dimensoesImagem,
  verificarImagens,
  type CapacidadesModelo,
  type VerificacaoImagens,
} from './modelos.js';
export { FAMILIAS_IA, POLITICAS_PADRAO, criarConfigIa, familiaDaTarefa, type ConfigIa, type FamiliaIa, type PoliticaFamilia } from './config.js';
export { AcumuladorUsoIa, type ResumoUsoIa, type SnapshotUsoIa } from './uso.js';
export {
  ServicoIa,
  classificarErroProvedor,
  compararLeituras,
  criarServicoIa,
  seedDaTarefa,
  type DependenciasServicoIa,
  type SnapshotServicoIa,
  type StatusFamiliaIa,
  type StatusIa,
} from './servico.js';
export { criarProvedorFalso, erroHttpFalso, respostaQueTrava, type ItemRespostaFalsa, type ProvedorFalso } from './testes.js';
export { registrarAuditoriaIa, type EntradaAuditoriaIa } from './persistencia.js';
