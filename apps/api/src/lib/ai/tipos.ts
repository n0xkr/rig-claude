import type { z } from 'zod';

/**
 * Tipos públicos da camada única de IA (`lib/ai`). Todas as features (OCR,
 * importação, solicitações, insights, chatbot, risco) falam a mesma língua:
 * uma união discriminada `ResultadoIa<T>` que NUNCA é lançada como exceção —
 * quem chama só decide o fallback determinístico com um `if (!r.ok)`.
 */

/** Motivos padronizados de falha, comuns a todas as features. */
export const MOTIVOS_FALHA_IA = [
  'NAO_CONFIGURADA', // sem GROQ_API_KEY (ou desligada automaticamente sob vitest)
  'DESABILITADA', // kill switch global/da família/da tarefa (ex.: IA_OCR_HABILITADO=false)
  'COTA_EXCEDIDA', // cota diária (usuário/tarefa ou global) esgotada
  'LIMITE_TAXA', // muitas chamadas por minuto (nossa) ou 429 da Groq
  'TIMEOUT', // a chamada passou do prazo da tarefa
  'PRAZO_ESGOTADO', // o prazo total da requisição (contexto) acabou ou foi cancelado
  'PAYLOAD_GRANDE', // imagens/entrada acima do limite do modelo (checado ANTES de chamar)
  'ENTRADA_INVALIDA', // formato de entrada não suportado (ex.: imagem HEIC, nenhuma imagem)
  'SAIDA_TRUNCADA', // finish_reason "length" mesmo após aumentar max_tokens
  'RESPOSTA_INVALIDA', // JSON/schema/validação semântica falharam mesmo após 1 reparo
  'INDISPONIVEL', // 5xx/rede, nenhum modelo disponível ou disjuntor aberto
  'ERRO', // falha inesperada (bug ou erro não classificado)
] as const;
export type MotivoFalhaIa = (typeof MOTIVOS_FALHA_IA)[number];

/** Rota de modelos: texto "grande" (insights/chat), texto rápido (classificar/mapear) ou visão. */
export type RotaModelo = 'texto' | 'rapido' | 'visao';
/** `reasoning_effort` dos modelos de raciocínio (openai/gpt-oss-*). */
export type EsforcoRaciocinio = 'low' | 'medium' | 'high';
export type EstadoCache = 'hit' | 'miss' | 'off';
/** Origem padronizada de um resultado exibido ao usuário. */
export type OrigemIa = 'IA' | 'REGRAS' | 'IA+REGRAS';

/** O que aconteceu com a entrada antes de ir ao modelo — nunca há truncamento silencioso. */
export interface RelatorioEntrada {
  truncado: boolean;
  /** Itens de listas que ficaram de fora por limite de itens/caracteres. */
  itensOmitidos: number;
  /** Textos encurtados por limite de caracteres por campo. */
  textosCortados: number;
  /** Textos/chaves removidos por parecerem instrução ao modelo (prompt injection). */
  suspeitosRemovidos: number;
  /** Dados pessoais mascarados (CPF, telefone, e-mail...) ou colunas sensíveis trocadas por formato. */
  piiMascarados: number;
  /** Avisos legíveis ("amostra: 3 de 120 itens"), no máximo 20. */
  avisos: string[];
}

/** Proveniência e custo de uma chamada (vai para logs, auditoria e `sugestao_ia`). */
export interface MetaIa {
  tarefa: string;
  versaoPrompt: string;
  /** Modelo que respondeu (null se nenhum chegou a responder). */
  modelo: string | null;
  modelosTentados: string[];
  latenciaMs: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoEstimadoUsd: number;
  cache: EstadoCache;
  /** Requisições feitas ao provedor (inclui retentativas e o reparo). */
  chamadas: number;
  /** true quando a resposta só passou na validação após a tentativa de reparo. */
  reparado: boolean;
  finishReason: string | null;
  entrada: RelatorioEntrada;
  /** Problemas de validação (caminho: código), sem valores. */
  problemas: string[];
}

/** Segunda leitura (consenso) feita por outro modelo, para comparação campo a campo. */
export type SegundaLeituraIa<T> =
  | { ok: true; dados: T; modelo: string | null; divergencias: string[] }
  | { ok: false; motivo: MotivoFalhaIa };

export interface SucessoIa<T> {
  ok: true;
  dados: T;
  meta: MetaIa;
  segundaLeitura?: SegundaLeituraIa<T>;
}

