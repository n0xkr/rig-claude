import { z } from 'zod';
import { RiskAnalysisResultSchema, type RiskAnalysisResult } from '@rigabras/shared';
import {
  ia,
  erroIaDeFalha,
  AiNotConfiguredError,
  type BlocoDadosIa,
  type ContextoIa,
} from '../../lib/ai/index.js';

/**
 * LEGADO — wrappers mantidos para não quebrar os consumidores atuais. Todos
 * delegam ao AIService (`lib/ai`), que agora cuida de prazo, retry/backoff,
 * fallback de modelo (texto e visão), disjuntor, cota por usuário/tarefa,
 * cache, envelope anti-injection e log sem conteúdo.
 *
 * Código novo deve usar `gerarJson` / `visaoJson` / `gerarTexto` de
 * `lib/ai/index.js`, que NÃO lançam (devolvem `{ ok: false, motivo }`).
 * Estes wrappers lançam: `GroqNotConfiguredError` (alias de
 * `AiNotConfiguredError`, 503) quando a IA não está configurada ou foi
 * desligada, e as demais subclasses de `AiError` nas outras falhas.
 */

/** Alias compatível: `instanceof GroqNotConfiguredError` continua valendo para AiNotConfiguredError/AiDisabledError. */
export { AiNotConfiguredError as GroqNotConfiguredError };

/** Opções extras (opcionais) aceitas pelos wrappers legados. */
export interface OpcoesLegadoIa {
  /** Tarefa "familia.subtarefa" — define cota, kill switch e roteamento de modelo. */
  tarefa?: string;
  usuarioId?: string | null;
  contexto?: ContextoIa;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** O legado montava a mensagem do usuário com JSON: volta a ser objeto para ir num bloco <dados> estruturado. */
function comoDado(texto: string): unknown {
  const t = texto.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch {
      // JSON cortado pelo chamador antigo (`.slice`): vai como texto
    }
  }
  return texto;
}

