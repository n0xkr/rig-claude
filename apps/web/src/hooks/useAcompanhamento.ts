import { useCallback, useEffect, useState } from 'react';
import type { AcompanhamentoVeiculo, EscopoInsight, InsightsResult, ResumoAcompanhamento } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import type { LoadState } from './useViagens.js';

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado';
}

/** Veículos com estado de acompanhamento + resumo agregado que alimenta os gráficos. */
export function useAcompanhamento() {
  const [state, setState] = useState<LoadState>('idle');
  const [veiculos, setVeiculos] = useState<AcompanhamentoVeiculo[]>([]);
  const [resumo, setResumo] = useState<ResumoAcompanhamento | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((s) => (s === 'success' ? s : 'loading'));
    setError(null);
    try {
      const [lista, res] = await Promise.all([
        api.get<{ data: AcompanhamentoVeiculo[] }>('/acompanhamento/veiculos'),
        api.get<ResumoAcompanhamento>('/acompanhamento/resumo'),
      ]);
      setVeiculos(lista.data);
      setResumo(res);
      setState('success');
    } catch (err) {
      setError(errorMessage(err));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, veiculos, resumo, error, reload: load };
}

/** Gera insights por IA (com fallback por regras no servidor) para um escopo de gráfico. */
export function useInsights(escopo: EscopoInsight) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gerar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.post<InsightsResult>('/acompanhamento/insights', { escopo }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [escopo]);

  return { loading, result, error, gerar };
}
