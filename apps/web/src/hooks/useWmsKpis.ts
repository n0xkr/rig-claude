import { useCallback, useEffect, useState } from 'react';
import type { WmsKpiResponse } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

export interface WmsKpiFilterInput {
  armazemId?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** KPIs do Armazém Geral (Módulo 5, critério #6): ocupação, giro de estoque, avarias por severidade. */
export function useWmsKpis(filter: WmsKpiFilterInput) {
  const [state, setState] = useState<LoadState>('idle');
  const [kpis, setKpis] = useState<WmsKpiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.armazemId) params.set('armazemId', filter.armazemId);
      if (filter.periodStart) params.set('periodStart', filter.periodStart);
      if (filter.periodEnd) params.set('periodEnd', filter.periodEnd);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get<WmsKpiResponse>(`/wms/kpis${query}`);
      setKpis(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [filter.armazemId, filter.periodStart, filter.periodEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, kpis, error, reload: load };
}