function extras(o: OpcoesLegadoIa | undefined) {
  return {
    ...(o?.usuarioId !== undefined ? { usuarioId: o.usuarioId } : {}),
    ...(o?.contexto ? { contexto: o.contexto } : {}),
    ...(o?.signal ? { signal: o.signal } : {}),
    ...(o?.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
  };
}

export interface ViagemRiskContext {
  numeroCrt: string | null;
  origem: string;
  destino: string;
  paisDestino: string | null;
  status: string;
  dataProgramacao: string;
  dataColeta: string | null;
  dataInicioViagem: string | null;
  eventosRiscoRecentes: Array<{ tipo: string; severidade: string; descricao: string }>;
}

const SYSTEM_PROMPT = `Você é um analista de risco de uma transportadora rodoviária internacional
(Rigabras Transportes, Uruguaiana/RS, Brasil - fronteira com Paso de los Libres/Argentina).
Analise os dados da viagem do bloco "viagem" e responda ESTRITAMENTE em JSON, sem nenhum texto
adicional, seguindo exatamente este formato:
{
  "riskLevel": "BAIXA" | "MEDIA" | "ALTA" | "CRITICA",
  "isAnomaly": boolean,
  "reasoning": string,
  "recommendedActions": string[],
  "confidence": number entre 0 e 1
}
Considere fatores como: atraso entre datas programadas e reais, histórico de eventos de risco
da viagem, rota internacional (travessia de fronteira Uruguaiana/Paso de los Libres),
severidade e recorrência de eventos.`;

/** @deprecated legado — prefira `gerarJson({ tarefa: 'risco.viagem', ... })`. */
export async function analyzeViagemRisk(
  context: ViagemRiskContext,
  opcoes?: OpcoesLegadoIa,
): Promise<RiskAnalysisResult> {
  const r = await ia.gerarJson({
    tarefa: opcoes?.tarefa ?? 'risco.viagem',
    versaoPrompt: 'legado-v1',
    sistema: SYSTEM_PROMPT,
    instrucao: 'Analise o risco desta viagem.',
    blocos: [{ nome: 'viagem', valor: context, maxItens: 20, maxCharsPorCampo: 600 }],
    schema: RiskAnalysisResultSchema,
    maxTokens: 800,
    temperatura: 0.1,
    ...extras(opcoes),
  });
  if (r.ok) return r.dados;
  throw erroIaDeFalha(r);
}

const CHATBOT_SYSTEM_PROMPT = `Você é o RIGABRAS AI, assistente operacional interno da Rigabras
Transportes (transporte rodoviário internacional de cargas + Armazém Geral, Uruguaiana/RS).

REGRA DE OURO, inegociável: responda ESTRITAMENTE com base no bloco de dados "snapshot"
fornecido, que já foi consultado ao vivo no banco de dados da empresa. NUNCA invente números,
registros ou causas. Se o snapshot não contiver informação suficiente para responder com
segurança, diga literalmente: "Não encontrei dados suficientes nos registros disponíveis para
responder." — nunca tente adivinhar. A pergunta do usuário está no bloco "pergunta".

Ao responder:
1. Dê uma resposta objetiva, citando os números relevantes do snapshot.
2. Quando fizer sentido, mencione o período/momento da consulta (o snapshot é sempre "agora").
3. Se identificar um problema operacional (atraso, veículo parado, documentação pendente,
   consumo fora do padrão), apresente FATO + DADO + CONTEXTO. Nunca afirme uma causa com
   certeza quando houver apenas uma hipótese — nesse caso diga "possível causa a investigar".
4. Responda em português, em texto corrido (não JSON), de forma direta e profissional.`;

/** @deprecated legado — prefira `gerarTexto({ tarefa: 'chatbot.pergunta', ... , validar })`. */
export async function askOperationalQuestion(
  pergunta: string,
  snapshotJson: string,
  opcoes?: OpcoesLegadoIa,
): Promise<string> {
  const blocos: BlocoDadosIa[] = [
    { nome: 'snapshot', valor: comoDado(snapshotJson), maxItens: 100, maxCharsPorCampo: 300, maxChars: 40_000 },
    { nome: 'pergunta', valor: pergunta, maxCharsPorCampo: 2000 },
  ];
  const r = await ia.gerarTexto({
    tarefa: opcoes?.tarefa ?? 'chatbot.pergunta',
    versaoPrompt: 'legado-v1',
    sistema: CHATBOT_SYSTEM_PROMPT,
    instrucao: 'Responda à pergunta do bloco "pergunta" usando somente o bloco "snapshot".',
    blocos,
    maxTokens: 600,
    temperatura: 0.1,
    ...extras(opcoes),
  });
  if (r.ok) return r.dados.trim();
  throw erroIaDeFalha(r);
}

/**
 * @deprecated legado — prefira `gerarJson({ tarefa, schema, ... })`, que valida
 * e repara a resposta. Chamada genérica em modo JSON: devolve o objeto já
 * parseado e quem chama SEMPRE valida o formato com Zod antes de confiar.
 */
export async function completeJson(
  system: string,
  user: string,
  maxTokens = 1500,
  opcoes?: OpcoesLegadoIa,
): Promise<unknown> {
  const r = await ia.gerarJson({
    tarefa: opcoes?.tarefa ?? 'geral.json',
    versaoPrompt: 'legado-v1',
    sistema: system,
    // Teto estrutural (o legado fazia `.slice` no JSON pronto): reduz listas/textos até caber.
    blocos: [{ nome: 'entrada', valor: comoDado(user), maxItens: 500, maxCharsPorCampo: 2000, maxChars: 60_000 }],
    schema: z.unknown(),
    maxTokens,
    cacheTtlMs: 0,
    ...extras(opcoes),
  });
  if (r.ok) return r.dados;
  throw erroIaDeFalha(r);
}

/**
 * @deprecated legado — prefira `visaoJson({ tarefa: 'ocr.cnh', schema, imagens, ... })`.
 * Chamada com imagens (modelo de visão, com a lista de reserva do catálogo)
 * em modo JSON — usada pelo OCR de documentos (CNH/CRLV). `imagens` são data
 * URLs (`data:image/jpeg;base64,...`). Quem chama valida o conteúdo com Zod.
 */
export async function completeJsonComImagens(
  system: string,
  texto: string,
  imagens: string[],
  maxTokens = 1200,
  opcoes?: OpcoesLegadoIa,
): Promise<unknown> {
  const r = await ia.visaoJson({
    tarefa: opcoes?.tarefa ?? 'ocr.documento',
    versaoPrompt: 'legado-v1',
    sistema: system,
    instrucao: texto,
    imagens,
    schema: z.unknown(),
    maxTokens,
    sensivel: true,
    ...extras(opcoes),
  });
  if (r.ok) return r.dados;
  throw erroIaDeFalha(r);
}
