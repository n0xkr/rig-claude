import { useCallback, useEffect, useState } from 'react';
import type { RastreioProduto } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

/** Rastreabilidade de um produto (Módulo 5, WMS, critério #6): histórico completo de movimentações + saldo atual. */
export function useRastreioProduto(produtoId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [rastreio, setRastreio] = useState<RastreioProduto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!produtoId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<RastreioProduto>(`/wms/produtos/${produtoId}/rastreio`);
      setRastreio(data);
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

  return { state, rastreio, error, reload: load };
}
