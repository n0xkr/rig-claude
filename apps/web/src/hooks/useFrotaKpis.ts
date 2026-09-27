import { useCallback, useEffect, useState } from 'react';
import type { FrotaKpiResponse } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

export interface FrotaKpiFilterInput {
  veiculoId?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** KPIs de frota (Módulo 4, parte A): km rodado/vazio, custo/km, consumo médio, ocupação, disponíveis x em viagem — filtráveis por período e por veículo. */
export function useFrotaKpis(filter: FrotaKpiFilterInput) {
  const [state, setState] = useState<LoadState>('idle');
  const [kpis, setKpis] = useState<FrotaKpiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.veiculoId) params.set('veiculoId', filter.veiculoId);
      if (filter.periodStart) params.set('periodStart', filter.periodStart);
      if (filter.periodEnd) params.set('periodEnd', filter.periodEnd);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get<FrotaKpiResponse>(`/frota/kpis${query}`);
      setKpis(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [filter.veiculoId, filter.periodStart, filter.periodEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, kpis, error, reload: load };
}