export interface FalhaIa {
  ok: false;
  motivo: MotivoFalhaIa;
  /** Mensagem neutra em português, pronta para a interface. */
  mensagem: string;
  /** Quando o motivo é de limite: em quanto tempo vale tentar de novo. */
  retryAfterMs?: number;
  meta: MetaIa;
}

export type ResultadoIa<T> = SucessoIa<T> | FalhaIa;

// ---------------------------------------------------------------------------
// Provedor (transporte) — injetável para testes
// ---------------------------------------------------------------------------

export type ParteConteudoIa =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type MensagemIa =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ParteConteudoIa[] }
  | { role: 'assistant'; content: string };

export interface RequisicaoProvedorIa {
  modelo: string;
  mensagens: MensagemIa[];
  maxTokens: number;
  temperatura: number;
  seed?: number;
  /** `response_format: { type: 'json_object' }`. */
  formatoJson: boolean;
  /** Só enviado a modelos de raciocínio que aceitam o parâmetro. */
  esforcoRaciocinio?: EsforcoRaciocinio;
}

export interface UsoTokensIa {
  entrada: number;
  saida: number;
}

export interface RespostaProvedorIa {
  conteudo: string | null;
  finishReason: string | null;
  modelo: string;
  uso: UsoTokensIa | null;
}

export interface OpcoesChamadaProvedor {
  signal: AbortSignal;
  timeoutMs: number;
}

/**
 * Transporte de uma chamada de chat completion. Erros devem ser lançados como
 * `ErroProvedorIa` (ver `erros.ts`) — ou qualquer objeto com `status`/`message`,
 * que o serviço também sabe classificar.
 */
export interface ProvedorIa {
  readonly nome: string;
  completar(req: RequisicaoProvedorIa, opcoes: OpcoesChamadaProvedor): Promise<RespostaProvedorIa>;
}

