import { DomainError } from '../errors.js';
import type { FalhaIa, MetaIa, MotivoFalhaIa } from './tipos.js';

/**
 * Erros da camada de IA. A API principal (`gerarJson`, `visaoJson`, ...) não
 * lança: devolve `{ ok: false, motivo }`. Estas classes servem à API que lança
 * (`completeStructured`, wrappers legados de `groq.client.ts`) e ao mapeamento
 * padronizado para HTTP: como estendem `DomainError`, os controllers que já
 * tratam `DomainError` respondem com o status certo sem código extra.
 */

export const STATUS_HTTP_IA: Readonly<Record<MotivoFalhaIa, number>> = {
  NAO_CONFIGURADA: 503,
  DESABILITADA: 503,
  INDISPONIVEL: 503,
  COTA_EXCEDIDA: 429,
  LIMITE_TAXA: 429,
  TIMEOUT: 504,
  PRAZO_ESGOTADO: 504,
  PAYLOAD_GRANDE: 413,
  ENTRADA_INVALIDA: 422,
  SAIDA_TRUNCADA: 502,
  RESPOSTA_INVALIDA: 502,
  ERRO: 502,
};

/** Mensagens neutras (título) — nada de "análise de risco" num erro de OCR. */
export const MENSAGEM_IA: Readonly<Record<MotivoFalhaIa, string>> = {
  NAO_CONFIGURADA: 'Recurso de IA indisponível neste ambiente (IA não configurada)',
  DESABILITADA: 'Recurso de IA desligado pela administração',
  INDISPONIVEL: 'Recurso de IA indisponível no momento',
  COTA_EXCEDIDA: 'Cota diária de uso da IA atingida',
  LIMITE_TAXA: 'Muitas solicitações à IA em pouco tempo',
  TIMEOUT: 'A IA demorou demais para responder',
  PRAZO_ESGOTADO: 'O tempo disponível para a IA nesta operação acabou',
  PAYLOAD_GRANDE: 'Arquivos grandes demais para a leitura por IA',
  ENTRADA_INVALIDA: 'Formato de arquivo não suportado pela leitura por IA',
  SAIDA_TRUNCADA: 'A resposta da IA veio incompleta',
  RESPOSTA_INVALIDA: 'A IA respondeu fora do formato esperado',
  ERRO: 'Falha inesperada no recurso de IA',
};

/** Detalhe padrão (o "o que fazer"), em português. */
const DETALHE_IA: Readonly<Record<MotivoFalhaIa, string>> = {
  NAO_CONFIGURADA: 'A IA não está configurada neste servidor.',
  DESABILITADA: 'Este recurso de IA foi desligado nas configurações do servidor.',
  INDISPONIVEL: 'O serviço de IA não respondeu. Tente novamente em alguns minutos.',
  COTA_EXCEDIDA: 'O limite diário de uso da IA foi atingido. Ele é renovado à meia-noite (horário de Brasília).',
  LIMITE_TAXA: 'Aguarde alguns instantes e tente de novo.',
  TIMEOUT: 'Tente novamente; se persistir, use arquivos menores ou menos dados.',
  PRAZO_ESGOTADO: 'A operação levou tempo demais e a IA foi pulada.',
  PAYLOAD_GRANDE: 'Envie até 5 imagens, com no máximo cerca de 4 MB no total.',
  ENTRADA_INVALIDA: 'Use fotos JPEG, PNG ou WebP (PDFs são convertidos em imagem pelo navegador).',
  SAIDA_TRUNCADA: 'Tente com menos dados por vez.',
  RESPOSTA_INVALIDA: 'Tente novamente com dados mais nítidos ou mais simples.',
  ERRO: 'Tente novamente mais tarde.',
};

export class AiError extends DomainError {
  constructor(
    readonly motivo: MotivoFalhaIa,
    detail?: string,
    readonly meta?: MetaIa,
    readonly retryAfterMs?: number,
  ) {
    super(MENSAGEM_IA[motivo], STATUS_HTTP_IA[motivo], detail ?? DETALHE_IA[motivo]);
    this.name = 'AiError';
  }
}

/**
 * IA não configurada (503). `GroqNotConfiguredError` de `groq.client.ts` é um
 * alias desta classe, então `instanceof GroqNotConfiguredError` continua
 * funcionando para os controllers legados.
 */
export class AiNotConfiguredError extends AiError {
  constructor(
    detail?: string,
    meta?: MetaIa,
    motivo: 'NAO_CONFIGURADA' | 'DESABILITADA' = 'NAO_CONFIGURADA',
  ) {
    super(motivo, detail, meta);
    this.name = 'AiNotConfiguredError';
  }
}

/** Kill switch ligado (503). Subclasse de AiNotConfiguredError: o legado trata igual. */
export class AiDisabledError extends AiNotConfiguredError {
  constructor(detail?: string, meta?: MetaIa) {
    super(detail, meta, 'DESABILITADA');
    this.name = 'AiDisabledError';
  }
}

