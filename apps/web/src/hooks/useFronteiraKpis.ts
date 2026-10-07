import { useCallback, useEffect, useState } from 'react';
import type { FronteiraKpiResponse } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

export interface FronteiraKpiFilterInput {
  rota?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** KPIs agregados de fronteira: tempo parado, desembaraço, retenção, custo, performance (Módulo 2, critério #2). */
export function useFronteiraKpis(filter: FronteiraKpiFilterInput) {
  const [state, setState] = useState<LoadState>('idle');
  const [kpis, setKpis] = useState<FronteiraKpiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.rota) params.set('rota', filter.rota);
      if (filter.periodStart) params.set('periodStart', filter.periodStart);
      if (filter.periodEnd) params.set('periodEnd', filter.periodEnd);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get<FronteiraKpiResponse>(`/fronteira/kpis${query}`);
      setKpis(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [filter.rota, filter.periodStart, filter.periodEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, kpis, error, reload: load };
}
