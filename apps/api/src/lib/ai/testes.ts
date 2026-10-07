import { ErroProvedorIa } from './erros.js';
import type { ProvedorIa, RequisicaoProvedorIa, RespostaProvedorIa } from './tipos.js';

/**
 * Provedor falso para o vitest (sem rede e sem `vi.mock` frágil):
 *
 *   const fake = criarProvedorFalso(['{"tipo":"viagens"}']);
 *   ia.setProvider(fake);            // instância padrão
 *   ...
 *   ia.restaurarProvedor();          // afterEach
 *
 * Cada item da lista atende uma requisição (o último se repete). Um item pode
 * ser o texto da resposta, uma resposta parcial (`{ conteudo, finishReason }`),
 * um erro a lançar (ex.: `erroHttpFalso(429, { retryAfterMs: 10 })`) ou uma
 * função `(req, indice, signal) => ...`.
 */

export type ItemRespostaFalsa =
  | string
  | Partial<RespostaProvedorIa>
  | Error
  | ((req: RequisicaoProvedorIa, indice: number, signal: AbortSignal) => ItemRespostaFalsaSimples | Promise<ItemRespostaFalsaSimples>);

type ItemRespostaFalsaSimples = string | Partial<RespostaProvedorIa> | Error;

export interface ProvedorFalso extends ProvedorIa {
  /** Requisições recebidas, em ordem (para asserções de modelo, mensagens, max_tokens...). */
  readonly chamadas: RequisicaoProvedorIa[];
}

export function criarProvedorFalso(respostas: ItemRespostaFalsa | ItemRespostaFalsa[]): ProvedorFalso {
  const lista = Array.isArray(respostas) ? respostas : [respostas];
  const chamadas: RequisicaoProvedorIa[] = [];
  return {
    nome: 'falso',
    chamadas,
    async completar(req, opcoes): Promise<RespostaProvedorIa> {
      const indice = chamadas.length;
      chamadas.push(req);
      const item = lista[Math.min(indice, lista.length - 1)];
      const valor = typeof item === 'function' ? await item(req, indice, opcoes.signal) : item;
      if (valor instanceof Error) throw valor;
      if (valor === undefined) throw new ErroProvedorIa('desconhecido', 'provedor falso sem resposta');
      const parcial: Partial<RespostaProvedorIa> = typeof valor === 'string' ? { conteudo: valor } : valor;
      return {
        conteudo: parcial.conteudo ?? null,
        finishReason: parcial.finishReason ?? 'stop',
        modelo: parcial.modelo ?? req.modelo,
        uso: parcial.uso === undefined ? { entrada: 100, saida: 20 } : parcial.uso,
      };
    },
  };
}

/** Erro HTTP como o provedor Groq normalizado lançaria. */
export function erroHttpFalso(
  status: number,
  opcoes: { codigo?: string; mensagem?: string; retryAfterMs?: number } = {},
): ErroProvedorIa {
  return new ErroProvedorIa('http', opcoes.mensagem ?? `HTTP ${status}`, status, opcoes.codigo, opcoes.retryAfterMs);
}

/** Resposta que só termina quando a chamada é abortada (simula provedor travado). */
export function respostaQueTrava(): ItemRespostaFalsa {
  return (_req, _indice, signal) =>
    new Promise<ItemRespostaFalsaSimples>((_, rej) => {
      const falhar = () => rej(new ErroProvedorIa('abortado', 'cancelada'));
      if (signal.aborted) falhar();
      else signal.addEventListener('abort', falhar, { once: true });
    });
}