/** Limite por minuto ou cota diária (429). */
export class AiRateLimitError extends AiError {
  constructor(
    motivo: 'LIMITE_TAXA' | 'COTA_EXCEDIDA' = 'LIMITE_TAXA',
    detail?: string,
    meta?: MetaIa,
    retryAfterMs?: number,
  ) {
    super(motivo, detail, meta, retryAfterMs);
    this.name = 'AiRateLimitError';
  }
}

/** Timeout da chamada ou prazo da requisição esgotado (504). */
export class AiTimeoutError extends AiError {
  constructor(motivo: 'TIMEOUT' | 'PRAZO_ESGOTADO' = 'TIMEOUT', detail?: string, meta?: MetaIa) {
    super(motivo, detail, meta);
    this.name = 'AiTimeoutError';
  }
}

/** Entrada acima do limite do modelo (413) ou formato não suportado (422). */
export class AiPayloadTooLargeError extends AiError {
  constructor(
    motivo: 'PAYLOAD_GRANDE' | 'ENTRADA_INVALIDA' = 'PAYLOAD_GRANDE',
    detail?: string,
    meta?: MetaIa,
  ) {
    super(motivo, detail, meta);
    this.name = 'AiPayloadTooLargeError';
  }
}

/** Resposta fora do formato ou truncada (502). */
export class AiInvalidResponseError extends AiError {
  constructor(
    motivo: 'RESPOSTA_INVALIDA' | 'SAIDA_TRUNCADA' = 'RESPOSTA_INVALIDA',
    detail?: string,
    meta?: MetaIa,
  ) {
    super(motivo, detail, meta);
    this.name = 'AiInvalidResponseError';
  }
}

/** Provedor fora do ar, disjuntor aberto ou nenhum modelo disponível (503). */
export class AiUnavailableError extends AiError {
  constructor(detail?: string, meta?: MetaIa, retryAfterMs?: number) {
    super('INDISPONIVEL', detail, meta, retryAfterMs);
    this.name = 'AiUnavailableError';
  }
}

interface FalhaResumida {
  motivo: MotivoFalhaIa;
  meta?: MetaIa;
  retryAfterMs?: number;
}

/** Converte uma falha (`{ ok: false }`) na exceção tipada correspondente. */
export function erroIaDeFalha(falha: FalhaResumida, detail?: string): AiError {
  const { motivo, meta, retryAfterMs } = falha;
  switch (motivo) {
    case 'NAO_CONFIGURADA':
      return new AiNotConfiguredError(detail, meta);
    case 'DESABILITADA':
      return new AiDisabledError(detail, meta);
    case 'LIMITE_TAXA':
    case 'COTA_EXCEDIDA':
      return new AiRateLimitError(motivo, detail, meta, retryAfterMs);
    case 'TIMEOUT':
    case 'PRAZO_ESGOTADO':
      return new AiTimeoutError(motivo, detail, meta);
    case 'PAYLOAD_GRANDE':
    case 'ENTRADA_INVALIDA':
      return new AiPayloadTooLargeError(motivo, detail, meta);
    case 'RESPOSTA_INVALIDA':
    case 'SAIDA_TRUNCADA':
      return new AiInvalidResponseError(motivo, detail, meta);
    case 'INDISPONIVEL':
      return new AiUnavailableError(detail, meta, retryAfterMs);
    default:
      return new AiError(motivo, detail, meta, retryAfterMs);
  }
}

/**
 * Mapeamento padronizado de falha → `DomainError` (503/504/429/413/422/502)
 * com mensagem em português e o fallback para o usuário, ex.:
 * `throw erroDeDominioIa(r, { recurso: 'A leitura automática do documento', fallback: 'Preencha os dados manualmente.' })`.
 */
export function erroDeDominioIa(
  falha: FalhaIa | FalhaResumida | MotivoFalhaIa,
  opcoes: { recurso?: string; fallback?: string } = {},
): AiError {
  const f: FalhaResumida = typeof falha === 'string' ? { motivo: falha } : falha;
  const partes = [
    opcoes.recurso ? `${opcoes.recurso} não pôde ser concluída.` : null,
    DETALHE_IA[f.motivo],
    opcoes.fallback ?? null,
  ].filter((p): p is string => Boolean(p));
  return erroIaDeFalha(f, partes.join(' '));
}

export type TipoErroProvedor = 'http' | 'timeout' | 'rede' | 'abortado' | 'desconhecido';

/**
 * Erro normalizado do transporte. `mensagem` já vem curta e sem dados (o
 * provedor Groq mascara e limita o texto); o objeto de erro bruto do SDK nunca
 * é guardado, pois pode trazer `failed_generation` com conteúdo do documento.
 */
export class ErroProvedorIa extends Error {
  constructor(
    readonly tipo: TipoErroProvedor,
    mensagem: string,
    readonly status?: number,
    readonly codigo?: string,
    readonly retryAfterMs?: number,
  ) {
    super(mensagem);
    this.name = 'ErroProvedorIa';
  }
}
