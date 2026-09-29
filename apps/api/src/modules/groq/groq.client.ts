import Groq from 'groq-sdk';
import { RiskAnalysisResultSchema, type RiskAnalysisResult } from '@rigabras/shared';
import { env, isGroqConfigured } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Wrapper de integração real com a Groq (OpenAI-compatible SDK). Se
 * GROQ_API_KEY não estiver configurada, `isGroqConfigured` é false e o
 * chamador deve tratar isso como uma indisponibilidade previsível (503 /
 * feature desabilitada), sem derrubar o processo do servidor.
 */
let client: Groq | null = null;

function getClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return client;
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
Analise os dados da viagem fornecidos e responda ESTRITAMENTE em JSON, sem nenhum texto
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

export async function analyzeViagemRisk(context: ViagemRiskContext): Promise<RiskAnalysisResult> {
  if (!isGroqConfigured) {
    throw new GroqNotConfiguredError();
  }

  const userPrompt = JSON.stringify(context, null, 2);

  const completion = await getClient().chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Dados da viagem:\n${userPrompt}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Resposta vazia da Groq');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (parseError) {
    logger.error({ raw, parseError }, 'Falha ao fazer parse do JSON retornado pela Groq');
    throw new Error('Resposta da Groq não é um JSON válido');
  }

  const result = RiskAnalysisResultSchema.safeParse(parsedJson);
  if (!result.success) {
    logger.error(
      { raw, issues: result.error.issues },
      'Resposta da Groq não corresponde ao schema esperado',
    );
    throw new Error('Resposta da Groq não corresponde ao schema de RiskAnalysisResult');
  }

  return result.data;
}

const CHATBOT_SYSTEM_PROMPT = `Você é o RIGABRAS AI, assistente operacional interno da Rigabras
Transportes (transporte rodoviário internacional de cargas + Armazém Geral, Uruguaiana/RS).

REGRA DE OURO, inegociável: responda ESTRITAMENTE com base no "SNAPSHOT DE DADOS" fornecido
abaixo, que já foi consultado ao vivo no banco de dados da empresa. NUNCA invente números,
registros ou causas. Se o snapshot não contiver informação suficiente para responder com
segurança, diga literalmente: "Não encontrei dados suficientes nos registros disponíveis para
responder." — nunca tente adivinhar.

Ao responder:
1. Dê uma resposta objetiva, citando os números relevantes do snapshot.
2. Quando fizer sentido, mencione o período/momento da consulta (o snapshot é sempre "agora").
3. Se identificar um problema operacional (atraso, veículo parado, documentação pendente,
   consumo fora do padrão), apresente FATO + DADO + CONTEXTO. Nunca afirme uma causa com
   certeza quando houver apenas uma hipótese — nesse caso diga "possível causa a investigar".
4. Responda em português, em texto corrido (não JSON), de forma direta e profissional.`;

export async function askOperationalQuestion(
  pergunta: string,
  snapshotJson: string,
): Promise<string> {
  if (!isGroqConfigured) {
    throw new GroqNotConfiguredError();
  }

  const completion = await getClient().chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 600,
    messages: [
      { role: 'system', content: CHATBOT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `SNAPSHOT DE DADOS (JSON):\n${snapshotJson}\n\nPERGUNTA: ${pergunta}`,
      },
    ],
  });

  const resposta = completion.choices[0]?.message?.content;
  if (!resposta) {
    throw new Error('Resposta vazia da Groq');
  }
  return resposta.trim();
}

/**
 * Chamada genérica em modo JSON (`response_format: json_object`) usada pelos
 * recursos de IA de importação e insights. Devolve o objeto já parseado —
 * quem chama SEMPRE valida o formato com Zod antes de confiar no conteúdo.
 */
export async function completeJson(
  system: string,
  user: string,
  maxTokens = 1500,
): Promise<unknown> {
  if (!isGroqConfigured) {
    throw new GroqNotConfiguredError();
  }
  const completion = await getClient().chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0.1,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Resposta vazia da Groq');
  }
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    logger.error({ raw, parseError }, 'Groq devolveu JSON inválido');
    throw new Error('Resposta da Groq não é um JSON válido');
  }
}

export class GroqNotConfiguredError extends Error {
  constructor() {
    super(
      'GROQ_API_KEY não configurada - análise de risco por IA está desabilitada neste ambiente',
    );
    this.name = 'GroqNotConfiguredError';
  }
}

/**
 * Chamada com imagens (modelo de visão) em modo JSON — usada pelo OCR de
 * documentos (CNH/CRLV). `imagens` são data URLs (`data:image/jpeg;base64,...`).
 * Quem chama valida o conteúdo com Zod.
 */
const MODELOS_VISAO = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
];

export async function completeJsonComImagens(
  system: string,
  texto: string,
  imagens: string[],
  maxTokens = 1200,
): Promise<unknown> {
  if (!isGroqConfigured) {
    throw new GroqNotConfiguredError();
  }
  const conteudo = [
    { type: 'text' as const, text: texto },
    ...imagens.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ];
  // Modelos de visão da Groq são trocados com frequência: tenta o configurado e, se ele
  // não existir mais (404 model_not_found / descontinuado), os demais conhecidos.
  const modelos = [...new Set([env.GROQ_VISION_MODEL, ...MODELOS_VISAO])];
  let completion: Awaited<ReturnType<ReturnType<typeof getClient>['chat']['completions']['create']>> | null = null;
  let ultimoErro: unknown = null;
  for (const model of modelos) {
    try {
      completion = await getClient().chat.completions.create({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: conteudo },
        ],
      });
      break;
    } catch (err) {
      ultimoErro = err;
      const status = (err as { status?: number }).status;
      const texto = String((err as { message?: string }).message ?? '');
      if (status === 404 || /model_not_found|decommission|does not exist|not support/i.test(texto)) {
        logger.warn({ model }, 'Modelo de visão indisponível na Groq; tentando o próximo');
        continue;
      }
      throw err;
    }
  }
  if (!completion) throw ultimoErro ?? new Error('Nenhum modelo de visão disponível na Groq');
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Resposta vazia da Groq');
  const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  try {
    return JSON.parse(json);
  } catch (parseError) {
    logger.error({ raw, parseError }, 'Groq (visão) devolveu JSON inválido');
    throw new Error('Resposta da Groq não é um JSON válido');
  }
}
