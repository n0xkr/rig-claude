import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IaEntidade,
  IaSolicitacao,
  ResultadoDecisao,
  ResumoSolicitacoes,
  StatusSolicitacao,
  TipoSolicitacao,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

interface ListResponse {
  data: IaSolicitacao[];
  nextCursor: string | null;
}

function mensagemErro(err: unknown): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado';
}

export interface FiltrosSolicitacoesIa {
  status?: StatusSolicitacao;
  tipo?: TipoSolicitacao;
  entidade?: IaEntidade;
  datasetId?: string;
  /** Oculta esse status da lista (filtrado na API e reforçado no cliente). */
  excluirStatus?: StatusSolicitacao;
  limit?: number;
}

/** Lista paginada por cursor das solicitações da IA (mais recentes primeiro). */
export function useSolicitacoesIa(filtros: FiltrosSolicitacoesIa = {}) {
  const { status, tipo, entidade, datasetId, excluirStatus, limit = 30 } = filtros;
  const [itens, setItens] = useState<IaSolicitacao[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Descarta respostas de requisições antigas (troca rápida de filtro/aba).
  const requisicaoAtual = useRef(0);

  const carregar = useCallback(
    async (cursor?: string) => {
      const id = ++requisicaoAtual.current;
      if (cursor) setCarregandoMais(true);
      else setCarregando(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        if (excluirStatus) params.set('excluirStatus', excluirStatus);
        if (tipo) params.set('tipo', tipo);
        if (entidade) params.set('entidade', entidade);
        if (datasetId) params.set('datasetId', datasetId);
        if (cursor) params.set('cursor', cursor);
        const res = await api.get<ListResponse>(`/ia-solicitacoes?${params.toString()}`);
        if (id !== requisicaoAtual.current) return;
        const novos = excluirStatus ? res.data.filter((s) => s.status !== excluirStatus) : res.data;
        setItens((prev) => (cursor ? [...prev, ...novos] : novos));
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (id !== requisicaoAtual.current) return;
        setErro(mensagemErro(err));
      } finally {
        if (id === requisicaoAtual.current) {
          setCarregando(false);
          setCarregandoMais(false);
        }
      }
    },
    [status, tipo, entidade, datasetId, excluirStatus, limit],
  );

  useEffect(() => {
    setItens([]);
    setNextCursor(null);
    void carregar();
  }, [carregar]);

  const carregarMais = useCallback(async () => {
    if (nextCursor) await carregar(nextCursor);
  }, [carregar, nextCursor]);

  const recarregar = useCallback(() => carregar(), [carregar]);

  return {
    itens,
    carregando,
    carregandoMais,
    erro,
    temMais: nextCursor !== null,
    carregarMais,
    recarregar,
  };
}

/** Contadores de solicitações (badge do menu e chips da página), com polling opcional. */
export function useResumoSolicitacoesIa(opcoes: { pollMs?: number } = {}) {
  const { pollMs } = opcoes;
  const [resumo, setResumo] = useState<ResumoSolicitacoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const res = await api.get<ResumoSolicitacoes>('/ia-solicitacoes/resumo');
      setResumo(res);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    if (!pollMs || pollMs <= 0) return undefined;
    const timer = window.setInterval(() => void recarregar(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, recarregar]);

  return { resumo, carregando, erro, recarregar };
}

/** Identificador usado em `processandoId` durante a aprovação em lote. */
export const PROCESSANDO_LOTE = '__lote__';

/**
 * Decisões do administrador. Cada função devolve o resultado (ou `null` se a chamada falhou —
 * nesse caso `erro` traz a mensagem). Um `status` ERRO no retorno significa que a
 * requisição foi aceita mas a gravação falhou (ver campo `erro` da solicitação).
 */
export function useDecisoesSolicitacoesIa() {
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const executar = useCallback(async <T>(id: string, chamada: () => Promise<T>): Promise<T | null> => {
    setProcessandoId(id);
    setErro(null);
    try {
      return await chamada();
    } catch (err) {
      setErro(mensagemErro(err));
      return null;
    } finally {
      setProcessandoId(null);
    }
  }, []);

  const aprovar = useCallback(
    (id: string) => executar(id, () => api.post<IaSolicitacao>(`/ia-solicitacoes/${id}/aprovar`)),
    [executar],
  );

  const recusar = useCallback(
    (id: string, motivo?: string) => {
      const limpo = motivo?.trim();
      return executar(id, () =>
        api.post<IaSolicitacao>(`/ia-solicitacoes/${id}/recusar`, limpo ? { motivo: limpo } : {}),
      );
    },
    [executar],
  );

  const responder = useCallback(
    (id: string, resposta: { opcao?: string; texto?: string }) =>
      executar(id, () => api.post<IaSolicitacao>(`/ia-solicitacoes/${id}/responder`, resposta)),
    [executar],
  );

  const aprovarLote = useCallback(
    async (ids: string[]): Promise<ResultadoDecisao[] | null> => {
      const res = await executar(PROCESSANDO_LOTE, () =>
        api.post<{ resultados: ResultadoDecisao[] }>('/ia-solicitacoes/aprovar-lote', { ids }),
      );
      return res ? res.resultados : null;
    },
    [executar],
  );

  const limparErro = useCallback(() => setErro(null), []);

  return { aprovar, recusar, responder, aprovarLote, processandoId, erro, limparErro };
}
