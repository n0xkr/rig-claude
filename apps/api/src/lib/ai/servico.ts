import { z } from 'zod';
import { CacheLru, chaveCache, jsonCanonico, sha256, type AdaptadorCachePersistente } from './cache.js';
import { FAMILIAS_IA, familiaDaTarefa, type ConfigIa, type FamiliaIa, type PoliticaFamilia } from './config.js';
import { Disjuntor, LimitadorIa, Semaforo, type EstadoDisjuntor } from './controle.js';
import { decisaoSchema } from './decisao.js';
import { ErroProvedorIa, MENSAGEM_IA } from './erros.js';
import { chavesDe, extrairJson } from './json.js';
import { comIds, dividirEmLotes, lerPorId, mapWithConcurrency } from './lotes.js';
import { capacidadesModelo, custoEstimadoUsd, listaDeModelos, verificarImagens, type CapacidadesModelo } from './modelos.js';
import { mascararPII } from './pii.js';
import { contemInstrucao, montarPrompt, pareceInstrucao, relatorioVazio, type PromptMontado } from './sanitizacao.js';
import { AcumuladorUsoIa, RegistroUso, type RegistroUsoIa, type SnapshotUsoIa } from './uso.js';
import type {
  ContextoIa,
  DecisaoIa,
  EsforcoRaciocinio,
  LoggerIa,
  MensagemIa,
  MetaIa,
  MotivoFalhaIa,
  OpcoesBaseIa,
  OpcoesClassificarLote,
  OpcoesEscolherOpcao,
  OpcoesGerarJson,
  OpcoesGerarTexto,
  OpcoesVisaoJson,
  ParteConteudoIa,
  ProvedorIa,
  RequisicaoProvedorIa,
  RespostaProvedorIa,
  ResultadoIa,
  ResultadoLoteIa,
  RotaModelo,
  SegundaLeituraIa,
} from './tipos.js';

/**
 * AIService — a camada única de IA da API. Pipeline de cada chamada:
 *
 *   disponibilidade (chave/kill switch) → checagem de imagens → prompt seguro
 *   (system fixo + blocos <dados>) → cache LRU → cota/rate limit → disjuntor →
 *   prazo (AbortController) → semáforos → modelos em ordem de reserva, com
 *   retry/backoff (429/5xx/rede), 1 reparo de JSON/schema e aumento de
 *   max_tokens em finish_reason "length" → validação Zod (+ hook `validar`)
 *   → contabilidade/log sem conteúdo.
 *
 * Nunca lança: devolve `ResultadoIa<T>`. Sem provedor (sem GROQ_API_KEY, ou
 * sob vitest sem opt-in) tudo responde `NAO_CONFIGURADA` na hora e o chamador
 * segue com as regras determinísticas.
 */

export interface DependenciasServicoIa {
  config: ConfigIa;
  provedor: ProvedorIa | null;
  /** Por que não há provedor (só para diagnóstico em `status()`). */
  motivoSemProvedor?: string;
  logger?: LoggerIa | null;
  agora?: () => number;
  dormir?: (ms: number, signal: AbortSignal) => Promise<void>;
  aleatorio?: () => number;
  cachePersistente?: AdaptadorCachePersistente | null;
  persistirUso?: ((r: RegistroUsoIa) => Promise<void>) | null;
}

export interface StatusFamiliaIa {
  disponivel: boolean;
  motivo: MotivoFalhaIa | null;
  /** Rótulo pronto para a interface. */
  rotulo: 'IA + regras' | 'Regras';
}

export interface StatusIa {
  configurada: boolean;
  habilitada: boolean;
  provedor: string | null;
  motivoSemProvedor: string | null;
  familias: Record<FamiliaIa, StatusFamiliaIa>;
  modelos: ConfigIa['modelos'];
  disjuntores: { texto: EstadoDisjuntor; visao: EstadoDisjuntor };
}

export interface SnapshotServicoIa extends SnapshotUsoIa {
  limites: ReturnType<LimitadorIa['estado']>;
  disjuntores: { texto: EstadoDisjuntor; visao: EstadoDisjuntor };
  cache: { entradas: number };
}

type SaidaValidada<T> = { ok: true; dados: T } | { ok: false; problemas: string[]; paraModelo: string[] };

interface Execucao<T> {
  op: OpcoesBaseIa;
  modo: 'json' | 'texto';
  interpretar: (conteudo: string) => SaidaValidada<T>;
  /** Revalida um valor vindo do cache persistente. */
  revalidar: (valor: unknown) => { ok: true; dados: T } | { ok: false };
  imagens?: string[];
  modelosForcados?: string[];
  semCache?: boolean;
}

interface EstadoExecucao {
  provedor: ProvedorIa;
  modelos: string[];
  rota: RotaModelo;
  politica: PoliticaFamilia;
  prompt: PromptMontado;
  meta: MetaIa;
  sinal: AbortSignal;
  prazoFinal: number;
  motivoAbort: () => MotivoFalhaIa;
}

type FimChamada<T> =
  | { ok: true; dados: T }
  | { ok: false; motivo: MotivoFalhaIa; retryAfterMs?: number; contaNoDisjuntor: boolean };

type ClasseErro =
  | 'modelo_indisponivel'
  | 'parametro'
  | 'json_gerado_invalido'
  | 'limite_taxa'
  | 'transitorio'
  | 'payload'
  | 'autenticacao'
  | 'abortado'
  | 'outro';

interface ErroClassificado {
  classe: ClasseErro;
  codigo: string;
  retryAfterMs?: number;
  timeout: boolean;
}

