import { useCallback, useEffect, useState } from 'react';
import type { HistoricoJornadaMotorista } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333/api/v1';

export interface JornadaHistoricoFilterInput {
  periodStart?: string;
  periodEnd?: string;
}

/** Histórico consolidado de jornada de um motorista (Módulo 4, "reduzir a exposição trabalhista"): sessões, tempos e achados de conformidade ADI 5322 — pronto para export. */
export function useJornadaHistorico(
  motoristaId: string | undefined,
  filter: JornadaHistoricoFilterInput,
) {
  const [state, setState] = useState<LoadState>('idle');
  const [historico, setHistorico] = useState<HistoricoJornadaMotorista | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!motoristaId) return;
    setState('loading');
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.periodStart) params.set('periodStart', filter.periodStart);
      if (filter.periodEnd) params.set('periodEnd', filter.periodEnd);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get<HistoricoJornadaMotorista>(
        `/jornada/motoristas/${motoristaId}/historico${query}`,
      );
      setHistorico(data);
      setState('success');
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado',
      );
      setState('error');
    }
  }, [motoristaId, filter.periodStart, filter.periodEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Baixa o histórico em CSV (evidência para fins trabalhistas) — usa fetch bruto pois a resposta não é JSON. */
  const exportarCsv = useCallback(async () => {
    if (!motoristaId) return;
    const params = new URLSearchParams({ format: 'csv' });
    if (filter.periodStart) params.set('periodStart', filter.periodStart);
    if (filter.periodEnd) params.set('periodEnd', filter.periodEnd);
    const token = localStorage.getItem('rigabras_access_token');
    const response = await fetch(
      `${API_BASE_URL}/jornada/motoristas/${motoristaId}/historico?${params.toString()}`,
      {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!response.ok) throw new Error('Falha ao exportar histórico em CSV');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jornada-${motoristaId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [motoristaId, filter.periodStart, filter.periodEnd]);

  return { state, historico, error, reload: load, exportarCsv };
}
