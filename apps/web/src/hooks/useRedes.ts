import { useCallback, useEffect, useState } from 'react';
import type {
  CreateRedeInput,
  CreateRedeMovimentacaoInput,
  Rede,
  RedesKpi,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

export interface FiltroRedes {
  status?: string;
  condicao?: string;
  q?: string;
}

interface ListResponse {
  data: Rede[];
  nextCursor: string | null;
}

function montarQuery(filtro: FiltroRedes): string {
  const params = new URLSearchParams({ limit: '100' });
  if (filtro.status) params.set('status', filtro.status);
  if (filtro.condicao) params.set('condicao', filtro.condicao);
  if (filtro.q) params.set('q', filtro.q);
  return params.toString();
}

/** Painel de redes: lista com filtros (código/condição/status). */
export function useRedesList(filtro: FiltroRedes) {
  const [state, setState] = useState<LoadState>('idle');
  const [redes, setRedes] = useState<Rede[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { status, condicao, q } = filtro;

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const result = await api.get<ListResponse>(`/wms/redes?${montarQuery({ status, condicao, q })}`);
      setRedes(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [status, condicao, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, redes, error, reload: load };
}

/** Relatório em tempo real: contagens do painel com auto-refresh (20s). */
export function useRedesKpis(autoRefreshMs = 20_000) {
  const [state, setState] = useState<LoadState>('idle');
  const [kpis, setKpis] = useState<RedesKpi | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<RedesKpi>('/wms/redes/kpis');
      setKpis(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
    if (autoRefreshMs <= 0) return;
    const id = window.setInterval(() => {
      void load();
    }, autoRefreshMs);
    return () => window.clearInterval(id);
  }, [load, autoRefreshMs]);

  return { state, kpis, error, reload: load };
}

/** Cadastro de rede — o código RED-###### é gerado no servidor. */
export function useCreateRede() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateRedeInput): Promise<Rede | null> => {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Rede>('/wms/redes', input);
      return created;
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { create, submitting, error };
}

/** Retirada/devolução de rede (movimentação do painel). */
export function useMovimentarRede() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movimentar = useCallback(
    async (redeId: string, input: CreateRedeMovimentacaoInput) => {
      setSubmitting(true);
      setError(null);
      try {
        return await api.post<{ rede: Rede }>(`/wms/redes/${redeId}/movimentacoes`, input);
      } catch (err) {
        setError(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
        );
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { movimentar, submitting, error };
}

/** Exclusão (soft delete) de rede — recusada pelo backend se estiver em trânsito. */
export function useDeleteRede() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (redeId: string): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/wms/redes/${redeId}`);
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { remove, submitting, error };
}