/** Subconjunto do logger (pino) usado pela camada. */
export interface LoggerIa {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

// ---------------------------------------------------------------------------
// Opções das chamadas
// ---------------------------------------------------------------------------

/** Bloco de DADOS NÃO CONFIÁVEIS: serializado em JSON dentro de `<dados nome="...">`. */
export interface BlocoDadosIa {
  /** Identificador curto (letras, números, `_`/`-`), ex.: "snapshot", "pergunta", "amostra". */
  nome: string;
  valor: unknown;
  /** Máximo de itens por lista (padrão 200). */
  maxItens?: number;
  /** Máximo de caracteres por texto (padrão 500). */
  maxCharsPorCampo?: number;
  /** Máximo de caracteres do bloco serializado (reduz itens/textos estruturalmente até caber). */
  maxChars?: number;
  /** Sobrescreve `mascararPii` da chamada só para este bloco. */
  mascararPii?: boolean;
}

/** Contexto de requisição: usuário (cota), prazo total e acumulador de uso. */
export interface ContextoIa {
  usuarioId?: string | null;
  papel?: string | null;
  /** Epoch em ms: nenhuma chamada desta requisição passa deste instante. */
  prazoFinal?: number | null;
  signal?: AbortSignal | null;
  uso?: AcumuladorUsoLike;
}

/** Interface mínima do acumulador (implementação em `uso.ts`). */
export interface AcumuladorUsoLike {
  registrar(resultado: ResultadoIa<unknown>): void;
  adicionarNaoEnviados?(n: number): void;
}

export interface OpcoesBaseIa {
  /**
   * "familia.subtarefa" — a família (antes do ponto) define política, cota e
   * kill switch: ocr, importacao, solicitacoes, insights, chatbot, risco, geral.
   * Ex.: "ocr.cnh", "importacao.colunas", "insights.acompanhamento".
   */
  tarefa: string;
  /** Entra na chave de cache e na proveniência (padrão "v1"). Mude ao alterar o prompt. */
  versaoPrompt?: string;
  /** Instrução fixa do CÓDIGO. Nunca concatene aqui dado de planilha/OCR/usuário. */
  sistema: string;
  /** Pedido fixo do código que vai na mensagem do usuário, fora dos blocos de dados. */
  instrucao?: string;
  /** Atalho para um único bloco chamado "dados". */
  dados?: unknown;
  blocos?: BlocoDadosIa[];
  /** Orçamento de tokens da RESPOSTA (o de raciocínio é somado automaticamente). */
  maxTokens?: number;
  /** Padrão da família (0 a 0.2); limitado a [0, 1]. */
  temperatura?: number;
  /** Prazo desta chamada, incluindo retentativas (padrão da família). */
  timeoutMs?: number;
  /** Rota de texto: "rapido" (classificar/mapear) ou "texto" (insights). Padrão da família. */
  rota?: 'texto' | 'rapido';
  /** Modelo preferido: vai à frente da lista de reserva da rota. */
  modelo?: string;
  raciocinio?: EsforcoRaciocinio;
  /** TTL do cache em memória; 0 desliga. Omitido = padrão da família (OCR: desligado). */
  cacheTtlMs?: number;
  /** Tarefa com dado pessoal sensível (OCR de CNH/CRLV): sem cache persistente, log mínimo. */
  sensivel?: boolean;
  /** Mascara CPF/telefone/e-mail/... nas strings e troca colunas sensíveis por formato. Padrão da família. */
  mascararPii?: boolean;
  usuarioId?: string | null;
  contexto?: ContextoIa;
  signal?: AbortSignal;
  /** Tentativas de reparo quando JSON/schema/validação falham (padrão 1). */
  tentativasReparo?: 0 | 1;
}

export interface SegundaOpiniaoIa {
  /** Modelo da segunda leitura (padrão: o próximo da rota, diferente do que respondeu). */
  modelo?: string;
  /** Campos (chaves de 1º nível) a comparar; padrão: todos. */
  campos?: string[];
}

export interface OpcoesGerarJson<T> extends OpcoesBaseIa {
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Validação semântica/grounding: devolva a lista de problemas (vazia = ok). */
  validar?: (dados: T) => string[];
  segundaOpiniao?: SegundaOpiniaoIa;
}

export interface OpcoesVisaoJson<T> extends OpcoesGerarJson<T> {
  /** Data URLs (`data:image/jpeg;base64,...`). */
  imagens: string[];
}

export interface OpcoesGerarTexto extends OpcoesBaseIa {
  validar?: (texto: string) => string[];
}

/** Decisão normalizada (compatível com `SugestaoIa` do shared). */
export interface DecisaoIa<V extends string = string> {
  valor: V;
  confianca: number;
  motivo?: string;
}

export interface OpcaoIa<V extends string = string> {
  valor: V;
  rotulo: string;
}

export interface OpcoesEscolherOpcao<V extends string>
  extends Omit<OpcoesBaseIa, 'sistema' | 'instrucao'> {
  /** Contexto de domínio fixo do código (opcional). */
  sistema?: string;
  /** Pergunta fixa do código. O item a decidir vai em `dados`/`blocos`. */
  pergunta: string;
  opcoes: ReadonlyArray<OpcaoIa<V>>;
  /** Permite responder "nenhuma" (valor null). Padrão true. */
  permitirNenhuma?: boolean;
}

export interface OpcoesClassificarLote<V extends string>
  extends Omit<OpcoesBaseIa, 'sistema' | 'instrucao' | 'dados' | 'blocos'> {
  sistema?: string;
  /** O que decidir para cada item (texto fixo do código). */
  pergunta: string;
  itens: ReadonlyArray<{ chave: string; dados: unknown }>;
  opcoes: ReadonlyArray<OpcaoIa<V>>;
  permitirNenhuma?: boolean;
  /** Padrão 40. */
  maxItensPorLote?: number;
  /** Padrão 12000 caracteres de JSON por lote. */
  maxCharsPorLote?: number;
  /** Lotes em paralelo (padrão 2; o semáforo global ainda vale). */
  concorrencia?: number;
  /** Exclui itens com texto que parece instrução ao modelo (padrão true). */
  excluirSuspeitos?: boolean;
}

export interface ResultadoLoteIa<V extends string> {
  /** true quando ao menos um lote foi respondido pela IA. */
  ok: boolean;
  /** chave original → decisão válida (só valores das opções reais). */
  decisoes: Map<string, DecisaoIa<V>>;
  /** Chaves que não foram à IA (não couberam ou pareciam instrução). */
  naoEnviados: string[];
  suspeitos: number;
  lotes: number;
  lotesComFalha: number;
  falhas: Partial<Record<MotivoFalhaIa, number>>;
  /** Primeiro motivo de falha (útil quando nenhum lote respondeu). */
  motivo: MotivoFalhaIa | null;
  meta: {
    chamadas: number;
    tokensEntrada: number;
    tokensSaida: number;
    custoEstimadoUsd: number;
    latenciaMs: number;
    cacheHits: number;
    modelos: string[];
  };
}
