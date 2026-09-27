import { useCallback, useEffect, useState } from 'react';
import type { StatusViagemHistorico } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

/** Histórico de transições de status de uma viagem (Módulo 2, critério #1). */
export function useViagemStatusHistory(viagemId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [historico, setHistorico] = useState<StatusViagemHistorico[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!viagemId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<StatusViagemHistorico[]>(`/viagens/${viagemId}/status-history`);
      setHistorico(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [viagemId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, historico, error, reload: load };
}
