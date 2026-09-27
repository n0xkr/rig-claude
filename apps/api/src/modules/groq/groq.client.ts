import Groq from "groq-sdk";
import { RiskAnalysisResultSchema, type RiskAnalysisResult } from "@rigabras/shared";
import { env, isGroqConfigured } from "../../config/env.js";
import { logger } from "../../config/logger.js";

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
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Dados da viagem:\n${userPrompt}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Resposta vazia da Groq");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (parseError) {
    logger.error({ raw, parseError }, "Falha ao fazer parse do JSON retornado pela Groq");
    throw new Error("Resposta da Groq não é um JSON válido");
  }

  const result = RiskAnalysisResultSchema.safeParse(parsedJson);
  if (!result.success) {
    logger.error({ raw, issues: result.error.issues }, "Resposta da Groq não corresponde ao schema esperado");
    throw new Error("Resposta da Groq não corresponde ao schema de RiskAnalysisResult");
  }

  return result.data;
}

export class GroqNotConfiguredError extends Error {
  constructor() {
    super("GROQ_API_KEY não configurada - análise de risco por IA está desabilitada neste ambiente");
    this.name = "GroqNotConfiguredError";
  }
}
