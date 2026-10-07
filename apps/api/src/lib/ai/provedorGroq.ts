import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import { ErroProvedorIa } from './erros.js';
import { mascararPII } from './pii.js';
import type { EsforcoRaciocinio, ProvedorIa, RequisicaoProvedorIa, RespostaProvedorIa } from './tipos.js';

/**
 * Transporte Groq (groq-sdk 0.7). Um único client por processo, sem as
 * retentativas do SDK (`maxRetries: 0`): retry, backoff, fallback de modelo
 * e disjuntor ficam no serviço, que conhece o prazo total da requisição. O
 * AbortSignal vai ao SDK por `RequestOptions.signal`.
 */

/** O SDK 0.7 não tipa `reasoning_effort`; estendemos os params sem `any`. */
type ParametrosGroq = ChatCompletionCreateParamsNonStreaming & {
  reasoning_effort?: EsforcoRaciocinio;
};

function lerRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as Record<string, string | null | undefined>;
  const ms = Number(h['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const bruto = h['retry-after'];
  if (!bruto) return undefined;
  const seg = Number(bruto);
  if (Number.isFinite(seg)) return Math.max(0, seg * 1000);
  const data = Date.parse(bruto);
  return Number.isFinite(data) ? Math.max(0, data - Date.now()) : undefined;
}

/** Código curto do erro da Groq ("model_not_found", "json_validate_failed"...), sem conteúdo. */
function codigoDoErro(err: { error?: unknown }): string | undefined {
  const corpo = err.error as { error?: { code?: unknown; type?: unknown }; code?: unknown; type?: unknown } | undefined;
  const c = corpo?.error?.code ?? corpo?.code ?? corpo?.error?.type ?? corpo?.type;
  return typeof c === 'string' ? c.slice(0, 60) : undefined;
}

/**
 * Normaliza qualquer erro do SDK em `ErroProvedorIa`. A mensagem é mascarada
 * e limitada; o corpo bruto (que pode ter `failed_generation` com dados do
 * documento) é descartado.
 */
export function normalizarErroGroq(err: unknown): ErroProvedorIa {
  if (err instanceof ErroProvedorIa) return err;
  const msg = mascararPII(String((err as { message?: unknown })?.message ?? 'erro')).slice(0, 200);
  if (err instanceof Groq.APIUserAbortError) return new ErroProvedorIa('abortado', msg);
  if (err instanceof Groq.APIConnectionTimeoutError) return new ErroProvedorIa('timeout', msg);
  if (err instanceof Groq.APIConnectionError) return new ErroProvedorIa('rede', msg);
  if (err instanceof Groq.APIError) {
    return new ErroProvedorIa('http', msg, err.status, codigoDoErro(err), lerRetryAfter(err.headers));
  }
  if ((err as { name?: unknown })?.name === 'AbortError') return new ErroProvedorIa('abortado', msg);
  return new ErroProvedorIa('desconhecido', msg);
}

export function criarProvedorGroq(config: { apiKey: string; baseURL?: string }): ProvedorIa {
  let client: Groq | null = null;
  const obterClient = () => {
    client ??= new Groq({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: 120_000,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    return client;
  };

  return {
    nome: 'groq',
    async completar(req: RequisicaoProvedorIa, opcoes): Promise<RespostaProvedorIa> {
      const corpo: ParametrosGroq = {
        model: req.modelo,
        messages: req.mensagens,
        max_tokens: req.maxTokens,
        temperature: req.temperatura,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
        ...(req.formatoJson ? { response_format: { type: 'json_object' as const } } : {}),
        ...(req.esforcoRaciocinio ? { reasoning_effort: req.esforcoRaciocinio } : {}),
      };
      try {
        const c = await obterClient().chat.completions.create(corpo, {
          signal: opcoes.signal,
          timeout: Math.max(1000, Math.floor(opcoes.timeoutMs)),
          maxRetries: 0,
        });
        const escolha = c.choices[0];
        return {
          conteudo: escolha?.message?.content ?? null,
          finishReason: escolha?.finish_reason ?? null,
          modelo: c.model || req.modelo,
          uso: c.usage
            ? { entrada: c.usage.prompt_tokens ?? 0, saida: c.usage.completion_tokens ?? 0 }
            : null,
        };
      } catch (err) {
        throw normalizarErroGroq(err);
      }
    },
  };
}
