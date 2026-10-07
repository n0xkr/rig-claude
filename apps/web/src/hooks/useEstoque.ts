import { useCallback, useEffect, useState } from 'react';
import type {
  MovimentacaoEstoque,
  MovimentacaoManualEstoqueInput,
  SaldoEstoque,
} from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

export interface EstoqueFilter {
  armazemId?: string;
  produtoId?: string;
  q?: string;
}

/** Saldos do estoque por produto/endereço (Módulo 5, WMS). */
export function useSaldosEstoque(filter: EstoqueFilter) {
  const [state, setState] = useState<LoadState>('idle');
  const [saldos, setSaldos] = useState<SaldoEstoque[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.armazemId) params.set('armazemId', filter.armazemId);
      if (filter.produtoId) params.set('produtoId', filter.produtoId);
      if (filter.q) params.set('q', filter.q);
      const query = params.toString();
      const result = await api.get<{ data: SaldoEstoque[] }>(
        `/wms/estoque${query ? `?${query}` : ''}`,
      );
      setSaldos(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [filter.armazemId, filter.produtoId, filter.q]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, saldos, error, reload: load };
}

/** Últimas movimentações do ledger (histórico de entradas/saídas). */
export function useMovimentacoesEstoque(produtoId?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const query = produtoId ? `?produtoId=${produtoId}` : '';
      const result = await api.get<{ data: MovimentacaoEstoque[] }>(
        `/wms/estoque/movimentacoes${query}`,
      );
      setMovimentacoes(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [produtoId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, movimentacoes, error, reload: load };
}

/** Lança uma movimentação manual (entrada/saída/transferência) no ledger. */
export function useMovimentarEstoque() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movimentar = useCallback(async (input: MovimentacaoManualEstoqueInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<MovimentacaoEstoque>('/wms/estoque/movimentacoes', input);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { movimentar, submitting, error };
}
