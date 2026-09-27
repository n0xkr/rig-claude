import { useCallback, useEffect, useState } from 'react';
import type { ViagemWmsStatus } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

/** Módulo 6 (Integração TMS+WMS): expedição/recebimento do armazém vinculados a uma viagem, se houver. */
export function useViagemWmsStatus(viagemId: string | undefined) {
  const [state, setState] = useState<LoadState>('idle');
  const [status, setStatus] = useState<ViagemWmsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!viagemId) return;
    setState('loading');
    setError(null);
    try {
      const data = await api.get<ViagemWmsStatus>(`/viagens/${viagemId}/wms-status`);
      setStatus(data);
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

  return { state, status, error, reload: load };
}