/** Classifica qualquer erro de transporte (ErroProvedorIa, erro do SDK ou objeto `{status}` de um fake). */
export function classificarErroProvedor(err: unknown): ErroClassificado {
  const e = (err ?? {}) as { tipo?: unknown; status?: unknown; codigo?: unknown; code?: unknown; message?: unknown; retryAfterMs?: unknown; name?: unknown };
  const tipo =
    err instanceof ErroProvedorIa
      ? err.tipo
      : e.name === 'AbortError'
        ? 'abortado'
        : typeof e.status === 'number'
          ? 'http'
          : 'desconhecido';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const codigo = String(e.codigo ?? e.code ?? (status !== undefined ? `http_${status}` : tipo)).slice(0, 60);
  const texto = `${codigo} ${String(e.message ?? '')}`;
  const retryAfterMs = typeof e.retryAfterMs === 'number' && Number.isFinite(e.retryAfterMs) ? e.retryAfterMs : undefined;
  const r = (classe: ClasseErro, timeout = false): ErroClassificado => ({
    classe,
    codigo,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    timeout,
  });

  if (tipo === 'abortado') return r('abortado');
  if (tipo === 'timeout') return r('transitorio', true);
  if (tipo === 'rede') return r('transitorio');
  if (status === 404 || /model_not_found|model_decommissioned|decommission|does not exist|no such model|unknown model/i.test(texto)) {
    return r('modelo_indisponivel');
  }
  if (status === 400 && /json_validate_failed|failed to generate json|failed_generation/i.test(texto)) return r('json_gerado_invalido');
  if (
    status === 413 ||
    (status === 400 &&
      /request_too_large|too large|exceeds? .*(size|limit|pixels)|maximum .*(size|pixels|images)|context.?length|context window|too many tokens|reduce the length/i.test(texto))
  ) {
    return r('payload');
  }
  if (status === 400 && /(image|vision|multimodal).*(not support|unsupported)|(not support|unsupported).*(image|vision)/i.test(texto)) {
    return r('modelo_indisponivel');
  }
  if (status === 400 && /reasoning_effort|\bseed\b|unsupported (parameter|value|property)|not supported|unknown (parameter|field)|unrecognized/i.test(texto)) {
    return r('parametro');
  }
  if (status === 429) return r('limite_taxa');
  if (status === 401) return r('autenticacao');
  if (status === 403) return r(/model/i.test(texto) ? 'modelo_indisponivel' : 'autenticacao');
  if (status !== undefined && (status === 408 || status === 409 || status === 425 || status === 498 || status >= 500)) {
    return r('transitorio');
  }
  return r('outro');
}

const RESERVA_RACIOCINIO: Record<EsforcoRaciocinio, number> = { low: 1024, medium: 2048, high: 4096 };

/** Seed fixo por tarefa (FNV-1a de 31 bits): mesma tarefa + mesma entrada → mesma saída. */
export function seedDaTarefa(tarefa: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tarefa.length; i++) {
    h ^= tarefa.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2_147_483_647;
}

const limitar = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

const caminhoZod = (path: ReadonlyArray<string | number>) => (path.length ? path.join('.') : '(raiz)');

function interpretarJson<T>(
  conteudo: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  validar?: (dados: T) => string[],
): SaidaValidada<T> {
  const ext = extrairJson(conteudo);
  if (!ext.ok) {
    return {
      ok: false,
      problemas: [`json: ${ext.erro}`],
      paraModelo: [ext.erro === 'vazio' ? 'A resposta veio vazia.' : 'A resposta não era um objeto JSON válido.'],
    };
  }
  const p = schema.safeParse(ext.valor);
  if (!p.success) {
    const issues = p.error.issues.slice(0, 12);
    return {
      ok: false,
      problemas: issues.map((i) => `${caminhoZod(i.path)}: ${i.code}`),
      paraModelo: issues.map((i) => `${caminhoZod(i.path)}: ${i.message}`),
    };
  }
  return aplicarValidar(p.data, validar);
}

function aplicarValidar<T>(dados: T, validar?: (dados: T) => string[]): SaidaValidada<T> {
  if (!validar) return { ok: true, dados };
  let problemas: string[];
  try {
    problemas = validar(dados).filter((p) => typeof p === 'string' && p.trim() !== '');
  } catch {
    problemas = ['validação semântica falhou'];
  }
  return problemas.length ? { ok: false, problemas, paraModelo: problemas } : { ok: true, dados };
}

function mensagemReparo(problemas: string[], modo: 'json' | 'texto'): string {
  const lista = problemas
    .slice(0, 10)
    .map((p) => `- ${p.slice(0, 300)}`)
    .join('\n');
  return `Sua resposta anterior foi rejeitada pela validação automática:\n${lista}\nResponda novamente ${
    modo === 'json' ? 'SOMENTE com o objeto JSON corrigido' : 'somente com o texto corrigido'
  }, no formato pedido, sem inventar dados e sem comentários.`;
}

const normalizarParaComparar = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return jsonCanonico(v);
};

/** Campos (1º nível) em que duas leituras divergem — comparação tolerante a caixa, acento e pontuação. */
export function compararLeituras(a: unknown, b: unknown, campos?: readonly string[]): string[] {
  const oa = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  const ob = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const chaves = campos?.length ? [...campos] : [...new Set([...Object.keys(oa), ...Object.keys(ob)])];
  return chaves.filter((k) => normalizarParaComparar(oa[k]) !== normalizarParaComparar(ob[k]));
}

const dormirPadrao = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('abortado'));
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('abortado'));
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

function clonar<V>(v: V): V | undefined {
  try {
    return structuredClone(v);
  } catch {
    return undefined;
  }
}

const SISTEMA_ESCOLHA =
  'Você é um classificador cuidadoso de um sistema de gestão de transportes (TMS) de uma transportadora rodoviária internacional. Decida só com base nos dados recebidos e nunca invente opções. Responda em JSON.';

export class ServicoIa {
  private readonly config: ConfigIa;
  private provedorAtual: ProvedorIa | null;
  private readonly provedorOriginal: ProvedorIa | null;
  private readonly motivoSemProvedor: string | null;
  private readonly logger: LoggerIa | null;
  private readonly agora: () => number;
  private readonly dormir: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly aleatorio: () => number;
  private readonly cachePersistente: AdaptadorCachePersistente | null;
  private readonly persistirUso: ((r: RegistroUsoIa) => Promise<void>) | null;

  private readonly cache: CacheLru<{ dados: unknown; modelo: string | null }>;
  private readonly limitador: LimitadorIa;
  private readonly disjuntores: { texto: Disjuntor; visao: Disjuntor };
  private readonly semaforoGlobal: Semaforo;
  private readonly semaforos = new Map<FamiliaIa, Semaforo>();
  private readonly registro = new RegistroUso();

