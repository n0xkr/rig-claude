import { useCallback, useEffect, useState } from 'react';
import type { CreateProdutoArmazenadoInput, ProdutoArmazenado } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

interface ListResponse {
  data: ProdutoArmazenado[];
  nextCursor: string | null;
}

/** Lista de produtos armazenados (Módulo 5, WMS — catálogo SKU por depositante), com filtro opcional por depositante. */
export function useProdutosList(depositanteId?: string) {
  const [state, setState] = useState<LoadState>('idle');
  const [produtos, setProdutos] = useState<ProdutoArmazenado[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const query = depositanteId ? `&depositanteId=${depositanteId}` : '';
      const result = await api.get<ListResponse>(`/wms/produtos?limit=100${query}`);
      setProdutos(result.data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [depositanteId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, produtos, error, reload: load };
}

export function useCreateProduto() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateProdutoArmazenadoInput) => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<ProdutoArmazenado>('/wms/produtos', input);
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
