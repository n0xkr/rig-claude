import { useCallback, useEffect, useState } from 'react';
import type { StatusFreteHistorico } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

/** Histórico de transições do fechamento de um frete (Módulo 3, critério #1). */
export function useFreteStatusHistory(freteId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [historico, setHistorico] = useState<StatusFreteHistorico[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!freteId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<StatusFreteHistorico[]>(`/fretes/${freteId}/status-history`);
      setHistorico(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [freteId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, historico, error, reload: load };
}