  constructor(deps: DependenciasServicoIa) {
    this.config = deps.config;
    this.provedorAtual = deps.provedor;
    this.provedorOriginal = deps.provedor;
    this.motivoSemProvedor = deps.provedor ? null : (deps.motivoSemProvedor ?? 'GROQ_API_KEY ausente');
    this.logger = deps.logger ?? null;
    this.agora = deps.agora ?? Date.now;
    this.dormir = deps.dormir ?? dormirPadrao;
    this.aleatorio = deps.aleatorio ?? Math.random;
    this.cachePersistente = deps.cachePersistente ?? null;
    this.persistirUso = deps.persistirUso ?? null;
    this.cache = new CacheLru(this.config.cacheMaxEntradas, this.agora);
    this.limitador = new LimitadorIa(
      {
        limiteDaFamilia: (f) => {
          const p = this.config.politicas[f as FamiliaIa] ?? this.config.politicas.geral;
          return { porMinuto: p.porMinuto, porDia: p.porDia };
        },
        diaGlobal: this.config.limiteDiaGlobal,
        tokensDiaGlobal: this.config.tokensDiaGlobal,
      },
      this.agora,
    );
    this.disjuntores = {
      texto: new Disjuntor(this.config.disjuntorFalhas, this.config.disjuntorPausaMs, this.agora),
      visao: new Disjuntor(this.config.disjuntorFalhas, this.config.disjuntorPausaMs, this.agora),
    };
    this.semaforoGlobal = new Semaforo(Math.max(1, this.config.concorrenciaGlobal));
  }

  // -------------------------------------------------------------------------
  // Injeção para testes e estado
  // -------------------------------------------------------------------------

  /** Troca o provedor (ex.: `criarProvedorFalso` no vitest). `null` desliga a IA. */
  setProvider(provedor: ProvedorIa | null): void {
    this.provedorAtual = provedor;
  }

  /** Volta ao provedor com que o serviço foi criado. */
  restaurarProvedor(): void {
    this.provedorAtual = this.provedorOriginal;
  }

  /** Zera cache, limites, disjuntores e contadores (testes). */
  resetar(): void {
    this.cache.clear();
    this.limitador.resetar();
    this.disjuntores.texto.resetar();
    this.disjuntores.visao.resetar();
    this.registro.resetar();
  }

  /** NAO_CONFIGURADA / DESABILITADA quando a tarefa não pode usar IA; null se pode. */
  motivoIndisponivel(tarefa?: string): 'NAO_CONFIGURADA' | 'DESABILITADA' | null {
    if (!this.provedorAtual) return 'NAO_CONFIGURADA';
    if (!this.config.habilitada) return 'DESABILITADA';
    if (tarefa) {
      const familia = familiaDaTarefa(tarefa);
      const t = tarefa.trim().toLowerCase();
      const prefixo = t.split('.')[0] ?? t;
      if (
        this.config.familiasDesligadas.has(familia) ||
        this.config.tarefasDesligadas.has(t) ||
        this.config.tarefasDesligadas.has(prefixo) ||
        this.config.tarefasDesligadas.has(familia)
      ) {
        return 'DESABILITADA';
      }
    }
    return null;
  }

  /** A UI pode mostrar o botão de IA desta tarefa? (configurada, ligada e disjuntor fechado). */
  disponivel(tarefa?: string): boolean {
    if (this.motivoIndisponivel(tarefa)) return false;
    if (!tarefa) return true;
    return this.disjuntorDaFamilia(familiaDaTarefa(tarefa)).estado() !== 'aberto';
  }

  status(): StatusIa {
    const familias = {} as Record<FamiliaIa, StatusFamiliaIa>;
    for (const f of FAMILIAS_IA) {
      const motivo: MotivoFalhaIa | null =
        this.motivoIndisponivel(`${f}.status`) ?? (this.disjuntorDaFamilia(f).estado() === 'aberto' ? 'INDISPONIVEL' : null);
      familias[f] = { disponivel: motivo === null, motivo, rotulo: motivo === null ? 'IA + regras' : 'Regras' };
    }
    return {
      configurada: this.provedorAtual !== null,
      habilitada: this.config.habilitada,
      provedor: this.provedorAtual?.nome ?? null,
      motivoSemProvedor: this.provedorAtual ? null : this.motivoSemProvedor,
      familias,
      modelos: { texto: [...this.config.modelos.texto], rapido: [...this.config.modelos.rapido], visao: [...this.config.modelos.visao] },
      disjuntores: { texto: this.disjuntores.texto.estado(), visao: this.disjuntores.visao.estado() },
    };
  }

  usoSnapshot(): SnapshotServicoIa {
    return {
      ...this.registro.snapshot(),
      limites: this.limitador.estado(),
      disjuntores: { texto: this.disjuntores.texto.estado(), visao: this.disjuntores.visao.estado() },
      cache: { entradas: this.cache.tamanho },
    };
  }

  /** Contexto de requisição: usuário, prazo total e acumulador de uso (`contexto.uso.resumo()`). */
  criarContexto(
    o: { usuarioId?: string | null; papel?: string | null; prazoMs?: number; signal?: AbortSignal | null } = {},
  ): ContextoIa & { uso: AcumuladorUsoIa } {
    return {
      usuarioId: o.usuarioId ?? null,
      papel: o.papel ?? null,
      prazoFinal: o.prazoMs && o.prazoMs > 0 ? this.agora() + o.prazoMs : null,
      signal: o.signal ?? null,
      uso: new AcumuladorUsoIa(),
    };
  }

  // -------------------------------------------------------------------------
  // API pública (nunca lança)
  // -------------------------------------------------------------------------

  /** JSON validado por Zod (+ `validar`), com 1 reparo. */
  async gerarJson<T>(op: OpcoesGerarJson<T>): Promise<ResultadoIa<T>> {
    const r = await this.executar(this.execucaoJson(op));
    return this.aplicarSegundaOpiniao(op, r);
  }

  /** Mesmo contrato de `gerarJson`, lendo imagens (data URLs) com o modelo de visão. */
  async visaoJson<T>(op: OpcoesVisaoJson<T>): Promise<ResultadoIa<T>> {
    const r = await this.executar({ ...this.execucaoJson(op), imagens: op.imagens });
    return this.aplicarSegundaOpiniao(op, r, op.imagens);
  }

  /** Texto livre (chatbot), com hook `validar` para grounding. */
  async gerarTexto(op: OpcoesGerarTexto): Promise<ResultadoIa<string>> {
    return this.executar<string>({
      op,
      modo: 'texto',
      interpretar: (conteudo) => {
        const texto = conteudo.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!texto) return { ok: false, problemas: ['texto: vazio'], paraModelo: ['A resposta veio vazia.'] };
        return aplicarValidar(texto, op.validar);
      },
      revalidar: (v) => (typeof v === 'string' && v ? { ok: true, dados: v } : { ok: false }),
    });
  }

  /**
   * Escolhe UMA opção entre as reais (z.enum dinâmico). `dados: null` = a IA
   * não soube ou respondeu fora das opções.
   */
  async escolherOpcao<V extends string>(op: OpcoesEscolherOpcao<V>): Promise<ResultadoIa<DecisaoIa<V> | null>> {
    const { pergunta, opcoes, permitirNenhuma = true, sistema, blocos, ...resto } = op;
    const valores = [...new Set(opcoes.map((o) => o.valor))];
    const r = await this.gerarJson({
      ...resto,
      sistema: [sistema?.trim(), SISTEMA_ESCOLHA].filter(Boolean).join('\n\n'),
      instrucao: `${pergunta.trim()}\n\nEscolha UMA opção do bloco "opcoes" (use exatamente o campo "valor")${
        permitirNenhuma ? '; se nenhuma servir ou faltar evidência, use null' : ''
      }. Responda em JSON: {"valor": "<valor>"${permitirNenhuma ? ' | null' : ''}, "confianca": número de 0 a 1, "motivo": "curto, em português"}.`,
      blocos: [{ nome: 'opcoes', valor: opcoes.map((o) => ({ valor: o.valor, rotulo: o.rotulo })), maxItens: 500 }, ...(blocos ?? [])],
      schema: decisaoSchema(valores, { permitirNulo: permitirNenhuma }),
    });
    if (!r.ok) return r;
    const d = r.dados;
    return {
      ok: true,
      meta: r.meta,
      dados: d.valor === null ? null : { valor: d.valor, confianca: d.confianca, ...(d.motivo ? { motivo: d.motivo } : {}) },
    };
  }

  /**
   * Classifica muitos itens em lotes (ids curtos, orçamento de caracteres,
   * paralelismo limitado). Itens que parecem instrução são excluídos e
   * contados; lote truncado (SAIDA_TRUNCADA) é dividido ao meio uma vez.
   * A `chave` NÃO vai ao modelo: inclua em `dados` o que a IA precisa ver.
   */
  async classificarLote<V extends string>(op: OpcoesClassificarLote<V>): Promise<ResultadoLoteIa<V>> {
    const inicio = this.agora();
    const {
      pergunta,
      itens,
      opcoes,
      permitirNenhuma = true,
      sistema,
      maxItensPorLote = 40,
      maxCharsPorLote = 12_000,
      concorrencia = 2,
      excluirSuspeitos = true,
      ...resto
    } = op;
    const res: ResultadoLoteIa<V> = {
      ok: false,
      decisoes: new Map(),
      naoEnviados: [],
      suspeitos: 0,
      lotes: 0,
      lotesComFalha: 0,
      falhas: {},
      motivo: null,
      meta: { chamadas: 0, tokensEntrada: 0, tokensSaida: 0, custoEstimadoUsd: 0, latenciaMs: 0, cacheHits: 0, modelos: [] },
    };
    const indisponivel = this.motivoIndisponivel(op.tarefa);
    if (indisponivel) {
      res.motivo = indisponivel;
      res.naoEnviados = itens.map((i) => i.chave);
      return res;
    }

    const aceitos: Array<{ chave: string; dados: unknown }> = [];
    for (const it of itens) {
      if (excluirSuspeitos && (pareceInstrucao(it.chave) || contemInstrucao(it.dados))) {
        res.suspeitos++;
        res.naoEnviados.push(it.chave);
      } else aceitos.push(it);
    }
    const comId = comIds(aceitos);
    const enviaveis = comId.payload.map((p) => ({ id: p.id, dados: p.dados.dados }));
    const { lotes, omitidos } = dividirEmLotes(enviaveis, { maxChars: maxCharsPorLote, maxItens: maxItensPorLote });
    for (const o of omitidos) res.naoEnviados.push(comId.porId.get(o.id)!.chave);
    op.contexto?.uso?.adicionarNaoEnviados?.(res.suspeitos + omitidos.length);

    const valores = [...new Set(opcoes.map((o) => o.valor))];
    const schemaLote = z.object({ decisoes: z.record(decisaoSchema(valores, { permitirNulo: true })) });
    const sistemaFinal = [sistema?.trim(), SISTEMA_ESCOLHA].filter(Boolean).join('\n\n');
    const instrucao = `${pergunta.trim()}\n\nPara CADA item do bloco "itens" (identificado por "id"), escolha o "valor" de uma das opções do bloco "opcoes"${
      permitirNenhuma ? ', ou null quando nenhuma servir ou faltar evidência' : ''
    }. Responda em JSON: {"decisoes": {"<id>": {"valor": "<valor>"${
      permitirNenhuma ? ' | null' : ''
    }, "confianca": número de 0 a 1, "motivo": "curto"}}}. Use exatamente os ids recebidos e não crie ids.`;
    const blocoOpcoes = { nome: 'opcoes', valor: opcoes.map((o) => ({ valor: o.valor, rotulo: o.rotulo })), maxItens: 500 };

    const processar = async (lote: Array<{ id: string; dados: unknown }>, podeDividir: boolean): Promise<void> => {
      const r = await this.gerarJson({
        ...resto,
        sistema: sistemaFinal,
        instrucao,
        blocos: [blocoOpcoes, { nome: 'itens', valor: lote, maxItens: lote.length }],
        schema: schemaLote,
        maxTokens: resto.maxTokens ?? Math.min(4000, 150 + lote.length * 60),
      });
      res.meta.chamadas += r.meta.chamadas;
      res.meta.tokensEntrada += r.meta.tokensEntrada;
      res.meta.tokensSaida += r.meta.tokensSaida;
      res.meta.custoEstimadoUsd += r.meta.custoEstimadoUsd;
      if (r.meta.cache === 'hit') res.meta.cacheHits++;
      if (r.meta.modelo && !res.meta.modelos.includes(r.meta.modelo)) res.meta.modelos.push(r.meta.modelo);
      if (!r.ok) {
        if (r.motivo === 'SAIDA_TRUNCADA' && podeDividir && lote.length > 1) {
          const meio = Math.ceil(lote.length / 2);
          await processar(lote.slice(0, meio), false);
          await processar(lote.slice(meio), false);
          return;
        }
        res.lotes++;
        res.lotesComFalha++;
        res.falhas[r.motivo] = (res.falhas[r.motivo] ?? 0) + 1;
        res.motivo ??= r.motivo;
        for (const i of lote) res.naoEnviados.push(comId.porId.get(i.id)!.chave);
        return;
      }
      res.lotes++;
      res.ok = true;
      for (const [id, d] of lerPorId(r.dados.decisoes, lote.map((i) => i.id))) {
        if (d.valor === null) continue;
        res.decisoes.set(comId.porId.get(id)!.chave, {
          valor: d.valor,
          confianca: d.confianca,
          ...(d.motivo ? { motivo: d.motivo } : {}),
        });
      }
    };
    await mapWithConcurrency(lotes, concorrencia, (l) => processar(l, true));
    res.meta.latenciaMs = Math.max(0, this.agora() - inicio);
    return res;
  }

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  private execucaoJson<T>(op: OpcoesGerarJson<T>): Execucao<T> {
    return {
      op,
      modo: 'json',
      interpretar: (conteudo) => interpretarJson(conteudo, op.schema, op.validar),
      revalidar: (valor) => {
        const p = op.schema.safeParse(valor);
        return p.success ? { ok: true, dados: p.data } : { ok: false };
      },
    };
  }

  private async aplicarSegundaOpiniao<T>(
    op: OpcoesGerarJson<T>,
    r: ResultadoIa<T>,
    imagens?: string[],
  ): Promise<ResultadoIa<T>> {
    if (!r.ok || !op.segundaOpiniao) return r;
    const politica = this.config.politicas[familiaDaTarefa(op.tarefa)];
    const rota: RotaModelo = imagens ? 'visao' : (op.rota ?? politica.rotaTexto);
    const modelo2 =
      op.segundaOpiniao.modelo ??
      listaDeModelos(op.modelo, this.config.modelos[rota]).find(
        (m) => m !== r.meta.modelo && (!imagens || capacidadesModelo(m).visao),
      );
    let segunda: SegundaLeituraIa<T>;
    if (!modelo2) segunda = { ok: false, motivo: 'INDISPONIVEL' };
    else {
      // `executar` não olha `segundaOpiniao`: a segunda leitura nunca encadeia uma terceira.
      const r2 = await this.executar({
        ...this.execucaoJson(op),
        ...(imagens ? { imagens } : {}),
        modelosForcados: [modelo2],
        semCache: true,
      });
      segunda = r2.ok
        ? { ok: true, dados: r2.dados, modelo: r2.meta.modelo, divergencias: compararLeituras(r.dados, r2.dados, op.segundaOpiniao.campos) }
        : { ok: false, motivo: r2.motivo };
    }
    return { ...r, segundaLeitura: segunda };
  }

  private disjuntorDaFamilia(familia: FamiliaIa): Disjuntor {
    return familia === 'ocr' ? this.disjuntores.visao : this.disjuntores.texto;
  }

  private semaforoDaFamilia(familia: FamiliaIa): Semaforo {
    let s = this.semaforos.get(familia);
    if (!s) {
      const limite = Math.max(1, Math.min(this.config.politicas[familia].concorrencia, this.config.concorrenciaGlobal));
      s = new Semaforo(limite);
      this.semaforos.set(familia, s);
    }
    return s;
  }

  private orcamentoTokens(resposta: number, cap: CapacidadesModelo, esforco: EsforcoRaciocinio): number {
    // Modelos de raciocínio gastam max_tokens também pensando: reserva separada + piso.
    const total = cap.raciocinio ? Math.max(1024, resposta + RESERVA_RACIOCINIO[esforco]) : resposta;
    return Math.max(16, Math.min(total, cap.maxTokensSaida, this.config.maxTokensTeto));
  }

  private backoff(tentativa: number): number {
    const exp = Math.min(this.config.backoffMaxMs, this.config.backoffBaseMs * 2 ** Math.max(0, tentativa - 1));
    // "Equal jitter": metade fixa + metade aleatória.
    return Math.round(exp / 2 + (exp / 2) * limitar(this.aleatorio(), 0, 1));
  }

  private async executar<T>(e: Execucao<T>): Promise<ResultadoIa<T>> {
    const inicio = this.agora();
    const op = e.op;
    const familia = familiaDaTarefa(op.tarefa);
    const politica = this.config.politicas[familia];
    const ctx = op.contexto;
    const usuarioId = op.usuarioId ?? ctx?.usuarioId ?? null;
    const sensivel = op.sensivel ?? politica.sensivel;
    const meta: MetaIa = {
      tarefa: op.tarefa,
      versaoPrompt: op.versaoPrompt ?? 'v1',
      modelo: null,
      modelosTentados: [],
      latenciaMs: 0,
      tokensEntrada: 0,
      tokensSaida: 0,
      custoEstimadoUsd: 0,
      cache: 'off',
      chamadas: 0,
      reparado: false,
      finishReason: null,
      entrada: relatorioVazio(),
      problemas: [],
    };

    const concluir = (r: ResultadoIa<T>): ResultadoIa<T> => {
      meta.latenciaMs = Math.max(0, this.agora() - inicio);
      this.contabilizar(r, familia, usuarioId);
      try {
        ctx?.uso?.registrar(r);
      } catch {
        // acumulador do chamador nunca derruba a chamada
      }
      return r;
    };
    const falhar = (motivo: MotivoFalhaIa, retryAfterMs?: number): ResultadoIa<T> =>
      concluir({
        ok: false,
        motivo,
        mensagem: MENSAGEM_IA[motivo],
        ...(retryAfterMs !== undefined ? { retryAfterMs: Math.max(0, Math.round(retryAfterMs)) } : {}),
        meta,
      });

    const indisponivel = this.motivoIndisponivel(op.tarefa);
    if (indisponivel || !this.provedorAtual) return falhar(indisponivel ?? 'NAO_CONFIGURADA');
    const provedor = this.provedorAtual;

    const rota: RotaModelo = e.imagens ? 'visao' : (op.rota ?? politica.rotaTexto);
    const modelos = e.modelosForcados ?? listaDeModelos(op.modelo, this.config.modelos[rota]);
    if (modelos.length === 0) return falhar('INDISPONIVEL');

    if (e.imagens) {
      const cap = capacidadesModelo(modelos.find((m) => capacidadesModelo(m).visao) ?? modelos[0]!);
      const v = verificarImagens(e.imagens, cap);
      if (!v.ok) {
        meta.problemas = [v.detalhe];
        return falhar(v.motivo);
      }
    }

    let prompt: PromptMontado;
    try {
      prompt = montarPrompt({
        sistema: op.sistema,
        ...(op.instrucao !== undefined ? { instrucao: op.instrucao } : {}),
        ...(op.dados !== undefined ? { dados: op.dados } : {}),
        ...(op.blocos ? { blocos: op.blocos } : {}),
        imagens: Boolean(e.imagens),
        json: e.modo === 'json',
        mascararPii: op.mascararPii ?? politica.mascararPii,
      });
    } catch {
      return falhar('ENTRADA_INVALIDA');
    }
    meta.entrada = prompt.relatorio;

    // Cache: tarefa + versão do prompt + modelo + prompt final (já mascarado) + hash das imagens.
    const ttl = e.semCache ? 0 : (op.cacheTtlMs ?? (sensivel ? 0 : politica.cacheTtlMs));
    const chave =
      ttl > 0
        ? chaveCache('ia', op.tarefa, meta.versaoPrompt, e.modo, rota, modelos[0], prompt.sistema, prompt.usuario, (e.imagens ?? []).map(sha256))
        : null;
    if (chave) {
      meta.cache = 'miss';
      const emMemoria = this.cache.get(chave);
      const copia = emMemoria ? clonar(emMemoria.dados) : undefined;
      if (emMemoria && copia !== undefined) {
        meta.cache = 'hit';
        meta.modelo = emMemoria.modelo;
        return concluir({ ok: true, dados: copia as T, meta });
      }
      if (this.cachePersistente && !sensivel) {
        const persistido = await this.lerCachePersistente(chave);
        if (persistido) {
          const v = e.revalidar(persistido.dados);
          if (v.ok) {
            const paraMemoria = clonar(v.dados);
            if (paraMemoria !== undefined) this.cache.set(chave, { dados: paraMemoria, modelo: persistido.modelo }, ttl);
            meta.cache = 'hit';
            meta.modelo = persistido.modelo;
            return concluir({ ok: true, dados: v.dados, meta });
          }
        }
      }
    }

    const consumo = this.limitador.consumir(usuarioId ?? '-', familia);
    if (!consumo.ok) return falhar(consumo.motivo, consumo.retryAfterMs);

    const disjuntor = rota === 'visao' ? this.disjuntores.visao : this.disjuntores.texto;
    if (!disjuntor.podeChamar()) return falhar('INDISPONIVEL', disjuntor.restanteMs());

    // Prazo: o menor entre o timeout da tarefa e o prazo total do contexto.
    const agora0 = this.agora();
    const timeoutMs = limitar(op.timeoutMs ?? politica.timeoutMs, 1000, 300_000);
    let prazoFinal = agora0 + timeoutMs;
    let motivoPrazo: MotivoFalhaIa = 'TIMEOUT';
    if (typeof ctx?.prazoFinal === 'number' && ctx.prazoFinal < prazoFinal) {
      prazoFinal = ctx.prazoFinal;
      motivoPrazo = 'PRAZO_ESGOTADO';
    }
    if (prazoFinal <= agora0) return falhar('PRAZO_ESGOTADO');

    const controle = new AbortController();
    let canceladoPorFora = false;
    const aoCancelarFora = () => {
      canceladoPorFora = true;
      controle.abort();
    };
    const externos = [op.signal, ctx?.signal].filter((s): s is AbortSignal => Boolean(s));
    for (const s of externos) {
      if (s.aborted) aoCancelarFora();
      else s.addEventListener('abort', aoCancelarFora, { once: true });
    }
    const timer = setTimeout(() => controle.abort(), prazoFinal - agora0);
    const motivoAbort = (): MotivoFalhaIa => (canceladoPorFora ? 'PRAZO_ESGOTADO' : motivoPrazo);
    const liberar: Array<() => void> = [];
    try {
      if (controle.signal.aborted) return falhar(motivoAbort());
      try {
        liberar.push(await this.semaforoDaFamilia(familia).adquirir(controle.signal));
        liberar.push(await this.semaforoGlobal.adquirir(controle.signal));
      } catch {
        return falhar(motivoAbort());
      }

      const fim = await this.chamarModelos(e, {
        provedor,
        modelos,
        rota,
        politica,
        prompt,
        meta,
        sinal: controle.signal,
        prazoFinal,
        motivoAbort,
      });
      if (fim.ok) {
        disjuntor.sucesso();
        if (chave) {
          const copia = clonar(fim.dados);
          if (copia !== undefined) {
            this.cache.set(chave, { dados: copia, modelo: meta.modelo }, ttl);
            if (this.cachePersistente && !sensivel) void this.gravarCachePersistente(chave, { dados: copia, modelo: meta.modelo }, ttl, op.tarefa);
          }
        }
        return concluir({ ok: true, dados: fim.dados, meta });
      }
      if (fim.contaNoDisjuntor) {
        if (disjuntor.falha()) {
          this.logger?.warn(
            { tarefa: op.tarefa, rota, pausa_ms: this.config.disjuntorPausaMs },
            'ia.disjuntor_aberto: falhas seguidas no provedor; IA pulada temporariamente',
          );
        }
      } else if (meta.chamadas > 0) {
        disjuntor.sucesso(); // o provedor respondeu (o problema foi o conteúdo)
      }
      return falhar(fim.motivo, fim.retryAfterMs);
    } finally {
      clearTimeout(timer);
      for (const s of externos) s.removeEventListener('abort', aoCancelarFora);
      for (const l of liberar.reverse()) l();
    }
  }

  private async chamarModelos<T>(e: Execucao<T>, x: EstadoExecucao): Promise<FimChamada<T>> {
    const { meta, politica, prompt } = x;
    const op = e.op;
    const temperatura = limitar(op.temperatura ?? politica.temperatura, 0, 1);
    const esforco = op.raciocinio ?? politica.raciocinio;
    const seed = seedDaTarefa(op.tarefa);
    const maxTokensResposta = Math.max(16, Math.floor(op.maxTokens ?? politica.maxTokensPadrao));
    const maxReparos = op.tentativasReparo ?? 1;
    const conteudoUsuario: string | ParteConteudoIa[] = e.imagens
      ? [
          { type: 'text', text: prompt.usuario },
          ...e.imagens.map((url): ParteConteudoIa => ({ type: 'image_url', image_url: { url } })),
        ]
      : prompt.usuario;
    const mensagensBase: MensagemIa[] = [
      { role: 'system', content: prompt.sistema },
      { role: 'user', content: conteudoUsuario },
    ];
    const abortado = (): FimChamada<T> => ({ ok: false, motivo: x.motivoAbort(), contaNoDisjuntor: x.motivoAbort() === 'TIMEOUT' });
    let ultima: FimChamada<T> = { ok: false, motivo: 'INDISPONIVEL', contaNoDisjuntor: true };

    modelos: for (const modelo of x.modelos) {
      const cap = capacidadesModelo(modelo);
      if (x.rota === 'visao' && !cap.visao) continue;
      meta.modelosTentados.push(modelo);
      let mensagens = mensagensBase;
      let maxTokens = this.orcamentoTokens(maxTokensResposta, cap, esforco);
      const tetoTokens = Math.min(cap.maxTokensSaida, this.config.maxTokensTeto);
      let retentativas = 0;
      let esperas429 = 0;
      let reparos = 0;
      let comExtras = true;
      let formatoJson = e.modo === 'json';
      let aumentouTokens = false;

      for (;;) {
        const restante = x.prazoFinal - this.agora();
        if (restante <= 0 || x.sinal.aborted) return abortado();
        const req: RequisicaoProvedorIa = {
          modelo,
          mensagens,
          maxTokens,
          temperatura,
          formatoJson,
          ...(comExtras ? { seed, ...(cap.raciocinio ? { esforcoRaciocinio: esforco } : {}) } : {}),
        };
        const t0 = this.agora();
        let resp: RespostaProvedorIa;
        try {
          resp = await this.chamarProvedor(x.provedor, req, restante, x.sinal);
        } catch (err) {
          meta.chamadas++;
          const c = classificarErroProvedor(err);
          this.registro.registrarRequisicaoModelo(modelo, { ok: false, latenciaMs: this.agora() - t0, codigo: c.codigo });
          if (x.sinal.aborted) return abortado();
          const esperar = async (ms: number) => {
            try {
              await this.dormir(ms, x.sinal);
              return true;
            } catch {
              return false;
            }
          };
          switch (c.classe) {
            case 'modelo_indisponivel':
              this.logger?.warn({ tarefa: op.tarefa, modelo, codigo: c.codigo }, 'ia.modelo_indisponivel: tentando o próximo da lista');
              ultima = { ok: false, motivo: 'INDISPONIVEL', contaNoDisjuntor: false };
              continue modelos;
            case 'parametro':
              if (comExtras) {
                comExtras = false; // reenvia sem seed/reasoning_effort
                continue;
              }
              ultima = { ok: false, motivo: 'ERRO', contaNoDisjuntor: false };
              continue modelos;
            case 'json_gerado_invalido':
              // A Groq recusou a geração no modo JSON: tenta sem response_format, extraindo o JSON do texto.
              if (reparos < maxReparos) {
                reparos++;
                formatoJson = false;
                mensagens = [
                  ...mensagensBase,
                  { role: 'user', content: 'A tentativa anterior não gerou JSON válido. Responda SOMENTE com o objeto JSON pedido, sem texto em volta.' },
                ];
                continue;
              }
              meta.problemas = ['json: json_validate_failed'];
              return { ok: false, motivo: 'RESPOSTA_INVALIDA', contaNoDisjuntor: false };
            case 'limite_taxa': {
              const espera = c.retryAfterMs ?? this.backoff(1);
              if (esperas429 < 1 && espera < restante - 250) {
                esperas429++;
                if (!(await esperar(espera))) return abortado();
                continue;
              }
              // Limites da Groq são por modelo: o próximo da lista pode ter folga.
              ultima = { ok: false, motivo: 'LIMITE_TAXA', retryAfterMs: espera, contaNoDisjuntor: true };
              continue modelos;
            }
            case 'transitorio': {
              if (retentativas < this.config.retentativas) {
                retentativas++;
                const espera = Math.min(this.config.backoffMaxMs, Math.max(c.retryAfterMs ?? 0, this.backoff(retentativas)));
                if (espera < restante - 250) {
                  if (!(await esperar(espera))) return abortado();
                  continue;
                }
              }
              ultima = { ok: false, motivo: c.timeout ? 'TIMEOUT' : 'INDISPONIVEL', contaNoDisjuntor: true };
              continue modelos;
            }
            case 'payload':
              return { ok: false, motivo: 'PAYLOAD_GRANDE', contaNoDisjuntor: false };
            case 'autenticacao':
              this.logger?.error({ tarefa: op.tarefa, modelo, codigo: c.codigo }, 'ia.credencial_recusada: verifique GROQ_API_KEY');
              return { ok: false, motivo: 'NAO_CONFIGURADA', contaNoDisjuntor: false };
            case 'abortado':
              return abortado();
            default:
              return { ok: false, motivo: 'ERRO', contaNoDisjuntor: false };
          }
        }

        meta.chamadas++;
        const tokE = resp.uso?.entrada ?? 0;
        const tokS = resp.uso?.saida ?? 0;
        const custo = custoEstimadoUsd(modelo, tokE, tokS);
        meta.tokensEntrada += tokE;
        meta.tokensSaida += tokS;
        meta.custoEstimadoUsd += custo;
        this.limitador.registrarTokens(tokE + tokS);
        this.registro.registrarRequisicaoModelo(modelo, {
          ok: true,
          latenciaMs: this.agora() - t0,
          tokensEntrada: tokE,
          tokensSaida: tokS,
          custoUsd: custo,
        });
        meta.modelo = resp.modelo || modelo;
        meta.finishReason = resp.finishReason;

        const saida = e.interpretar(resp.conteudo ?? '');
        if (saida.ok) {
          meta.reparado = reparos > 0;
          meta.problemas = [];
          return { ok: true, dados: saida.dados };
        }
        if (resp.finishReason === 'length') {
          const novo = Math.min(tetoTokens, maxTokens * 2);
          if (!aumentouTokens && novo > maxTokens) {
            aumentouTokens = true;
            maxTokens = novo;
            continue;
          }
          meta.problemas = ['saida: truncada (finish_reason=length)'];
          return { ok: false, motivo: 'SAIDA_TRUNCADA', contaNoDisjuntor: false };
        }
        meta.problemas = saida.problemas.map((p) => mascararPII(p).slice(0, 160)).slice(0, 12);
        if (reparos < maxReparos) {
          reparos++;
          const anterior = (resp.conteudo ?? '').trim();
          mensagens = [
            ...mensagensBase,
            { role: 'assistant', content: anterior ? anterior.slice(0, 6000) : '(resposta vazia)' },
            { role: 'user', content: mensagemReparo(saida.paraModelo, e.modo) },
          ];
          continue;
        }
        return { ok: false, motivo: 'RESPOSTA_INVALIDA', contaNoDisjuntor: false };
      }
    }
    return ultima;
  }

  /** Uma requisição ao provedor com AbortController próprio (timer limpo no fim). */
  private async chamarProvedor(
    provedor: ProvedorIa,
    req: RequisicaoProvedorIa,
    timeoutMs: number,
    pai: AbortSignal,
  ): Promise<RespostaProvedorIa> {
    const ctrl = new AbortController();
    const abortar = () => ctrl.abort();
    if (pai.aborted) ctrl.abort();
    else pai.addEventListener('abort', abortar, { once: true });
    const timer = setTimeout(abortar, timeoutMs + 50);
    // Mesmo um provedor que ignore o signal não segura a requisição além do prazo.
    const aoAbortar = new Promise<never>((_, rej) => {
      const onAbort = () => rej(new ErroProvedorIa('abortado', 'chamada cancelada'));
      if (ctrl.signal.aborted) onAbort();
      else ctrl.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([provedor.completar(req, { signal: ctrl.signal, timeoutMs }), aoAbortar]);
    } finally {
      clearTimeout(timer);
      pai.removeEventListener('abort', abortar);
    }
  }

  private async lerCachePersistente(chave: string): Promise<{ dados: unknown; modelo: string | null } | null> {
    try {
      const v = await this.cachePersistente?.obter(chave);
      if (!v || typeof v !== 'object' || !('dados' in v)) return null;
      const modelo = (v as { modelo?: unknown }).modelo;
      return { dados: (v as { dados: unknown }).dados, modelo: typeof modelo === 'string' ? modelo : null };
    } catch {
      return null;
    }
  }

  private async gravarCachePersistente(chave: string, valor: unknown, ttlMs: number, tarefa: string): Promise<void> {
    try {
      await this.cachePersistente?.gravar(chave, valor, ttlMs, tarefa);
    } catch {
      // cache persistente é opcional
    }
  }

  /** Contadores + log estruturado SEM conteúdo (nunca prompt, dados ou saída bruta). */
  private contabilizar(r: ResultadoIa<unknown>, familia: FamiliaIa, usuarioId: string | null): void {
    const { meta } = r;
    const registro: RegistroUsoIa = {
      tarefa: meta.tarefa,
      familia,
      modelo: meta.modelo,
      usuarioId,
      latenciaMs: meta.latenciaMs,
      tokensEntrada: meta.tokensEntrada,
      tokensSaida: meta.tokensSaida,
      custoEstimadoUsd: meta.custoEstimadoUsd,
      cache: meta.cache,
      resultado: r.ok ? 'OK' : r.motivo,
      chamadas: meta.chamadas,
      reparado: meta.reparado,
    };
    this.registro.registrarTarefa(registro);
    // Sem IA configurada/desligada não há o que logar a cada chamada (só o contador).
    if (!r.ok && (r.motivo === 'NAO_CONFIGURADA' || r.motivo === 'DESABILITADA') && meta.chamadas === 0) return;
    const campos: Record<string, unknown> = {
      tarefa: meta.tarefa,
      versao_prompt: meta.versaoPrompt,
      modelo: meta.modelo,
      modelos_tentados: meta.modelosTentados,
      latencia_ms: meta.latenciaMs,
      tokens_in: meta.tokensEntrada,
      tokens_out: meta.tokensSaida,
      custo_usd: Math.round(meta.custoEstimadoUsd * 1e6) / 1e6,
      cache: meta.cache,
      chamadas: meta.chamadas,
      reparado: meta.reparado,
      resultado: registro.resultado,
      usuario_id: usuarioId,
      truncado: meta.entrada.truncado,
      itens_omitidos: meta.entrada.itensOmitidos,
      suspeitos_removidos: meta.entrada.suspeitosRemovidos,
      ...(r.ok ? { chaves: chavesDe(r.dados).map((k) => mascararPII(k)) } : { problemas: meta.problemas.length }),
    };
    if (r.ok) this.logger?.info(campos, 'ia.chamada');
    else this.logger?.warn(campos, 'ia.chamada');
    if (this.persistirUso) {
      try {
        void this.persistirUso(registro).catch(() => undefined);
      } catch {
        // persistência de uso é opcional
      }
    }
  }
}

export function criarServicoIa(deps: DependenciasServicoIa): ServicoIa {
  return new ServicoIa(deps);
}
